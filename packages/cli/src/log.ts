/** ipp log：本地版本链 + 链上状态 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { IPP_DIR, loadConfig, publicClient, REGISTRY_ABI } from "./ctx.js";
import type { Manifest } from "@ipp/core";

export async function logCmd() {
  const cfg = loadConfig();
  const dir = resolve(IPP_DIR, "versions");
  if (!existsSync(dir)) { console.log("（暂无版本）"); return; }
  const client = publicClient();

  const manifests: Manifest[] = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf-8")))
    .sort((a, b) => (a.meta.createdAtLocal < b.meta.createdAtLocal ? -1 : 1));

  console.log(`作品 ${cfg.workId}`);
  console.log("版本链：");
  for (const m of manifests) {
    let onChain = "";
    if (m.anchor.txHash) {
      const v = (await client.readContract({
        address: cfg.contract,
        abi: REGISTRY_ABI,
        functionName: "getVersion",
        args: [m.versionRoot as `0x${string}`],
      })) as unknown as { workId: `0x${string}` };
      onChain = v.workId === ("0x" + "00".repeat(32)) ? "未上链" : `已上链 @区块 ${m.anchor.blockNumber}`;
    } else {
      onChain = "队列中";
    }
    const lic = m.license.spdx ? ` | 许可 ${m.license.spdx}` : "";
    console.log(`  ${m.versionRoot.slice(0, 18)}… ${m.meta.kind.padEnd(8)} ${m.meta.createdAtLocal} ${onChain}${lic}`);
  }
}
