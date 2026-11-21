/** ipp license set：规则引擎推导 policy → setLicense */
import { readFileSync, existsSync } from "node:fs";
import { keccak256, toHex } from "viem";
import { sha256Hex, adviceFor } from "@ipp/core";
import { loadConfig, publicClient, walletClient, REGISTRY_ABI } from "./ctx.js";

export async function licenseSet(spdx: string, termsFile?: string, contact?: string) {
  const cfg = loadConfig();
  let termsHash: `0x${string}` = "0x" + "00".repeat(32) as `0x${string}`;
  if (termsFile) {
    if (!existsSync(termsFile)) throw new Error(`条款文件不存在: ${termsFile}`);
    termsHash = await sha256Hex(new Uint8Array(readFileSync(termsFile))) as `0x${string}`;
  }
  const advice = adviceFor(spdx, termsHash !== ("0x" + "00".repeat(32)));
  // policy 枚举序号（合约 CommercialPolicy）
  const POLICY = ["UNSPECIFIED", "PERMISSIVE", "WEAK_COPYLEFT", "STRONG_COPYLEFT", "NETWORK_COPYLEFT", "NONCOMMERCIAL", "SOURCE_AVAILABLE", "PROPRIETARY"] as const;
  const policyIdx = POLICY.indexOf(advice.policy as typeof POLICY[number]);
  if (policyIdx < 0) throw new Error(`未知 policy: ${advice.policy}`);

  const { wc, account } = await walletClient();
  const client = publicClient();
  const hash = await wc.writeContract({
    address: cfg.contract,
    abi: REGISTRY_ABI,
    functionName: "setLicense",
    args: [cfg.workId, spdx, termsHash, policyIdx, contact ?? ""],
    account,
    chain: client.chain,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("setLicense 交易失败");

  console.log("✓ 许可已登记（只追加，历史可查）");
  console.log("  spdx:", spdx, "| policy:", advice.policy, "| 风险:", advice.riskLevel);
  console.log("  义务提示:", advice.obligations.join("；"));
  console.log("  ", advice.disclaimer);
}
