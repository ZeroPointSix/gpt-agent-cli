import chalk from "chalk";
import prompts from "prompts";
import { existsSync } from "node:fs";
import { loadConfig } from "../config.js";
import { getConfigPath, getWorkspaceDir } from "../utils/workspace.js";
import { runTrigger } from "../trigger-service.js";
import {
  agentAdd,
  agentRemove,
  agentSetEnabled,
  getEnabledAgentNames,
} from "../cli/agent-cmd.js";
import { saveConfig } from "../config-io.js";

const BANNER = `
╔════════════════════════════════════════════════════════════════╗
║   ██████╗ ██████╗ ████████╗      █████╗  ██████╗ ███████╗███╗ ║
║  ██╔════╝ ██╔══██╗╚══██╔══╝     ██╔══██╗██╔════╝ ██╔════╝████║
║  ██║  ███╗██████╔╝   ██║        ███████║██║  ███╗█████╗  ██╔██║
║  ██║   ██║██╔═══╝    ██║        ██╔══██║██║   ██║██╔══╝  ██║╚██║
║  ╚██████╔╝██║        ██║        ██║  ██║╚██████╔╝███████╗██║ ██║
║   ╚═════╝ ╚═╝        ╚═╝        ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝ ╚═╝
║                                                                ║
║   Workspace Agents CLI  ·  交互设计参考 mpt-bench (mpt)        ║
╚════════════════════════════════════════════════════════════════╝`;

function getMenu() {
  return `
请选择功能
  -------- 触发执行 --------
  1. 一键触发 - 自动引导：检查 agent → 填写 input → 入队（推荐）
  2. 批量触发 - 对多个已启用 agent 发送相同 input

  -------- 配置管理 --------
  3. Agent 管理 - 查看/添加/删除/启用/禁用（对标 mpt 渠道管理）
  4. 环境检查 - doctor（token 环境变量）

  -------- 其他 --------
  5. 启动 Web 双页 UI（本机 http://127.0.0.1:3847）
  Q. 退出
`;
}

async function pause() {
  await prompts(
    { type: "text", name: "c", message: "按回车继续…" },
    { onCancel: () => ({}) },
  );
}

export async function guidedTrigger(configPath: string) {
  console.log(chalk.cyan("\n=== 一键触发引导 ===\n"));
  const { config } = await loadConfig(configPath);
  let names = getEnabledAgentNames(config);
  if (!names.length) {
    console.log(chalk.yellow("没有已启用的 agent。请先通过「Agent 管理」添加。"));
    return;
  }

  let agentName = names[0];
  if (names.length > 1) {
    const ch = await prompts({
      type: "select",
      name: "agent",
      message: "选择 agent",
      choices: names.map((n) => ({
        title: n === config.default ? `${n} (默认)` : n,
        value: n,
      })),
    });
    if (!ch.agent) {
      console.log(chalk.gray("已取消。"));
      return;
    }
    agentName = ch.agent;
  } else {
    console.log(chalk.green(`使用 agent: ${agentName}`));
  }

  const inputMode = await prompts({
    type: "select",
    name: "mode",
    message: "输入方式",
    choices: [
      { title: "单行文本", value: "line" },
      { title: "多行（连续输入，空行结束）", value: "multiline" },
    ],
  });
  if (!inputMode.mode) return;

  let inputText = "";
  if (inputMode.mode === "line") {
    const line = await prompts({
      type: "text",
      name: "input",
      message: "input（传给 agent）",
      validate: (v: string) => (v?.trim() ? true : "必填"),
    });
    if (!line.input) return;
    inputText = line.input.trim();
  } else {
    console.log(chalk.gray("输入多行内容，单独一行 END 结束："));
    const lines: string[] = [];
    while (true) {
      const row = await prompts({ type: "text", name: "l", message: ">" });
      if (!row.l || row.l.trim() === "END") break;
      lines.push(row.l);
    }
    inputText = lines.join("\n").trim();
    if (!inputText) return;
  }

  const extras = await prompts([
    {
      type: "confirm",
      name: "conv",
      message: "设置 conversation_key？",
      initial: false,
    },
    {
      type: (_prev: boolean, values: { conv?: boolean }) =>
        values.conv ? "text" : null,
      name: "conversationKey",
      message: "conversation_key",
    },
    {
      type: "confirm",
      name: "idem",
      message: "设置 Idempotency-Key？",
      initial: false,
    },
    {
      type: (_prev: boolean, values: { idem?: boolean }) =>
        values.idem ? "text" : null,
      name: "idempotencyKey",
      message: "Idempotency-Key",
    },
  ]);

  console.log(
    chalk.cyan(`\n触发: ${agentName} → POST workspace_agents/.../trigger\n`),
  );
  const result = await runTrigger({
    configPath,
    agentName,
    message: inputText,
    conversationKey: extras.conversationKey,
    idempotencyKey: extras.idempotencyKey,
  });
  console.log(chalk.green("✓ 202 Accepted"));
  console.log(JSON.stringify(result, null, 2));
  console.log(
    chalk.gray("\n说明：API 暂不支持拉取 agent 回复，仅入队。"),
  );
}

async function batchTriggerMenu(configPath: string) {
  const { config } = await loadConfig(configPath);
  const names = getEnabledAgentNames(config);
  if (!names.length) {
    console.log(chalk.yellow("没有已启用的 agent。"));
    return;
  }
  const pick = await prompts({
    type: "multiselect",
    name: "agents",
    message: "选择要批量触发的 agent（空格选择，回车确认）",
    choices: names.map((n) => ({ title: n, value: n })),
    min: 1,
  });
  if (!pick.agents?.length) return;
  const msg = await prompts({
    type: "text",
    name: "input",
    message: "共享 input",
    validate: (v) => (v?.trim() ? true : "必填"),
  });
  if (!msg.input) return;
  const { runBatchTrigger } = await import("../trigger-service.js");
  const results = await runBatchTrigger({
    configPath,
    agentNames: pick.agents,
    message: msg.input,
  });
  for (const r of results) {
    if (r.ok) console.log(chalk.green(`OK  ${r.agentName}`));
    else console.log(chalk.red(`ERR ${r.agentName}: ${r.error}`));
  }
}

export async function agentManagement(configPath: string) {
  while (true) {
    const { config } = await loadConfig(configPath);
    const entries = Object.entries(config.agents);
    console.log(chalk.cyan("\n--- Agent 管理 ---\n"));
    if (!entries.length) {
      console.log(chalk.gray("（暂无 agent）"));
    } else {
      for (const [name, ch] of entries) {
        const status =
          ch.enabled !== false ? chalk.green("[启用]") : chalk.gray("[禁用]");
        console.log(
          `  ${status} ${chalk.bold(name)} — ${ch.id}${ch.description ? ` · ${ch.description}` : ""}`,
        );
      }
    }
    console.log("");
    const action = await prompts(
      {
        type: "select",
        name: "op",
        message: "操作",
        choices: [
          { title: "← 返回", value: "back" },
          { title: "添加 agent", value: "add" },
          ...(entries.length
            ? [
                { title: "启用/禁用", value: "toggle" },
                { title: "删除 agent", value: "remove" },
              ]
            : []),
        ],
      },
      { onCancel: () => ({ op: "back" }) },
    );
    if (!action?.op || action.op === "back") break;
    try {
      if (action.op === "add") {
        const info = await prompts([
          { type: "text", name: "name", message: "配置名称" },
          { type: "text", name: "id", message: "agtch_ 通道 ID" },
          { type: "text", name: "description", message: "描述（可选）" },
          {
            type: "text",
            name: "tokenEnv",
            message: "token 环境变量（可选，默认全局）",
            initial: "",
          },
        ]);
        if (info.name && info.id) {
          await agentAdd({
            config: configPath,
            name: info.name,
            id: info.id,
            description: info.description || undefined,
            tokenEnv: info.tokenEnv?.trim() || undefined,
          });
        }
      } else if (action.op === "toggle") {
        const chChoice = await prompts({
          type: "select",
          name: "name",
          message: "选择 agent",
          choices: entries.map(([n, ch]) => ({
            title: `${ch.enabled !== false ? "[启用]" : "[禁用]"} ${n}`,
            value: n,
          })),
        });
        if (chChoice.name) {
          const target = config.agents[chChoice.name];
          await agentSetEnabled(
            { config: configPath, name: chChoice.name },
            target.enabled === false,
          );
        }
      } else if (action.op === "remove") {
        const chChoice = await prompts({
          type: "select",
          name: "name",
          message: "删除哪个 agent",
          choices: entries.map(([n]) => ({ title: n, value: n })),
        });
        if (chChoice.name) {
          const ok = await prompts({
            type: "confirm",
            name: "ok",
            message: `确认删除 "${chChoice.name}"？`,
            initial: false,
          });
          if (ok.ok) await agentRemove({ config: configPath, name: chChoice.name });
        }
      }
    } catch (e) {
      console.error(chalk.red(`错误: ${e instanceof Error ? e.message : e}`));
    }
    await pause();
  }
}

async function doctorMenu(configPath: string) {
  const { path, config } = await loadConfig(configPath);
  console.log(`配置: ${path ?? configPath}`);
  const names = Object.keys(config.agents);
  if (!names.length) {
    console.log(chalk.yellow("无 agent"));
    return;
  }
  let ok = true;
  for (const name of names) {
    const profile = config.agents[name];
    const envName =
      profile.tokenEnv ?? config.tokenEnv ?? "GPT_AGENT_ACCESS_TOKEN";
    const has = Boolean(process.env[envName]?.trim());
    console.log(`${has ? chalk.green("OK") : chalk.red("MISSING")} ${name}: ${envName}`);
    if (!has) ok = false;
  }
  if (!ok) console.log(chalk.yellow("\n请在环境中设置对应 token（Workspace Agents 范围）。"));
}

export async function showMenu(options?: { config?: string }) {
  getWorkspaceDir();
  const configPath = options?.config ?? getConfigPath();
  if (!existsSync(configPath) && !process.env.GPT_AGENT_CONFIG) {
    const { emptyConfig } = await import("../config-io.js");
    await saveConfig(emptyConfig(), configPath);
    console.log(chalk.gray(`已初始化配置: ${configPath}\n`));
  }

  while (true) {
    console.log(chalk.cyan(BANNER));
    console.log(
      chalk.gray(`  工作目录: ${getWorkspaceDir()}  |  配置: ${configPath}`),
    );
    console.log(getMenu());

    const response = await prompts(
      {
        type: "text",
        name: "choice",
        message: "请输入选项，回车确认",
        validate: (v: string) =>
          /^[1-5qQ]$/.test(v ?? "") ? true : "请输入 1-5 或 Q",
      },
      {
        onCancel: () => {
          console.log(chalk.cyan("\n再见！"));
          process.exit(0);
        },
      },
    );

    if (!response.choice) {
      console.log(chalk.cyan("\n再见！"));
      process.exit(0);
    }
    const choice = response.choice.toUpperCase();
    if (choice === "Q") {
      console.log(chalk.cyan("\n再见！"));
      process.exit(0);
    }

    try {
      switch (choice) {
        case "1":
          await guidedTrigger(configPath);
          await pause();
          break;
        case "2":
          await batchTriggerMenu(configPath);
          await pause();
          break;
        case "3":
          await agentManagement(configPath);
          break;
        case "4":
          await doctorMenu(configPath);
          await pause();
          break;
        case "5": {
          const { startWebServer } = await import("../web/server.js");
          console.log(chalk.cyan("启动 Web UI（Ctrl+C 结束）…"));
          await startWebServer(3847);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      console.error(chalk.red(`错误: ${e instanceof Error ? e.message : e}`));
      await pause();
    }
  }
}