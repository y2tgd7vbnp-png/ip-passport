import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.IPP_RPC_URL ?? "http://127.0.0.1:8545";
const PK = process.env.IPP_PRIVATE_KEY;

async function main() {
  if (!PK) throw new Error("IPP_PRIVATE_KEY required");
  const raw = await (await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }) })).json();
  const chainIdNum = typeof raw.result === "string" ? parseInt(raw.result, 16) : Number(raw.result);
  const chain = { id: chainIdNum, name: "ipp-chain", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
  const pc = createPublicClient({ chain, transport: http(RPC) });
  const account = privateKeyToAccount(PK as `0x${string}`);
  const wc = createWalletClient({ account, chain, transport: http(RPC) });

  // 编译产物（artifacts 由 hardhat compile 生成）
  const artDir = resolve(__dirname, "../artifacts/contracts");
  const reg = JSON.parse(readFileSync(resolve(artDir, "IPPassportRegistry.sol/IPPassportRegistry.json"), "utf-8"));
  const mkt = JSON.parse(readFileSync(resolve(artDir, "ExampleSkillMarket.sol/ExampleSkillMarket.json"), "utf-8"));

  const regHash = await wc.deployContract({ abi: reg.abi, bytecode: reg.bytecode, account });
  const regRcpt = await pc.waitForTransactionReceipt({ hash: regHash });
  const regAddr = regRcpt.contractAddress!;

  const mktHash = await wc.deployContract({ abi: mkt.abi, bytecode: mkt.bytecode, account, args: [regAddr] });
  const mktRcpt = await pc.waitForTransactionReceipt({ hash: mktHash });
  const mktAddr = mktRcpt.contractAddress!;

  const chainId = await pc.getChainId();
  const out = { chainId: Number(chainId), deployedAt: new Date().toISOString(), contracts: { IPPassportRegistry: regAddr, ExampleSkillMarket: mktAddr } };
  mkdirSync(resolve(__dirname, "../../../deployments"), { recursive: true });
  const file = resolve(__dirname, "../../../deployments", `${Number(chainId)}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log("IPPassportRegistry:", regAddr);
  console.log("ExampleSkillMarket:", mktAddr);
  console.log("chainId:", Number(chainId), "→", file);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
