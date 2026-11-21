/** 共享上下文：配置读写、链客户端、ABI */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type PublicClient, type WalletClient, type Address } from "viem";
import type { Account } from "viem/accounts";
import * as viemChains from "viem/chains";

export const IPP_DIR = ".ipp";

export type IppConfig = {
  workId: `0x${string}`;
  repo?: string;
  repoKey?: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  contract: Address;
  headVersion: `0x${string}`;
};

export function configPath(): string {
  return resolve(IPP_DIR, "config.json");
}

export function loadConfig(): IppConfig {
  if (!existsSync(configPath())) {
    throw new Error("未找到 .ipp/config.json。请先在项目目录运行 ipp init");
  }
  return JSON.parse(readFileSync(configPath(), "utf-8")) as IppConfig;
}

export function saveConfig(cfg: IppConfig): void {
  mkdirSync(IPP_DIR, { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + "\n");
}

export function loadDeployments(chainId: number): { IPPassportRegistry: Address } {
  // 从 monorepo 根 deployments/<chainId>.json 读
  const p = resolve(process.cwd(), "../../deployments", `${chainId}.json`);
  const p2 = resolve(process.cwd(), "deployments", `${chainId}.json`);
  for (const cand of [p, p2]) {
    if (existsSync(cand)) {
      const d = JSON.parse(readFileSync(cand, "utf-8"));
      return d.contracts;
    }
  }
  throw new Error(`未找到 deployments/${chainId}.json，请先部署合约`);
}

export function rpcUrl(): string {
  return process.env.IPP_RPC_URL ?? process.env.MONAD_RPC_URL ?? "http://127.0.0.1:8545";
}

export function chainId(): number {
  return Number(process.env.IPP_CHAIN_ID ?? process.env.MONAD_CHAIN_ID ?? 31337);
}

export function publicClient(): PublicClient {
  const id = chainId();
  const chain = id === 10143
    ? { ...viemChains.foundry, id: 10143, name: "Monad Testnet", rpcUrls: { default: { http: [rpcUrl()] } } }
    : { ...viemChains.foundry, id, name: `chain-${id}`, rpcUrls: { default: { http: [rpcUrl()] } } };
  return createPublicClient({ chain, transport: http(rpcUrl()) });
}

export function requirePrivateKey(): `0x${string}` {
  const pk = process.env.IPP_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    throw new Error("缺少环境变量 IPP_PRIVATE_KEY（0x 前缀 64 位十六进制私钥）。出于安全考虑不从文件读取。");
  }
  return pk as `0x${string}`;
}

export async function walletClient(): Promise<{ wc: WalletClient; account: Account }> {
  const pk = requirePrivateKey();
  const acct = await privateKeyToAccountLocal(pk);
  const wc = createWalletClient({ account: acct, chain: publicClient().chain, transport: http(rpcUrl()) });
  return { wc, account: acct };
}

async function privateKeyToAccountLocal(pk: `0x${string}`) {
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(pk);
}

export function repoKeyOf(repo: string): `0x${string}` {
  return keccak256(toHex(new TextEncoder().encode(repo.toLowerCase())));
}

/** Registry ABI（只列 CLI 用到的） */
export const REGISTRY_ABI = [
  { type: "function", name: "registerWork", stateMutability: "nonpayable", inputs: [{ name: "salt", type: "bytes32" }, { name: "metaHash", type: "bytes32" }, { name: "repoKey", type: "bytes32" }], outputs: [{ name: "", type: "bytes32" }] },
  { type: "function", name: "anchorVersion", stateMutability: "nonpayable", inputs: [{ name: "workId", type: "bytes32" }, { name: "versionRoot", type: "bytes32" }, { name: "prevRoot", type: "bytes32" }, { name: "kind", type: "uint8" }], outputs: [] },
  { type: "function", name: "setLicense", stateMutability: "nonpayable", inputs: [{ name: "workId", type: "bytes32" }, { name: "spdx", type: "string" }, { name: "termsHash", type: "bytes32" }, { name: "policy", type: "uint8" }, { name: "contactURI", type: "string" }], outputs: [] },
  { type: "function", name: "getWork", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "tuple", components: [{ name: "owner", type: "address" }, { name: "metaHash", type: "bytes32" }, { name: "repoKey", type: "bytes32" }, { name: "headVersion", type: "bytes32" }, { name: "createdAt", type: "uint64" }] }] },
  { type: "function", name: "getVersion", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "tuple", components: [{ name: "workId", type: "bytes32" }, { name: "prevRoot", type: "bytes32" }, { name: "timestamp", type: "uint64" }, { name: "blockNumber", type: "uint64" }, { name: "kind", type: "uint8" }] }] },
  { type: "function", name: "getLicenseAt", stateMutability: "view", inputs: [{ name: "workId", type: "bytes32" }, { name: "timestamp", type: "uint64" }], outputs: [{ name: "", type: "tuple", components: [{ name: "spdx", type: "string" }, { name: "termsHash", type: "bytes32" }, { name: "policy", type: "uint8" }, { name: "contactURI", type: "string" }, { name: "effectiveFromVersion", type: "bytes32" }, { name: "effectiveFrom", type: "uint64" }] }] },
  { type: "function", name: "getLicenseHistory", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "tuple[]", components: [{ name: "spdx", type: "string" }, { name: "termsHash", type: "bytes32" }, { name: "policy", type: "uint8" }, { name: "contactURI", type: "string" }, { name: "effectiveFromVersion", type: "bytes32" }, { name: "effectiveFrom", type: "uint64" }] }] },
  { type: "function", name: "getWorksByRepo", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "bytes32[]" }] },
  { type: "event", name: "WorkRegistered", inputs: [{ name: "workId", type: "bytes32", indexed: true }, { name: "owner", type: "address", indexed: true }, { name: "metaHash", type: "bytes32" }, { name: "repoKey", type: "bytes32" }] },
] as const;

/** 版本 kind 枚举序号 */
export const KIND_ORDER = ["PROMPT", "DRAFT", "COMMIT", "RELEASE", "BATCH"] as const;
