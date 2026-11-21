#!/usr/bin/env node
/**
 * ipp — IP Passport CLI（需求第 8 节）
 * 私钥只从环境变量 IPP_PRIVATE_KEY 读取；不写入任何文件、不打印。
 */
import { Command } from "commander";
import { registerAndInit } from "./init.js";
import { snapshotCmd } from "./snapshot.js";
import { licenseSet } from "./license.js";
import { logCmd } from "./log.js";
import { exportCmd } from "./export.js";
import { verifyCmd } from "./verify.js";
import { checkCmd } from "./check.js";

const program = new Command();
program
  .name("ipp")
  .description("IP Passport — 本地优先的创作过程存证与许可状态工具")
  .version("0.1.0");

program
  .command("init")
  .description("在当前目录创建 .ipp/ 并在链上注册作品")
  .option("--repo <repo>", "GitHub 仓库（github.com/owner/repo）")
  .action(async (opts) => { await registerAndInit(opts.repo); });

program
  .command("snapshot")
  .description("对文件创建版本快照并锚定")
  .argument("<paths...>", "文件路径")
  .requiredOption("--kind <kind>", "PROMPT | DRAFT | COMMIT | RELEASE")
  .option("--note <note>", "备注")
  .option("--queue", "只入队不上链")
  .action(async (paths, opts) => { await snapshotCmd(paths, opts.kind, opts.note ?? "", opts.queue ?? false); });

program
  .command("license")
  .description("许可管理")
  .command("set")
  .argument("<spdx>", "SPDX 标识")
  .option("--terms <file>", "条款文件（计算哈希上链）")
  .option("--contact <uri>", "联系方式")
  .action(async (spdx, opts) => { await licenseSet(spdx, opts.terms, opts.contact); });

program
  .command("log")
  .description("显示本地版本链与链上状态")
  .action(async () => { await logCmd(); });

program
  .command("export")
  .description("导出证据包")
  .argument("<versionRoot>", "目标版本")
  .option("--disclose <glob>", "披露文件 glob")
  .option("--redact-paths", "隐藏未披露文件路径")
  .requiredOption("-o, --out <file>", "输出 zip")
  .action(async (vr, opts) => { await exportCmd(vr, opts.disclose, opts.redactPaths ?? false, opts.out); });

program
  .command("verify")
  .description("离线验证证据包 + 链上核对")
  .argument("<zip>", "证据包路径")
  .action(async (zip) => { await verifyCmd(zip); });

program
  .command("check")
  .description("查询作品许可与义务提示")
  .argument("<workIdOrRepo>", "workId 或 GitHub 地址")
  .option("--at <timestamp>", "查询时间点（Unix 秒）")
  .action(async (id, opts) => { await checkCmd(id, opts.at); });

program.parseAsync().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
