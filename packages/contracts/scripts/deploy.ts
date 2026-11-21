import hre from "hardhat";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 部署 IPPassportRegistry + ExampleSkillMarket。
 * - 本地：npx hardhat run scripts/deploy.ts（默认 hardhat 网络，测试用）
 * - Monad 测试网：IPP_PRIVATE_KEY=... npx hardhat run scripts/deploy.ts --network monad
 * 部署后写 deployments/<chainId>.json，供 CLI 与前端读取。
 * 私钥只从环境变量 IPP_PRIVATE_KEY 读取，绝不写入任何文件。
 */
async function main() {
  const conn = await hre.network.connect();
  const { viem } = conn;
  const registry = await viem.deployContract("IPPassportRegistry");
  const market = await viem.deployContract("ExampleSkillMarket", [registry.address]);
  const client = await viem.getPublicClient();
  const chainId = await client.getChainId();

  const out = {
    chainId: Number(chainId),
    network: conn.networkName,
    deployedAt: new Date().toISOString(),
    contracts: {
      IPPassportRegistry: registry.address,
      ExampleSkillMarket: market.address,
    },
  };
  mkdirSync(resolve(__dirname, "../../../deployments"), { recursive: true });
  const file = resolve(__dirname, "../../../deployments", `${Number(chainId)}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");

  console.log("IPPassportRegistry :", registry.address);
  console.log("ExampleSkillMarket :", market.address);
  console.log("chainId:", Number(chainId));
  console.log("written:", file);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
