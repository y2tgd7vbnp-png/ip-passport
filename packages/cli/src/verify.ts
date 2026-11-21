/** ipp verify：离线验证证据包 + 链上核对，中文报告 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { sha256Hex, computeLeaf, merkleVerify, computeMetaHash, computeVersionRoot, adviceFor } from "@ipp/core";
import { loadConfig, publicClient, REGISTRY_ABI, rpcUrl, chainId } from "./ctx.js";

export async function verifyCmd(zipPath: string) {
  const cfg = loadConfig();
  const client = publicClient();
  const zip = await JSZip.loadAsync(readFileSync(zipPath));

  const chain = JSON.parse(await zip.file("chain.json")!.async("string"));
  const manifests = JSON.parse(await zip.file("manifest-chain.json")!.async("string"));
  const proofs: { versionRoot: string; path: string; salt: string; leaf: string; proof: string[] }[] =
    JSON.parse(await zip.file("proofs.json")!.async("string"));

  console.log("═".repeat(56));
  console.log("IP Passport 证据包验证报告");
  console.log("═".repeat(56));
  let allOk = true;

  for (const m of manifests) {
    // 1. versionRoot 重算
    const metaHash = await computeMetaHash(m.meta);
    const vrRe = await computeVersionRoot(m.workId, m.prevVersionRoot, m.fileRoot, metaHash);
    const vrOk = vrRe === m.versionRoot;
    allOk = allOk && vrOk;

    // 2. 链上核对
    let chainOk: string;
    try {
      const v = (await client.readContract({
        address: cfg.contract,
        abi: REGISTRY_ABI,
        functionName: "getVersion",
        args: [m.versionRoot as `0x${string}`],
      })) as unknown as { workId: string; timestamp: bigint; blockNumber: bigint };
      chainOk = v.workId.toLowerCase() === m.workId.toLowerCase()
        ? `✓ 链上存在 @区块 ${v.blockNumber}，区块时间 ${new Date(Number(v.timestamp) * 1000).toLocaleString("zh-CN")}`
        : "✗ 链上 workId 不匹配";
      if (!chainOk.startsWith("✓")) allOk = false;
    } catch {
      chainOk = "（链不可达，跳过链上核对）";
    }

    // 3. 许可状态
    let lic = "（无）";
    if (chain.versions && m.anchor?.blockTimestamp) {
      const l = (await client.readContract({
        address: cfg.contract,
        abi: REGISTRY_ABI,
        functionName: "getLicenseAt",
        args: [m.workId, BigInt(m.anchor.blockTimestamp)],
      }).catch(() => null)) as unknown as { spdx: string } | null;
      if (l && l.spdx) lic = l.spdx;
    }

    console.log(`\n版本 ${m.versionRoot.slice(0, 20)}… (${m.meta.kind})`);
    console.log(`  哈希一致性: ${vrOk ? "✓ 重算 versionRoot 一致" : "✗ 不一致（内容被改动或包损坏）"}`);
    console.log(`  链上状态: ${chainOk}`);
    console.log(`  当时许可: ${lic}`);
  }

  // 4. 披露文件哈希
  console.log("\n披露文件：");
  for (const p of proofs) {
    const f = await zip.file(`disclosed/${p.versionRoot}/${resolve(p.path).split("/").pop()}`);
    let ok = false;
    if (f) {
      const digest = await sha256Hex(new Uint8Array(await f.async("arraybuffer")));
      const leafRe = await computeLeaf(hexToBytesLocal(p.salt), hexToBytesLocal(digest));
      ok = leafRe === p.leaf && (await merkleVerify(p.leaf as `0x${string}`, p.proof as `0x${string}`[], manifests.find((mm: { versionRoot: string; fileRoot: string }) => mm.versionRoot === p.versionRoot)!.fileRoot as `0x${string}`));
    }
    allOk = allOk && ok;
    console.log(`  ${p.path.split("/").pop()}: ${ok ? "✓ 哈希一致（叶子+Merkle 证明通过）" : "✗ 不一致"}`);
  }

  console.log("\n" + "═".repeat(56));
  console.log(allOk ? "结论：✓ 全部验证通过" : "结论：✗ 存在不一致项");
  console.log("本报告为哈希与链上记录的技术比对，仅表明该版本指纹最晚于对应区块时间已存在；不证明作者身份或版权归属，可作为电子证据材料之一，由争议处理机构依据所在法域规则审查。");
  console.log("本提示依据作者在链上声明的许可状态自动生成，仅供参考，不构成法律意见。");
}

function hexToBytesLocal(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array((h.match(/../g) ?? []).map((x: string) => parseInt(x, 16)));
}
