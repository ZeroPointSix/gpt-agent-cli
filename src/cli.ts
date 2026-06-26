#!/usr/bin/env node
import { Command } from "commander";
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

const program = new Command();

program
  .name("gpt-agent")
  .description(
    "Trigger published ChatGPT workspace agents (Workspace Agents API)",
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

const ui = program.command("ui").description("双界面：终端交互");

ui
  .command("invoke")
  .description("界面 1 — 参数化选择 agent 并触发")
  .action(async () => {
    const globalOpts = program.opts<{ config?: string }>();
    const { runAgentInvokeTui } = await import("./tui/agent-invoke.js");
    await runAgentInvokeTui({ configPath: globalOpts.config });
  });

ui
  .command("setup")
  .description("界面 2 — 人类配置向导（参考 mpt-bench 逐步选型）")
  .action(async () => {
    const globalOpts = program.opts<{ config?: string }>();
    const { runHumanSetupTui } = await import("./tui/human-setup.js");
    await runHumanSetupTui({ configPath: globalOpts.config });
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

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});