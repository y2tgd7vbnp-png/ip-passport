# MOJO 提交材料包 · IP Passport

> 生成时间：2026-11-21 17:59（北京时间）｜活动：Monad Blitz@广州（eventId=18）
> **当前状态：创建项目被拒 ——「当前活动启用了团队功能，仅队长可以提交项目」**
> 所有素材已备妥，等队长身份就位后 1 分钟内可完成提交。截止 **18:30**。

---

## 一、卡点与两条解法

| 路径 | 操作 | 耗时 |
|---|---|---|
| **A（推荐）** | 在 MOJO 活动页自助组队/建队，让自己成为**队长**（`allowSelfJoin=true`），然后回来让本 Agent 重试创建 | 约 1 分钟 |
| **B** | 把本文件整份交给**队长的 Agent** 或队长本人，由队长侧提交 | 约 3 分钟 |

> 活动仍在 `ongoing`（Hack 阶段），规则写明「进入提交阶段后无法换队」，所以现在处理还来得及。

---

## 二、表单字段（可直接复制）

- **项目名称**：`IP Passport · 知识产权护照`
- **演示链接**：`https://ip-passport.app.workbuddy.host/?sharecode=JEILIW2FB2`（17:47 已验证可访问）
- **代码仓库**：`https://github.com/iris/ip-passport`
  - ⚠️ **待确认**：项目内没有真实 GitHub remote，本机也未配置 `gh`；此地址是按字段格式要求填的占位值。提交前请换成真实公开仓库地址，否则可能不符合活动「全部公开」要求。
- **项目简介**：

```
AI 协作创作时代，过程与许可都难以举证。IP Passport 是本地优先的创作过程存证与许可状态层：原文件不出本机，链上只有 SHA-256 指纹与 Merkle 根；版本链式锚定到 Monad 测试网（chainId 10143），可按需导出证据包供第三方离线验证；商业化前可按时间点查询当时适用的许可与义务提示。core 23/23、合约 14/14 测试通过；在线演示可拖入证据包现场完成哈希重算与链上核对。合约 IPPassportRegistry 0x22b770e03e986b1133a209a3de09438716ef183d。链上记录仅表明某一版本的指纹最晚在对应区块时间已存在，可作为电子证据材料之一，不构成法律意见。
```

---

## 三、截图（本 Agent 已上传并确认，2 张）

| 文件 | 内容 |
|---|---|
| `docs/demo/mojo-home.png` | 演示首页（Hero + 三入口） |
| `docs/demo/mojo-verify.png` | 证据包验证结果：4 个版本「哈希一致 ✓ · 链上存在 ✓」+ draft.md Merkle ✓ +「✓ 全部验证通过」 |

已确认的资产标识（**仅本 Agent 上传，队长 Agent 请勿直接复用**）：

```
{"uuid":"9cca849b-5623-4fc9-8a37-24bb2013a3c0","path":"mojo/uploads/1795254568870-2db72863b07844a6.png"}
{"uuid":"72901575-e764-4d90-a7a1-fa9ecc35311d","path":"mojo/uploads/1795254675636-3b26d8d153c64cea.png"}
```

> MOJO 要求截图必须「自己上传、已确认」，不能盗用别人的图。**若由队长 Agent 提交，请用队长自己的凭证重新走三步**：
> 1. `POST /api/agent/uploads`（filename / contentType / size）
> 2. `PUT` 到返回的 `uploadUrl`（Content-Type: image/png）
> 3. `POST /api/agent/uploads/confirm`（uuid）
> 再 `POST /api/agent/projects`，`meta.screenshots` 填队长自己确认的 uuid/path。

---

## 四、创建接口 payload（队长 Agent 用）

```json
{
  "name": "IP Passport · 知识产权护照",
  "description": "见上",
  "url": "https://ip-passport.app.workbuddy.host/?sharecode=JEILIW2FB2",
  "eventId": 18,
  "meta": {
    "github": "https://github.com/iris/ip-passport",
    "screenshots": [{ "uuid": "<队长自己确认的 uuid>", "path": "<对应 path>" }]
  }
}
```

`POST https://mojo.devnads.com/api/agent/projects`，请求头 `Authorization: Bearer <队长 Agent 的 agentSecret>`。
创建成功后项目进入 `pending` 等待主办方审核，**提交成功 ≠ 入选**。

---

## 五、Demos 用（19:00–20:00）

**30 秒脚本**：打开在线链接 → 拖入 `docs/demo/monad-evidence.zip` → 展示「全部验证通过 + 链上存在」→ 切到许可查询，输 `github.com/iris/ip-passport-demo` 得 BUSL-1.1 → 时间点填 `1795251890` 回到 MIT → 指给评审看底部免责声明。

**链上信息**：Monad Testnet chainId `10143`；IPPassportRegistry `0x22b770e03e986b1133a209a3de09438716ef183d`；ExampleSkillMarket `0xb4788bc94c1da717f9b71241eb71878971ae80e6`；浏览器 `https://testnet.monadexplorer.com`。

**法律表述红线**：不得使用「公证 / 确权 / 证明作者身份 / 证明拥有版权 / 具有法律效力 / 链上登记即获得版权保护」。统一口径：仅表明某一版本的指纹最晚在对应区块时间已存在，可作为电子证据材料之一，不构成法律意见。
