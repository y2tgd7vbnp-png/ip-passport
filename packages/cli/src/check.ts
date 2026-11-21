/** ipp check：当前/指定时间点的许可与义务提示 */
import { loadConfig, publicClient, REGISTRY_ABI, repoKeyOf } from "./ctx.js";
import { adviceFor } from "@ipp/core";

export async function checkCmd(idOrRepo: string, at?: string) {
  const client = publicClient();
  const cfg = loadConfig();
  let workId: `0x${string}`;
  if (idOrRepo.startsWith("github.com/")) {
    const rk = repoKeyOf(idOrRepo);
    const ids = (await client.readContract({
      address: cfg.contract,
      abi: REGISTRY_ABI,
      functionName: "getWorksByRepo",
      args: [rk],
    })) as `0x${string}`[];
    if (!ids || ids.length === 0) throw new Error("该仓库尚未登记任何作品");
    workId = ids[0]!;
    console.log("仓库", idOrRepo, "→ workId", workId);
  } else {
    workId = idOrRepo as `0x${string}`;
  }

  const ts = at ? BigInt(at) : BigInt(Math.floor(Date.now() / 1000));
  const licArr = (await client.readContract({
    address: cfg.contract,
    abi: REGISTRY_ABI,
    functionName: "getLicenseAt",
    args: [workId, ts],
  })) as unknown as { spdx: string; termsHash: `0x${string}`; policy: number; contactURI: string; effectiveFrom: bigint };
  const lic = licArr;

  const POLICY = ["UNSPECIFIED", "PERMISSIVE", "WEAK_COPYLEFT", "STRONG_COPYLEFT", "NETWORK_COPYLEFT", "NONCOMMERCIAL", "SOURCE_AVAILABLE", "PROPRIETARY"];
  const advice = adviceFor(lic.spdx || null, lic.termsHash !== ("0x" + "00".repeat(32) as `0x${string}`));

  console.log("═".repeat(50));
  console.log(`查询时间点: ${new Date(Number(ts) * 1000).toLocaleString("zh-CN")}`);
  console.log(`许可: ${lic.spdx || "（未声明）"} (${POLICY[Number(lic.policy)]})`);
  if (lic.contactURI) console.log(`联系: ${lic.contactURI}`);
  console.log(`生效自: ${new Date(Number(lic.effectiveFrom) * 1000).toLocaleString("zh-CN")}`);
  console.log(`风险等级: ${advice.riskLevel}`);
  console.log("义务提示:");
  for (const o of advice.obligations) console.log("  •", o);
  console.log(`商用授权: ${advice.needsCommercialLicense}`);
  console.log("─".repeat(50));
  console.log(advice.disclaimer);
}
