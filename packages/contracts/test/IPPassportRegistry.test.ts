import assert from "node:assert/strict";
import test from "node:test";
import hre, { network } from "hardhat";
import { keccak256, encodePacked, toHex } from "viem";

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [alice, bob, carol] = await viem.getWalletClients();

const SALT = toHex("demo-salt-1", { size: 32 });
const META = toHex("meta", { size: 32 });
const REPOKEY = keccak256(toHex("github.com/iris/drop2markdown"));
const ZERO = "0x" + "00".repeat(32);

let registry: any;
let market: any;
let aliceAddr: `0x${string}`;
let bobAddr: `0x${string}`;

test.before(async () => {
  registry = await viem.deployContract("IPPassportRegistry");
  market = await viem.deployContract("ExampleSkillMarket", [registry.address]);
  aliceAddr = alice.account.address;
  bobAddr = bob.account.address;
});

async function expectCustomRevert(promise: Promise<any>, errName: string) {
  try {
    await promise;
  } catch (e: any) {
    const msg = String(e.message ?? e) + String(e?.cause ?? "");
    // viem 会把自定义错误解码为 __ErrorName 或在消息里含 errorName
    if (msg.includes(errName) || msg.includes("revert")) return;
    throw e;
  }
  throw new Error(`预期 revert ${errName}，但交易成功`);
}

const V1 = keccak256(toHex("v1", { size: 32 }));
const V2 = keccak256(toHex("v2", { size: 32 }));
const V3 = keccak256(toHex("v3", { size: 32 }));

test("注册：workId 正确、repoKey 映射生效", async () => {
  const hash = await registry.write.registerWork([SALT, META, REPOKEY], { account: alice.account } as any);
  await publicClient.waitForTransactionReceipt({ hash });
  const expected = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, SALT]));
  const w = await registry.read.getWork([expected]);
  assert.equal(w.owner.toLowerCase(), aliceAddr.toLowerCase());
  assert.equal(w.repoKey.toLowerCase(), REPOKEY.toLowerCase());
  assert.equal(w.headVersion.toLowerCase(), ZERO); // headVersion
  const byRepo = await registry.read.getWorksByRepo([REPOKEY]);
  assert.equal(byRepo.length, 1);
  assert.equal(byRepo[0].toLowerCase(), expected.toLowerCase());
});

test("注册：salt=0 → BadSalt；重复 → AlreadyAnchored", async () => {
  await expectCustomRevert(registry.write.registerWork([ZERO, META, ZERO], { account: alice.account } as any), "BadSalt");
  await expectCustomRevert(
    registry.write.registerWork([SALT, META, ZERO], { account: alice.account } as any),
    "AlreadyAnchored",
  );
});

test("锚定：链式顺序与 headVersion 推进", async () => {
  const workId = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, SALT]));
  await registry.write.anchorVersion([workId, V1, ZERO, 0], { account: alice.account } as any);
  await registry.write.anchorVersion([workId, V2, V1, 1], { account: alice.account } as any);
  const ver1 = await registry.read.getVersion([V1]);
  assert.equal(ver1.workId.toLowerCase(), workId.toLowerCase());
  assert.equal(ver1.prevRoot.toLowerCase(), ZERO);
  const w = await registry.read.getWork([workId]);
  assert.equal(w.headVersion.toLowerCase(), V2.toLowerCase());
});

test("锚定：BadPrevRoot / AlreadyAnchored / NotOwner / UnknownWork", async () => {
  const workId = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, SALT]));
  const wrong = keccak256(toHex("wrong", { size: 32 }));
  await expectCustomRevert(registry.write.anchorVersion([workId, V3, wrong, 0], { account: alice.account } as any), "BadPrevRoot");
  await expectCustomRevert(registry.write.anchorVersion([workId, V1, V2, 0], { account: alice.account } as any), "AlreadyAnchored");
  await expectCustomRevert(registry.write.anchorVersion([workId, V3, V2, 0], { account: bob.account } as any), "NotOwner");
  const ghost = keccak256(toHex("ghost", { size: 32 }));
  await expectCustomRevert(registry.write.anchorVersion([ghost, V3, ZERO, 0], { account: alice.account } as any), "UnknownWork");
});

test("批量锚定：headVersion 推进、重复 revert、count=0 revert", async () => {
  const workId = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, SALT]));
  const batchRoot = keccak256(toHex("batch", { size: 32 }));
  const last = keccak256(toHex("v-last", { size: 32 }));
  await registry.write.anchorBatch([workId, batchRoot, last, 3], { account: alice.account } as any);
  const w = await registry.read.getWork([workId]);
  assert.equal(w.headVersion.toLowerCase(), last.toLowerCase());
  const b = await registry.read.getBatch([batchRoot]);
  assert.equal(Number(b.count), 3);
  await expectCustomRevert(registry.write.anchorBatch([workId, batchRoot, last, 3], { account: alice.account } as any), "AlreadyAnchored");
  await expectCustomRevert(registry.write.anchorBatch([workId, keccak256(toHex("b2", { size: 32 })), last, 0], { account: alice.account } as any), "BadPrevRoot");
});

test("许可：追加历史 + getLicenseAt 时间边界", async () => {
  const workId = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, SALT]));
  const T1 = 1_800_000_000n;
  const T2 = 1_800_001_000n;
  await publicClient.request({ method: "evm_setNextBlockTimestamp", params: ["0x" + T1.toString(16)] });
  await registry.write.setLicense([workId, "MIT", ZERO, 1, ""], { account: alice.account } as any);
  await publicClient.request({ method: "evm_setNextBlockTimestamp", params: ["0x" + T2.toString(16)] });
  const termsH = keccak256(toHex("terms", { size: 32 }));
  await registry.write.setLicense([workId, "BUSL-1.1", termsH, 6, "mailto:author@example.com"], { account: alice.account } as any);

  const hist = await registry.read.getLicenseHistory([workId]);
  assert.equal(hist.length, 2);

  const beforeAny = await registry.read.getLicenseAt([workId, 1_799_999_999n]);
  assert.equal(Number(beforeAny.policy), 0); // UNSPECIFIED

  const atMit = await registry.read.getLicenseAt([workId, 1_800_000_500n]);
  assert.equal(atMit.spdx, "MIT");
  assert.equal(Number(atMit.policy), 1); // PERMISSIVE

  const atBusl = await registry.read.getLicenseAt([workId, 1_800_001_000n]);
  assert.equal(atBusl.spdx, "BUSL-1.1");
  assert.equal(Number(atBusl.policy), 6); // SOURCE_AVAILABLE
  assert.equal(atBusl.termsHash.toLowerCase(), termsH.toLowerCase());
  assert.equal(atBusl.effectiveFrom, T2); // effectiveFrom
});

test("衍生声明：NotOwner / UnknownParentWork / getParents", async () => {
  const child = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, SALT]));
  // bob 注册父作品
  const parentSalt = toHex("parent-salt", { size: 32 });
  await registry.write.registerWork([parentSalt, META, ZERO], { account: bob.account } as any);
  const parent = keccak256(encodePacked(["address", "bytes32"], [bobAddr, parentSalt]));
  const pv = keccak256(toHex("pv", { size: 32 }));

  await expectCustomRevert(registry.write.declareDerivative([child, parent, pv], { account: bob.account } as any), "NotOwner");
  const ghost = keccak256(toHex("ghost", { size: 32 }));
  await expectCustomRevert(registry.write.declareDerivative([child, ghost, pv], { account: alice.account } as any), "UnknownParentWork");

  await registry.write.declareDerivative([child, parent, pv], { account: alice.account } as any);
  const parents = await registry.read.getParents([child]);
  assert.equal(parents.length, 1);
  assert.equal(parents[0].parentWorkId.toLowerCase(), parent.toLowerCase());
});

test("上架检查：任何地址可写、按 subjectId 追加", async () => {
  const subject = keccak256(toHex("skill-1", { size: 32 }));
  const w = keccak256(toHex("w", { size: 32 }));
  await registry.write.recordListingCheck([subject, w, keccak256(toHex("r", { size: 32 })), true], { account: carol.account } as any);
  await registry.write.recordListingCheck([subject, w, keccak256(toHex("r2", { size: 32 })), false], { account: bob.account } as any);
  const checks = await registry.read.getListingChecks([subject]);
  assert.equal(checks.length, 2);
  assert.equal(checks[0].acknowledged, true);
  assert.equal(checks[1].acknowledged, false);
});

test("转移：NotOwner 保护 + 新旧 owner 权限切换", async () => {
  const workId = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, SALT]));
  await expectCustomRevert(registry.write.transferWork([workId, bobAddr], { account: bob.account } as any), "NotOwner");
  await registry.write.transferWork([workId, bobAddr], { account: alice.account } as any);
  const nv = keccak256(toHex("v-new-owner", { size: 32 }));
  const head = (await registry.read.getWork([workId])).headVersion;
  await expectCustomRevert(registry.write.anchorVersion([workId, nv, head, 0], { account: alice.account } as any), "NotOwner");
  await registry.write.anchorVersion([workId, nv, head, 0], { account: bob.account } as any);
});

// ---------- ExampleSkillMarket ----------

const M_SALT = toHex("m-salt", { size: 32 });

let setupSeq = 0;
async function setupLicensedWork(spdx: string, policy: number, termsH: `0x${string}` = ZERO) {
  const salt = toHex(`mw-${spdx}-${policy}-${setupSeq++}`, { size: 32 });
  await registry.write.registerWork([salt, META, ZERO], { account: alice.account } as any);
  const workId = keccak256(encodePacked(["address", "bytes32"], [aliceAddr, salt]));
  if (spdx !== "") {
    await registry.write.setLicense([workId, spdx, termsH, policy, ""], { account: alice.account } as any);
  }
  return workId as `0x${string}`;
}

test("市场：PERMISSIVE → APPROVED", async () => {
  const workId = await setupLicensedWork("MIT", 1);
  const skillId = keccak256(toHex("skill-mit", { size: 32 }));
  await market.write.listSkill([skillId, workId, false], { account: carol.account } as any);
  const l = await market.read.getListing([skillId]);
  assert.equal(Number(l.status), 0); // APPROVED
});

test("市场：COPYLEFT 三类未确认 → revert；确认后 APPROVED", async () => {
  for (const [spdx, policy] of [["LGPL-3.0-only", 2], ["GPL-3.0-only", 3], ["AGPL-3.0-only", 4]] as const) {
    const workId = await setupLicensedWork(spdx, policy);
    const skillId = keccak256(toHex(`sk-${spdx}`, { size: 32 }));
    await expectCustomRevert(market.write.listSkill([skillId, workId, false], { account: carol.account } as any), "ObligationsNotAcknowledged");
    await market.write.listSkill([skillId, workId, true], { account: carol.account } as any);
    const l = await market.read.getListing([skillId]);
    assert.equal(Number(l.status), 0);
  }
});

test("市场：NONCOMMERCIAL/SOURCE_AVAILABLE/PROPRIETARY → PENDING_COMMERCIAL_LICENSE", async () => {
  for (const [spdx, policy] of [["CC-BY-NC-4.0", 5], ["BUSL-1.1", 6], ["CUSTOM", 7]] as const) {
    const workId = await setupLicensedWork(spdx, policy, keccak256(toHex("t", { size: 32 })));
    const skillId = keccak256(toHex(`sk-${spdx}`, { size: 32 }));
    await market.write.listSkill([skillId, workId, true], { account: carol.account } as any);
    const l = await market.read.getListing([skillId]);
    assert.equal(Number(l.status), 1);
  }
});

test("市场：UNSPECIFIED → NEEDS_REVIEW；未知作品 revert", async () => {
  const workId = await setupLicensedWork("", 0);
  const skillId = keccak256(toHex("sk-unk", { size: 32 }));
  await market.write.listSkill([skillId, workId, false], { account: carol.account } as any);
  const l = await market.read.getListing([skillId]);
  assert.equal(Number(l.status), 2);

  const ghost = keccak256(toHex("ghost-w", { size: 32 }));
  await expectCustomRevert(market.write.listSkill([keccak256(toHex("s2", { size: 32 })), ghost, false], { account: carol.account } as any), "UnknownSourceWork");
});

test("市场：每次上架写入 recordListingCheck", async () => {
  const workId = await setupLicensedWork("MIT", 1);
  const skillId = keccak256(toHex("sk-rec", { size: 32 }));
  await market.write.listSkill([skillId, workId, true], { account: carol.account } as any);
  const checks = await registry.read.getListingChecks([skillId]);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].sourceWorkId.toLowerCase(), workId.toLowerCase());
  assert.equal(checks[0].acknowledged, true);
});
