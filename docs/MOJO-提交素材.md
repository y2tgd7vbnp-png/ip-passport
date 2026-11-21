# MOJO 提交素材 · IP Passport 知识产权护照

> 所有文案均遵守需求文档第 15 节法律表述约束（UI / README / 演示文案适用）。
> 请勿在提交材料中使用「公证 / 确权 / 证明作者身份 / 证明拥有版权 / 具有法律效力 / 链上登记即获得版权保护」等表述。

---

## 一、表单短版（项目简介，约 120 字）

**IP Passport · 知识产权护照**

AI 协作创作时代，过程与许可都难以举证。IP Passport 是本地优先的创作过程存证与许可状态层：原文件不出本机，链上只有 SHA-256 指纹与 Merkle 根；版本链式锚定到 Monad 测试网，可按需导出证据包供第三方离线验证；商业化前可按时间点查询当时适用的许可与义务提示。链上记录仅表明某一版本的指纹最晚在对应区块时间已存在，可作为电子证据材料之一，不构成法律意见。

**One-liner (EN)**

Local-first provenance & licence state layer for AI-era creative work: files never leave your machine, only SHA-256 fingerprints and Merkle roots go on-chain. Append-only version chains anchored on Monad, exportable evidence packs verifiable fully offline, and point-in-time licence queries before commercialisation. Not legal advice.

---

## 二、解决的问题

1. **过程不可证** — 最终成果有 git，但 AI 对话、草稿、数据集散落各处
2. **时点不可查** — 下游商用前无从得知某时间点作品适用什么许可、有什么义务
3. **验证依赖第三方** — 传统存证平台需信任服务方，证据包无法离线自证

---

## 三、核心亮点（可拆成表单「创新点」多条）

| # | 亮点 | 一句话 |
|---|---|---|
| 1 | 本地优先 / 隐私 | 原文件、盐、Prompt 内容永不上链、不上传任何服务器；`/verify` 在浏览器内解包重算，文件不离开浏览器 |
| 2 | 严格哈希规范 | 加盐叶子 `SHA256(0x00‖salt‖fileDigest)`、升序叶 + 有序对内部节点 `SHA256(0x01‖min‖max)`、奇数上提不复制；`versionRoot = SHA256("IPP-V1"‖workId‖prev‖fileRoot‖metaHash)`；canonical JSON 键排序 |
| 3 | 可自证的证据包 | `ipp export` 打包版本链 + 披露文件 + Merkle 证明，第三方无需信任任何服务器即可完整验证；篡改必被识破（已实测） |
| 4 | 时间点许可查询 | 许可只追加不覆盖，`getLicenseAt(workId, t)` 可回溯任意历史时点；MIT → BUSL-1.1 变更前后查询结果不同（已实测） |
| 5 | 下游合规闭环 | `ExampleSkillMarket` 上架时按当时许可给出 APPROVED / PENDING / NEEDS_REVIEW，并可用 `recordListingCheck` 把检查结论写回链上留痕 |
| 6 | Monad 并行友好 | workId 隔离存储、只追加、无链上循环、每作品状态常量大小，适配并行执行 |
| 7 | 法律表述严谨 | 全站固定免责声明，结论区明确「仅表明指纹最晚于对应区块时间已存在；不证明作者身份或版权归属」，义务提示只给列表与风险等级、不写「可/不可商用」结论 |

---

## 四、演示信息（评审可直接操作）

- **在线演示**：`https://ip-passport.app.workbuddy.host/?sharecode=JEILIW2FB2`
  - `/verify`：拖入 `docs/demo/monad-evidence.zip` → 2 个版本哈希重算 ✓ + Monad 链上核对 ✓ + draft.md 叶子与 Merkle 证明 ✓
  - `/check`：输入 `github.com/iris/ip-passport-demo` → BUSL-1.1 / SOURCE_AVAILABLE / HIGH / 需查看条款；时间点填 `1795251890` → 回到 MIT / PERMISSIVE
- **Monad Testnet（chainId 10143）**
  - IPPassportRegistry `0x22b770e03e986b1133a209a3de09438716ef183d`
  - ExampleSkillMarket `0xb4788bc94c1da717f9b71241eb71878971ae80e6`
  - 浏览器 `https://testnet.monadexplorer.com`
- **链上演示数据**：workId `0x01b7a4663cb10deca0ab29231fbd52c1522f4893fbf55138f46911fdd530ddc9`；PROMPT @ 区块 81536861、DRAFT @ 区块 81536881；许可历史 MIT(1795251884) → BUSL-1.1(1795251904)

**30 秒演示脚本**：打开在线链接 → 拖入证据包 → 展示「全部验证通过 + 链上存在」→ 切到许可查询 → 输仓库名得 BUSL-1.1 → 改时间点得 MIT → 指给评审看底部免责声明。

---

## 五、技术栈与测试

- pnpm monorepo：`packages/core`（TS，Node/WebCrypto 双端 SHA-256）、`packages/contracts`（Solidity 0.8.24）、`packages/cli`（`ipp`）、`apps/web`（纯静态，浏览器内验证）
- 工具链：Hardhat 3.22 + viem + vitest（本机 Foundry 因 GitHub release 下载被网络掐断，改用等效方案，功能覆盖一致）
- 测试：**core 23/23 单测通过**（含 1/2/3/7/100 叶 Merkle、乱序同根、篡改必败、许可规则全分支）；**合约 14/14 通过**（注册 / 链式锚定 / BadPrevRoot / 重复 / 非 owner / 许可时间边界 / 批量 / 衍生 / 市场全分支）；CLI 端到端演示全流程在 Monad 测试网真实跑通

---

## 六、法律声明（如表单有「合规说明」栏，可直接贴）

本工具仅提供哈希与区块链记录的技术比对。其结果只能说明：某一版本的指纹最晚在对应区块时间已经存在；不证明作者身份，不证明拥有版权，也不意味着「链上登记即获得版权保护」或「具有法律效力」。相关记录可作为电子证据材料之一，由争议处理机构依据所在法域规则审查，不替代版权登记或司法程序。许可义务提示依据作者链上声明自动生成，统一给出义务列表与风险等级，不作出「可以商用 / 不能商用」的结论，仅供参考，不构成法律意见。
