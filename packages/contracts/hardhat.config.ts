import { defineConfig } from "hardhat/config";
import toolboxPlugin from "@nomicfoundation/hardhat-toolbox-viem";

const MONAD_RPC_URL = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";

export default defineConfig({
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  plugins: [toolboxPlugin],
  networks: {
    hardhat: { type: "edr-simulated", chainId: 31337 },
    monad: {
      type: "http",
      url: MONAD_RPC_URL,
      chainId: Number(process.env.MONAD_CHAIN_ID ?? 10143),
      accounts: process.env.IPP_PRIVATE_KEY ? [process.env.IPP_PRIVATE_KEY] : [],
    },
  },
});
