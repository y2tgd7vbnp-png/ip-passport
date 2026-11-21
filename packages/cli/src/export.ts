/** ipp export：证据包（5.6）——只含一条路径 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import JSZip from "jszip";
import { merkleProve, buildMerkle, type Manifest } from "@ipp/core";
import { IPP_DIR, loadConfig } from "./ctx.js";

function loadManifest(vr: string): Manifest {
  const p = resolve(IPP_DIR, "versions", `${vr}.json`);
  if (!existsSync(p)) throw new Error(`清单不存在: ${p}`);
  return JSON.parse(readFileSync(p, "utf-8")) as Manifest;
}

/** 沿 prevVersionRoot 回溯到首版，返回路径（旧→新） */
function chainTo(target: Manifest, all: Manifest[]): Manifest[] {
  const byRoot = new Map(all.map((m) => [m.versionRoot, m]));
  const path: Manifest[] = [];
  let cur: Manifest | undefined = target;
  while (cur) {
    path.unshift(cur);
    const prev: string = cur.prevVersionRoot;
    cur = prev === "0x" + "00".repeat(32) ? undefined : byRoot.get(prev);
  }
  return path;
}

export async function exportCmd(versionRoot: string, discloseGlob?: string, redactPaths = false, out = "evidence.zip") {
  const cfg = loadConfig();
  const dir = resolve(IPP_DIR, "versions");
  const all = readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf-8")) as Manifest);
  const target = all.find((m) => m.versionRoot === versionRoot || m.versionRoot.startsWith(versionRoot));
  if (!target) throw new Error("目标版本不在本地清单中");
  const path = chainTo(target, all);

  // 披露集合（简化 glob：仅支持精确文件名或 * 后缀匹配）
  const disclosed = new Set<string>();
  if (discloseGlob) {
    for (const m of path) {
      for (const f of m.files) {
        const name = basename(f.path);
        if (discloseGlob === "*" || name === discloseGlob || (discloseGlob.startsWith("*.") && name.endsWith(discloseGlob.slice(1)))) {
          disclosed.add(`${m.versionRoot}/${f.path}`);
        }
      }
    }
  }

  const zip = new JSZip();
  zip.file("README.txt", [
    "IP Passport 证据包 / Evidence package",
    "=====================================",
    "本包只包含目标版本路径（不含其他作品/版本）。",
    "验证方式：打开 Web 验证页拖入本 zip，浏览器本地重算哈希，不上传任何文件。",
    "Verify: open the /verify page and drop this zip — hashes are recomputed locally in your browser; nothing is uploaded.",
    "",
    `workId: ${cfg.workId}`,
    `目标版本: ${target.versionRoot}`,
  ].join("\n"));

  // manifest-chain.json（只含该路径；未披露文件不出现在 disclosed/ 之外的内容）
  const chainManifests = path.map((m) => ({
    ...m,
    files: m.files.map((f) => ({
      path: redactPaths && !disclosed.has(`${m.versionRoot}/${f.path}`) ? "<redacted>" : f.path,
      fileDigest: f.fileDigest,
      salt: disclosed.has(`${m.versionRoot}/${f.path}`) ? f.salt : undefined,
      leaf: f.leaf,
    })),
    // 路径外版本不保留 anchor 详情以外字段
  }));
  zip.file("manifest-chain.json", JSON.stringify(chainManifests, null, 2));

  // disclosed/：原文件
  const proofs: any[] = [];
  for (const m of path) {
    const leaves = m.files.map((f) => f.leaf as `0x${string}`);
    const { root } = await buildMerkle(leaves);
    if (root !== m.fileRoot) throw new Error(`fileRoot 不一致: ${m.versionRoot}`);
    for (const f of m.files) {
      if (disclosed.has(`${m.versionRoot}/${f.path}`)) {
        const content = readFileSync(f.path);
        zip.file(`disclosed/${m.versionRoot}/${basename(f.path)}`, content);
        const { proof } = await merkleProve(leaves, f.leaf as `0x${string}`);
        proofs.push({ versionRoot: m.versionRoot, path: redactPaths ? basename(f.path) : f.path, salt: f.salt, leaf: f.leaf, proof });
      }
    }
  }
  zip.file("proofs.json", JSON.stringify(proofs, null, 2));

  // chain.json
  zip.file("chain.json", JSON.stringify({
    chainId: cfg.chainId,
    contract: cfg.contract,
    versions: path.map((m) => ({
      versionRoot: m.versionRoot,
      kind: m.meta.kind,
      createdAtLocal: m.meta.createdAtLocal,
      txHash: m.anchor.txHash ?? null,
      blockNumber: m.anchor.blockNumber ?? null,
      blockTimestamp: m.anchor.blockTimestamp ?? null,
    })),
  }, null, 2));

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const { writeFileSync } = await import("node:fs");
  const name = out === "evidence.zip"
    ? `evidence-${cfg.workId.slice(2, 10)}-${target.versionRoot.slice(2, 10)}.zip`
    : out;
  writeFileSync(name, buf);
  console.log("✓ 证据包已导出:", name);
  console.log("  包含版本数:", path.length, "| 披露文件数:", disclosed.size);
}
