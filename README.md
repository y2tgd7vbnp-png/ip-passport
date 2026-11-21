# IP Passport · 知识产权护照

**Local-first provenance & licence state layer for AI-era creative work.**
**本地优先的 AI 时代创作过程存证与许可状态层。**

> 原文件不出本机，链上只有指纹；商业化之前，任何人都可查每个时间点的许可义务。

---

## Why / 解决什么问题

AI 协作创作时代，"这段代码/这篇文章/这批提示词是谁的、什么时候产生的、许可别人怎么用"变得难以举证：

1. **过程不可证** —— 最终成果有 git，但 AI 对话、草稿、数据集往往散落各处
2. **归属不可验** —— 说"这是我 3 月写的"缺乏独立证据
3. **许可不可查** —— 下游商用前无从得知某时间点作品适用什么许可、有什么义务

IP Passport 用三件事解决：**本地存证 → 按需披露 → 商业化前查询**。

## How it works / 工作原理

```
本地文件 ──SHA-256──> 加盐叶子 ──Merkle──> fileRoot
                                              │
manifest(ipp.version.v1) ──canonical JSON──> versionRoot = SHA256("IPP-V1"‖workId‖prev‖fileRoot‖metaHash)
                                              │
                                     链上锚定（只追加，链式衔接）
```

- **原文件永不上链**，链上只有 32 字节哈希指纹
- **版本链**：每个新版本锚定时引用 `prevVersionRoot`，形成可验证的因果链
- **证据包**：`ipp export` 打包版本链 + 可选披露文件 + Merkle 证明，第三方无需信任任何服务器即可验证
- **许可只追加**：`license set` 不覆盖历史，`getLicenseAt(workId, t)` 可查任意历史时间点

## Hash & data format / 哈希与数据格式（严格规范）

| 项 | 定义 |
|---|---|
| 叶子 | `SHA256(0x00 ‖ salt(32B) ‖ fileDigest(32B))`，salt 每文件随机 |
| 内部节点 | `SHA256(0x01 ‖ min(left,right) ‖ max(left,right))`，叶子升序排序，有序对拼接；奇数层最后一片直接上提（不复制） |
| fileDigest | 文件内容的 `SHA256` |
| versionRoot | `SHA256("IPP-V1" ‖ workId ‖ prevVersionRoot ‖ fileRoot ‖ metaHash)` |
| manifest | JSON，键名排序、无空格的规范化序列化（canonical JSON），schema `ipp.version.v1` |

## Repo layout / 仓库结构

```
ip-passport/
├── packages/
│   ├── core/        # 哈希 / Merkle / manifest（zod schema），Node 与浏览器通用
│   ├── contracts/   # IPPassportRegistry.sol + ExampleSkillMarket.sol（Solidity 0.8.24）
│   └── cli/         # ipp 命令行：init / snapshot / license / log / export / verify / check
├── apps/web/        # 纯静态前端：/verify（浏览器内验证证据包）+ /check（许可查询）
├── deployments/     # 各链部署地址（本地 31337 + Monad 测试网 10143）
└── bench/           # 压测（规划中）
```

## Quick start / 快速开始

```bash
# 环境变量
export IPP_PRIVATE_KEY=0x...            # 仅从环境变量读取，绝不入库
export IPP_RPC_URL=https://testnet-rpc.monad.xyz
export IPP_CHAIN_ID=10143

# 演示流程
ipp init --repo github.com/you/your-repo     # 注册作品（workId = keccak256(owner‖salt)）
ipp license set MIT                            # 声明许可
ipp snapshot draft.md --kind DRAFT --note 初稿 # 锚定版本（PROMPT/DRAFT/DATA/CODE/FINAL）
ipp license set BUSL-1.1 --terms terms.md --contact mailto:you@x.com   # 许可变更（历史保留）
ipp log                                        # 版本链 + 链上状态
ipp export <versionRoot> --disclose draft.md -o evidence.zip  # 导出证据包
ipp verify evidence.zip                        # 离线+链上双重验证
ipp check github.com/you/your-repo --at <unix> # 查询任意时间点许可
```

前端：`apps/web/` 直接静态托管，拖入 evidence.zip 即可在浏览器内完成全部哈希重算与 Merkle 验证（文件不离开浏览器）。

## Deployed on Monad Testnet / 已部署

| Contract | Address |
|---|---|
| IPPassportRegistry | `0x22b770e03e986b1133a209a3de09438716ef183d` |
| ExampleSkillMarket | `0xb4788bc94c1da717f9b71241eb71878971ae80e6` |

Chain ID `10143` · RPC `https://testnet-rpc.monad.xyz` · Explorer `https://testnet.monadexplorer.com`

演示作品：`github.com/iris/ip-passport-demo` → workId `0x01b7a4663cb10deca0ab29231fbd52c1522f4893fbf55138f46911fdd530ddc9`（含 PROMPT/DRAFT 两版本锚定 + MIT→BUSL-1.1 许可变更，可体验时间点查询）

## Tests / 测试

- `packages/core`：23 个单元测试（哈希向量与 Python hashlib 交叉验证；Merkle 1/2/3/7/100 叶；乱序同根；篡改必败；许可规则全分支）
- `packages/contracts`：14 个测试（注册/链式锚定/BadPrevRoot/重复锚定/非 owner/许可时间边界/批量/衍生声明/市场全分支）

## Skill market example / 技能市场示例

`ExampleSkillMarket` 演示下游消费方如何消费许可状态：上架 AI Skill 时按当时许可自动给出 `APPROVED / PENDING / NEEDS_REVIEW`，并把结论写回链上（`recordListingCheck`），形成商业化前的合规闭环。

## Disclaimer / 免责声明

本工具提供的是哈希与区块链记录的**技术比对与存证**，不构成法律意见，不替代版权登记或司法程序。许可义务提示依据作者链上声明自动生成，仅供参考。/ This tool provides technical comparison and anchoring of cryptographic records only; it is not legal advice and does not replace copyright registration or judicial proceedings. Licence obligation hints are auto-generated from on-chain declarations by the author and are for reference only.

---

*Built for Monad Testnet — designs for Monad-parallel-friendly access patterns: append-only storage, constant-size on-chain state per work, and no on-chain loops.*
