#!/usr/bin/env node
import { Command } from "commander";
import { getWorkspaceDir } from "./utils/workspace.js";
import { loadConfig, resolveAgent, resolveToken } from "./config.js";
import { WorkspaceAgentsClient } from "./api.js";
import { resolveInput } from "./input.js";
import type { TriggerOptions } from "./types.js";

function resolveIdempotencyKey(
  explicit?: string,
  suffix?: string,
): string | undefined {
  const base = explicit ?? process.env.GPT_AGENT_IDEMPOTENCY_KEY;
  if (!base?.trim()) return undefined;
  const trimmed = base.trim();
  return suffix ? `${trimmed}:${suffix}` : trimmed;
}

getWorkspaceDir();

const program = new Command();

program
  .name("gpt-agent")
  .description(
    `触发 ChatGPT Workspace Agents（API 入队 202）

无子命令时进入交互式菜单（设计对齐 npx mpt-bench / mpt）。

  gpt-agent                    交互式菜单（推荐）
  gpt-agent agent list         管理 agent（对标 mpt channel list）
  gpt-agent run -m "..."       命令行触发`,
  )
  .option(
    "-c, --config <path>",
    "Path to agents.yaml (or GPT_AGENT_CONFIG / ./agents.yaml)",
  )
  .showHelpAfterError();

program
  .command("list")
  .description("List configured agents")
  .action(async () => {
    const globalOpts = program.opts<{ config?: string }>();
    const { path, config } = await loadConfig(globalOpts.config);
    if (path) console.error(`Config: ${path}`);
    const names = Object.keys(config.agents);
    if (!names.length) {
      console.log("No agents configured. Copy agents.example.yaml to agents.yaml.");
      return;
    }
    for (const name of names.sort()) {
      const a = config.agents[name];
      const def = config.default === name ? " (default)" : "";
      const desc = a.description ? ` — ${a.description}` : "";
      console.log(`${name}${def}: ${a.id}${desc}`);
    }
  });

const triggerAction = async (
  agentArg: string | undefined,
  opts: {
    message?: string;
    file?: string;
    stdin?: boolean;
    conversationKey?: string;
    idempotencyKey?: string;
  },
) => {
  const globalOpts = program.opts<{ config?: string }>();
  const { config } = await loadConfig(globalOpts.config);
  const { name, profile } = resolveAgent(config, agentArg);
  const token = resolveToken(config, profile);
  const input = await resolveInput({
    message: opts.message,
    file: opts.file,
    stdin: opts.stdin,
  });

  const triggerOpts: TriggerOptions = {
    input,
    conversationKey: opts.conversationKey,
    idempotencyKey: resolveIdempotencyKey(opts.idempotencyKey),
  };

  const client = new WorkspaceAgentsClient(
    config.baseUrl ?? "https://api.chatgpt.com",
    token,
  );
  const result = await client.trigger(profile.id, name, triggerOpts);

  if (program.opts<{ json?: boolean }>().json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Accepted (202): queued trigger for agent "${result.agentName}" (${result.agentId}).`,
    );
    console.log(
      "Note: API does not return run output yet; response retrieval is coming soon.",
    );
  }
};

program
  .command("trigger [agent]")
  .description("Queue a one-shot agent run (POST trigger → 202 Accepted)")
  .option("-m, --message <text>", "Input text for the agent")
  .option("-f, --file <path>", "Read input from file")
  .option("--stdin", "Read input from stdin (pipe or redirect)")
  .option(
    "-k, --conversation-key <key>",
    "Stable key to continue the same agent conversation",
  )
  .option(
    "--idempotency-key <key>",
    "Safe retry: same key returns original accepted outcome",
  )
  .action(triggerAction);

program
  .command("run [agent]")
  .description("Alias for trigger (common agent invocation style)")
  .option("-m, --message <text>", "Input text for the agent")
  .option("-f, --file <path>", "Read input from file")
  .option("--stdin", "Read input from stdin")
  .option("-k, --conversation-key <key>", "Conversation continuity key")
  .option("--idempotency-key <key>", "Idempotency key for retries")
  .action(triggerAction);

program
  .command("batch")
  .description(
    "Trigger multiple agents with the same input (fan-out workflow hook)",
  )
  .argument("<agents...>", "Agent names from config")
  .option("-m, --message <text>", "Shared input")
  .option("-f, --file <path>", "Shared input file")
  .option("--stdin", "Shared stdin input")
  .option("-k, --conversation-key <key>", "Shared conversation key prefix")
  .option(
    "--idempotency-key <key>",
    "Per-agent idempotency: sent as <key>:<agentName>",
  )
  .action(async (agentNames: string[], opts) => {
    const globalOpts = program.opts<{ config?: string; json?: boolean }>();
    const { config } = await loadConfig(globalOpts.config);
    const input = await resolveInput({
      message: opts.message,
      file: opts.file,
      stdin: opts.stdin,
    });

    const results = [];
    for (const agentName of agentNames) {
      const { name, profile } = resolveAgent(config, agentName);
      const token = resolveToken(config, profile);
      const client = new WorkspaceAgentsClient(
        config.baseUrl ?? "https://api.chatgpt.com",
        token,
      );
      const conversationKey = opts.conversationKey
        ? `${opts.conversationKey}:${name}`
        : undefined;
      try {
        const result = await client.trigger(profile.id, name, {
          input,
          conversationKey,
          idempotencyKey: resolveIdempotencyKey(opts.idempotencyKey, name),
        });
        results.push({ ok: true, ...result });
      } catch (e) {
        results.push({
          ok: false,
          agentName: name,
          agentId: profile.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (globalOpts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const r of results) {
        if (r.ok) {
          console.log(`OK  ${r.agentName} (${r.agentId})`);
        } else {
          console.log(`ERR ${r.agentName}: ${"error" in r ? r.error : "?"}`);
        }
      }
    }
    const failed = results.some((r) => !r.ok);
    process.exitCode = failed ? 1 : 0;
  });

program
  .command("init")
  .description("Print example agents.yaml to stdout")
  .action(() => {
    console.log(`# ~/.config/gpt-agent/agents.yaml or ./agents.yaml
token_env: GPT_AGENT_ACCESS_TOKEN
default: demo
base_url: https://api.chatgpt.com

agents:
  demo:
    id: agtch_replace_with_your_channel_id
    description: Example published API channel
`);
  });

program.option("--json", "Emit machine-readable JSON on success");

const agentCmd = program.command("agent").description("管理 agent 配置（对标 mpt channel）");

agentCmd
  .command("list")
  .description("列出所有 agent")
  .option("-f, --format <type>", "json")
  .action(async (opts) => {
    const { agentList } = await import("./cli/agent-cmd.js");
    const globalOpts = program.opts<{ config?: string }>();
    await agentList({ config: globalOpts.config, format: opts.format });
  });

agentCmd
  .command("add")
  .description("添加 agent")
  .requiredOption("--name <name>", "配置名称")
  .requiredOption("--id <id>", "agtch_ 通道 ID")
  .option("--description <text>", "描述")
  .option("--token-env <env>", "专用 token 环境变量")
  .action(async (opts) => {
    const { agentAdd } = await import("./cli/agent-cmd.js");
    const globalOpts = program.opts<{ config?: string }>();
    await agentAdd({
      config: globalOpts.config,
      name: opts.name,
      id: opts.id,
      description: opts.description,
      tokenEnv: opts.tokenEnv,
    });
  });

agentCmd
  .command("remove")
  .description("删除 agent")
  .requiredOption("--name <name>", "配置名称")
  .action(async (opts) => {
    const { agentRemove } = await import("./cli/agent-cmd.js");
    const globalOpts = program.opts<{ config?: string }>();
    await agentRemove({ config: globalOpts.config, name: opts.name });
  });

agentCmd
  .command("enable")
  .description("启用 agent")
  .requiredOption("--name <name>", "配置名称")
  .action(async (opts) => {
    const { agentSetEnabled } = await import("./cli/agent-cmd.js");
    const globalOpts = program.opts<{ config?: string }>();
    await agentSetEnabled({ config: globalOpts.config, name: opts.name }, true);
  });

agentCmd
  .command("disable")
  .description("禁用 agent")
  .requiredOption("--name <name>", "配置名称")
  .action(async (opts) => {
    const { agentSetEnabled } = await import("./cli/agent-cmd.js");
    const globalOpts = program.opts<{ config?: string }>();
    await agentSetEnabled({ config: globalOpts.config, name: opts.name }, false);
  });

const ui = program.command("ui").description("快捷入口（主菜单请直接运行 gpt-agent）");

ui
  .command("invoke")
  .description("等同菜单「1. 一键触发」")
  .action(async () => {
    const globalOpts = program.opts<{ config?: string }>();
    const { getConfigPath } = await import("./utils/workspace.js");
    const { guidedTrigger } = await import("./interactive/index.js");
    await guidedTrigger(globalOpts.config ?? getConfigPath());
  });

ui
  .command("setup")
  .description("等同菜单「3. Agent 管理」")
  .action(async () => {
    const globalOpts = program.opts<{ config?: string }>();
    const { getConfigPath } = await import("./utils/workspace.js");
    const { agentManagement } = await import("./interactive/index.js");
    await agentManagement(globalOpts.config ?? getConfigPath());
  });

program
  .command("serve [port]")
  .description("启动 Web 双页 UI（Agent 触发 + 人类配置）")
  .action(async (port?: string) => {
    const { startWebServer } = await import("./web/server.js");
    const p = Number(port ?? process.env.PORT ?? 3847);
    await startWebServer(p);
  });

program
  .command("doctor")
  .description("Validate config and token env vars (no API call)")
  .action(async () => {
    const globalOpts = program.opts<{ config?: string }>();
    const { path, config } = await loadConfig(globalOpts.config);
    console.log(path ? `Config: ${path}` : "Config: (none found, using empty)");
    const names = Object.keys(config.agents);
    if (!names.length) {
      console.log("WARN: no agents defined");
      process.exitCode = 1;
      return;
    }
    let ok = true;
    for (const name of names) {
      const profile = config.agents[name];
      const envName =
        profile.tokenEnv ?? config.tokenEnv ?? "GPT_AGENT_ACCESS_TOKEN";
      const has = Boolean(process.env[envName]?.trim());
      console.log(`${has ? "OK" : "MISSING"} ${name}: token env ${envName}`);
      if (!has) ok = false;
      if (!profile.id.startsWith("agtch_")) {
        console.log(`WARN ${name}: id should look like agtch_... (got ${profile.id})`);
      }
    }
    process.exitCode = ok ? 0 : 1;
  });

program.action(async () => {
  const globalOpts = program.opts<{ config?: string }>();
  const { showMenu } = await import("./interactive/index.js");
  await showMenu({ config: globalOpts.config });
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});