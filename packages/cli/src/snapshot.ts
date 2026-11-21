/** ipp snapshot：计算叶子/版本根，写清单，锚定（或入队） */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { sha256Hex, computeLeaf, randomSalt, bytesToHex, computeMetaHash, computeVersionRoot, buildMerkle, type Manifest, type Hex32 } from "@ipp/core";
import { IPP_DIR, loadConfig, saveConfig, publicClient, walletClient, REGISTRY_ABI, KIND_ORDER } from "./ctx.js";

function hexToB(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array((h.match(/../g) ?? []).map((x: string) => parseInt(x, 16)));
}

async function fileDigest(path: string): Promise<Hex32> {
  const buf = readFileSync(path);
  return sha256Hex(new Uint8Array(buf)) as Promise<Hex32>;
}

export async function snapshotCmd(paths: string[], kind: string, note: string, queue: boolean) {
  if (!KIND_ORDER.includes(kind as typeof KIND_ORDER[number])) {
    throw new Error(`--kind 必须是 ${KIND_ORDER.slice(0, 4).join(" | ")}`);
  }
  const cfg = loadConfig();

  // 1. 每文件：digest + salt + leaf
  const files: { path: string; fileDigest: string; salt: string; leaf: string }[] = [];
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`文件不存在: ${p}`);
    const fd = await fileDigest(p);
    const salt = bytesToHex(randomSalt());
    const leaf = await computeLeaf(hexToB(salt), hexToB(fd));
    files.push({ path: p, fileDigest: fd, salt, leaf });
  }

  // 2. fileRoot（升序 Merkle，5.2）
  const leaves = files.map((f) => f.leaf as `0x${string}`);
  const { root: fileRoot } = await buildMerkle(leaves);

  // 3. metaHash + versionRoot（5.3）
  const meta = {
    kind: kind as "PROMPT" | "DRAFT" | "COMMIT" | "RELEASE",
    createdAtLocal: new Date().toISOString(),
    note,
  };
  const metaHash = await computeMetaHash(meta);
  const versionRoot = await computeVersionRoot(cfg.workId, cfg.headVersion, fileRoot, metaHash);

  // 4. 清单（5.5）
  const manifest: Manifest = {
    schema: "ipp.version.v1",
    workId: cfg.workId,
    versionRoot,
    prevVersionRoot: cfg.headVersion,
    fileRoot,
    meta,
    files,
    anchor: { mode: queue ? "batch" : "single" },
    license: { spdx: "", termsHash: null },
  };

  const versionsDir = resolve(IPP_DIR, "versions");
  mkdirSync(versionsDir, { recursive: true });
  writeFileSync(resolve(versionsDir, `${versionRoot}.json`), JSON.stringify(manifest, null, 2) + "\n");

  if (queue) {
    console.log("✓ 已入队（ipp flush 时批量上链）");
    console.log("  versionRoot:", versionRoot);
    return;
  }

  // 5. 立即锚定
  const { wc, account } = await walletClient();
  const client = publicClient();
  const kindIdx = KIND_ORDER.indexOf(kind as typeof KIND_ORDER[number]);
  const hash = await wc.writeContract({
    address: cfg.contract,
    abi: REGISTRY_ABI,
    functionName: "anchorVersion",
    args: [cfg.workId, versionRoot, cfg.headVersion, kindIdx],
    account,
    chain: client.chain,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("anchorVersion 交易失败");
  const block = await client.getBlock({ blockHash: receipt.blockHash });

  manifest.anchor = {
    mode: "single",
    txHash: hash,
    chainId: cfg.chainId,
    contract: cfg.contract,
    blockNumber: Number(receipt.blockNumber),
    blockTimestamp: Number(block.timestamp),
  };
  writeFileSync(resolve(versionsDir, `${versionRoot}.json`), JSON.stringify(manifest, null, 2) + "\n");

  cfg.headVersion = versionRoot;
  saveConfig(cfg);

  console.log("✓ 版本已锚定");
  console.log("  versionRoot:", versionRoot);
  console.log("  tx:", hash);
  console.log("  block:", Number(receipt.blockNumber), "时间:", new Date(Number(block.timestamp) * 1000).toISOString());
}
