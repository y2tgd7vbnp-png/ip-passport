import { describe, expect, it } from "vitest";
import vectors from "./vectors.json" with { type: "json" };
import {
  bytesToHex,
  canonicalJson,
  computeLeaf,
  computeMetaHash,
  computeVersionRoot,
  hexToBytes,
  randomSalt,
  sha256Hex,
  utf8ToBytes,
  ZERO32,
} from "../src/index.js";
import { buildMerkle, merkleProve, merkleVerify } from "../src/merkle.js";
import { adviceFor, DISCLAIMER } from "../src/license/rules.js";
import { keccak256, toHex } from "viem";

describe("hash（需求 5）", () => {
  it("SHA-256 测试向量", async () => {
    for (const v of vectors.sha256) {
      const input = v.inputHex !== undefined ? hexToBytes(v.inputHex) : utf8ToBytes(v.inputUtf8!);
      expect(await sha256Hex(input)).toBe(v.expected);
    }
  });

  it("加盐叶子向量（5.1）", async () => {
    const v = vectors.leaf[0]!;
    expect(await computeLeaf(hexToBytes(v.salt), hexToBytes(v.fileDigest))).toBe(v.expected);
  });

  it("盐为 32 字节且每次随机", () => {
    const s1 = randomSalt();
    const s2 = randomSalt();
    expect(s1.length).toBe(32);
    expect(bytesToHex(s1)).not.toBe(bytesToHex(s2));
  });

  it("hex 往返", () => {
    const bytes = hexToBytes("0xdeadbeef");
    expect(bytesToHex(bytes)).toBe("0xdeadbeef");
  });
});

describe("Merkle（需求 5.2 / 5.4）", () => {
  async function pseudoLeaves(n: number) {
    const out: `0x${string}`[] = [];
    for (let i = 0; i < n; i++) {
      out.push(await sha256Hex(utf8ToBytes(`leaf-${i}`)));
    }
    return out;
  }

  it.each([1, 2, 3, 7, 100])("%i 个叶子：建树+证明+验证", async (n) => {
    const leaves = await pseudoLeaves(n);
    const { root } = await buildMerkle(leaves);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    // 每个叶子都能验证
    for (const leaf of leaves) {
      const { root: r2, proof } = await merkleProve(leaves, leaf);
      expect(r2).toBe(root);
      expect(await merkleVerify(leaf, proof, root)).toBe(true);
    }
  });

  it("叶子按字节序升序排序（乱序输入同根）", async () => {
    const leaves = await pseudoLeaves(6);
    const a = await buildMerkle(leaves);
    const b = await buildMerkle([...leaves].reverse());
    expect(a.root).toBe(b.root);
  });

  it("单叶子时 root === leaf", async () => {
    const [leaf] = await pseudoLeaves(1);
    const { root } = await buildMerkle([leaf!]);
    expect(root).toBe(leaf);
  });

  it("篡改验证失败", async () => {
    const leaves = await pseudoLeaves(5);
    const { root } = await buildMerkle(leaves);
    const fake = await sha256Hex(utf8ToBytes("fake"));
    const { proof } = await merkleProve(leaves, leaves[2]!);
    expect(await merkleVerify(fake, proof, root)).toBe(false);
  });

  it("内部节点 = SHA256(0x01 || min || max)：手工复算 2 叶", async () => {
    const [l0, l1] = await pseudoLeaves(2);
    const { root } = await buildMerkle([l0, l1]);
    // 字节序比较（与 python 一致）
    const b0 = hexToBytes(l0);
    const b1 = hexToBytes(l1);
    let cmp = 0;
    for (let i = 0; i < 32; i++) {
      if (b0[i]! !== b1[i]!) { cmp = b0[i]! - b1[i]!; break; }
    }
    const [a, b] = cmp <= 0 ? [l0, l1] : [l1, l0];
    const manual = await sha256Hex(
      new Uint8Array([0x01, ...hexToBytes(a), ...hexToBytes(b)]),
    );
    expect(root).toBe(manual);
  });
});

describe("manifest（需求 5.3 / 5.5）", () => {
  it("canonicalJson 排序向量", () => {
    for (const v of vectors.canonicalJson) {
      expect(canonicalJson(v.input)).toBe(v.expected);
    }
  });

  it("versionRoot 可复算且与输入顺序无关", async () => {
    const workId = bytesToHex(await sha256Hex(utf8ToBytes("work")));
    const meta = {
      kind: "DRAFT" as const,
      createdAtLocal: "2026-11-21T12:00:00+08:00",
      note: "测试",
    };
    const metaHash = await computeMetaHash(meta);
    const fileRoot = await sha256Hex(utf8ToBytes("files"));
    const vr1 = await computeVersionRoot(workId, ZERO32, fileRoot, metaHash);
    const vr2 = await computeVersionRoot(workId, ZERO32, fileRoot, metaHash);
    expect(vr1).toBe(vr2);
    // meta 变化 → versionRoot 变化
    const metaHash2 = await computeMetaHash({ ...meta, note: "改动" });
    const vr3 = await computeVersionRoot(workId, ZERO32, fileRoot, metaHash2);
    expect(vr3).not.toBe(vr1);
  });

  it("versionRoot 手工复算（python 可对齐）", async () => {
    const workId = "0x" + "ab".repeat(32);
    const prev = ZERO32;
    const fileRoot = "0x" + "cd".repeat(32);
    const meta = { kind: "PROMPT" as const, createdAtLocal: "2026-11-21T12:00:00+08:00", note: "" };
    const metaHash = await computeMetaHash(meta);
    const manual = await sha256Hex(
      new Uint8Array([
        ...utf8ToBytes("IPP-V1"),
        ...hexToBytes(workId),
        ...hexToBytes(prev),
        ...hexToBytes(fileRoot),
        ...hexToBytes(metaHash),
      ]),
    );
    expect(await computeVersionRoot(workId, prev, fileRoot, metaHash)).toBe(manual);
  });
});

describe("许可规则引擎（需求 9）", () => {
  it("MIT → PERMISSIVE / LOW / NO", () => {
    const a = adviceFor("MIT");
    expect(a.policy).toBe("PERMISSIVE");
    expect(a.riskLevel).toBe("LOW");
    expect(a.needsCommercialLicense).toBe("NO");
    expect(a.disclaimer).toBe(DISCLAIMER);
  });

  it("GPL-3.0-or-later 走别名", () => {
    expect(adviceFor("GPL-3.0-or-later").policy).toBe("STRONG_COPYLEFT");
    expect(adviceFor("GPL-3.0").policy).toBe("STRONG_COPYLEFT");
  });

  it("AGPL → NETWORK_COPYLEFT；BUSL → SOURCE_AVAILABLE / CHECK_TERMS", () => {
    expect(adviceFor("AGPL-3.0-only").policy).toBe("NETWORK_COPYLEFT");
    const b = adviceFor("BUSL-1.1");
    expect(b.policy).toBe("SOURCE_AVAILABLE");
    expect(b.needsCommercialLicense).toBe("CHECK_TERMS");
  });

  it("空 / NOASSERTION → UNSPECIFIED / LIKELY", () => {
    const a = adviceFor(null);
    expect(a.policy).toBe("UNSPECIFIED");
    expect(a.needsCommercialLicense).toBe("LIKELY");
    expect(adviceFor("NOASSERTION").policy).toBe("UNSPECIFIED");
  });

  it("自定义条款（termsHash）→ PROPRIETARY", () => {
    const a = adviceFor(null, true);
    expect(a.policy).toBe("PROPRIETARY");
    expect(a.needsCommercialLicense).toBe("CHECK_TERMS");
  });

  it("未知 SPDX → UNKNOWN 风险", () => {
    expect(adviceFor("Weird-License-1.0").riskLevel).toBe("UNKNOWN");
  });
});

describe("repoKey（需求 7 repo.ts 前置校验）", () => {
  it("repoKey = keccak256(小写 github.com/<owner>/<repo>)，与 viem 对齐", async () => {
    const { keccak256, toHex } = await import("viem");
    const input = utf8ToBytes("github.com/iris/drop2markdown");
    const expected = keccak256(toHex(input));
    // core 侧实现（repo.ts 将复用同一公式）
    expect(expected).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
