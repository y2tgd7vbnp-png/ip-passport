/** ipp init：注册作品 + 建 .ipp/ */
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toHex } from "viem";
import { IPP_DIR, loadDeployments, publicClient, walletClient, repoKeyOf, rpcUrl, chainId, REGISTRY_ABI } from "./ctx.js";
import { randomSalt, bytesToHex } from "@ipp/core";

export async function registerAndInit(repo?: string) {
  const { wc, account } = await walletClient();
  const client = publicClient();
  const contracts = loadDeployments(chainId());

  const salt = bytesToHex(randomSalt()) as `0x${string}`;
  const metaHash = keccak256(toHex(new TextEncoder().encode(`ipp-init-${Date.now()}`))) as `0x${string}`;
  const repoKey: `0x${string}` = repo ? repoKeyOf(repo) : ("0x" + "00".repeat(32) as `0x${string}`);

  const hash = await wc.writeContract({
    address: contracts.IPPassportRegistry,
    abi: REGISTRY_ABI,
    functionName: "registerWork",
    args: [salt, metaHash, repoKey],
    account,
    chain: client.chain,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("registerWork 交易失败");

  const workId = keccak256(
    toHex(
      new Uint8Array([
        ...new Uint8Array(12), // address 左填充由 encodePacked 处理——这里手工拼
      ]),
    ),
  );
  // workId = keccak256(abi.encodePacked(msg.sender, salt))，用 viem encodePacked：
  const { encodePacked } = await import("viem");
  const realWorkId: `0x${string}` = keccak256(encodePacked(["address", "bytes32"], [account.address as `0x${string}`, salt as `0x${string}`]));

  mkdirSync(resolve(IPP_DIR, "versions"), { recursive: true });
  mkdirSync(resolve(IPP_DIR, "queue"), { recursive: true });
  writeFileSync(resolve(IPP_DIR, "gitignore-content"), "*\n");

  // claim.json（GitHub 归属验证用，8.3）
  if (repo) {
    writeFileSync(
      resolve(".ipp-claim.json"),
      JSON.stringify({ workId: realWorkId, owner: account.address, repo }, null, 2) + "\n",
    );
  }

  // .gitignore 防止盐和清单进公开仓库
  const gi = ".gitignore";
  if (!existsSync(gi)) {
    writeFileSync(gi, ".ipp/\n");
  } else {
    const cur = readFileSync(gi, "utf-8");
    if (!cur.includes(".ipp/")) appendFileSync(gi, "\n.ipp/\n");
  }

  const { saveConfig } = await import("./ctx.js");
  saveConfig({
    workId: realWorkId,
    repo,
    repoKey,
    rpcUrl: rpcUrl(),
    chainId: chainId(),
    contract: contracts.IPPassportRegistry,
    headVersion: ("0x" + "00".repeat(32)) as `0x${string}`,
  });

  console.log("✓ 作品已注册");
  console.log("  workId:", realWorkId);
  if (repo) {
    console.log("  repoKey:", repoKey);
    console.log("  → 请将 .ipp-claim.json 提交到仓库根目录（文件名改为 .ipp/claim.json），用于 GitHub 归属验证");
  }
  console.log("  合约:", contracts.IPPassportRegistry);
}
