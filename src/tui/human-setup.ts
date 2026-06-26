import { confirm, input, select } from "@inquirer/prompts";
import {
  defaultConfigWritePath,
  emptyConfig,
  loadOrEmpty,
  removeAgent,
  saveConfig,
  upsertAgent,
} from "../config-io.js";
import type { AgentsConfig } from "../types.js";
import { resolveToken, resolveAgent } from "../config.js";
import { runTrigger } from "../trigger-service.js";

export type HumanSetupOptions = {
  configPath?: string;
};

async function doctorLine(config: AgentsConfig, name: string): Promise<string> {
  const profile = config.agents[name];
  const envName = profile.tokenEnv ?? config.tokenEnv ?? "GPT_AGENT_ACCESS_TOKEN";
  const has = Boolean(process.env[envName]?.trim());
  return `${has ? "✓" : "✗"} ${name} · token \`${envName}\``;
}

export async function runHumanSetupTui(opts: HumanSetupOptions): Promise<void> {
  let { path, config } = await loadOrEmpty(opts.configPath);
  if (!path && !Object.keys(config.agents).length) {
    config = emptyConfig();
  }

  console.log(
    "\n  gpt-agent · 人类配置向导\n  （参考 mpt-bench 式逐步选型：先配环境，再选 agent，可试跑）\n",
  );
  if (path) console.log(`  当前配置: ${path}\n`);

  let exit = false;
  while (!exit) {
    const action = await select({
      message: "配置步骤",
      choices: [
        { name: "全局：base_url / 默认 token 环境变量", value: "global" },
        { name: "设置默认 agent", value: "default" },
        { name: "添加或更新 agent", value: "upsert" },
        { name: "删除 agent", value: "remove" },
        { name: "查看当前配置摘要", value: "summary" },
        { name: "检查 token 环境变量 (doctor)", value: "doctor" },
        { name: "保存到 YAML", value: "save" },
        { name: "试触发一次（选中 agent）", value: "trial" },
        { name: "完成并退出", value: "exit" },
      ],
    });

    switch (action) {
      case "global": {
        config.baseUrl = await input({
          message: "API base_url",
          default: config.baseUrl ?? "https://api.chatgpt.com",
        });
        config.tokenEnv = await input({
          message: "默认 token 环境变量名",
          default: config.tokenEnv ?? "GPT_AGENT_ACCESS_TOKEN",
        });
        break;
      }
      case "default": {
        const names = Object.keys(config.agents);
        if (!names.length) {
          console.log("请先添加 agent。");
          break;
        }
        config.default = await select({
          message: "默认 agent",
          choices: names.map((n) => ({ name: n, value: n })),
          default: config.default,
        });
        break;
      }
      case "upsert": {
        const name = await input({
          message: "配置名称（CLI 里用的短名，如 escalation）",
        });
        const id = await input({
          message: "API 通道 id (agtch_...)",
          default: config.agents[name]?.id,
        });
        const description = await input({
          message: "描述（可选）",
          default: config.agents[name]?.description ?? "",
        });
        const tokenEnv = await input({
          message: "专用 token 环境变量（留空则用全局）",
          default: config.agents[name]?.tokenEnv ?? "",
        });
        config = upsertAgent(config, name, {
          id: id.trim(),
          description: description.trim() || undefined,
          tokenEnv: tokenEnv.trim() || undefined,
        });
        console.log(`已更新 agent「${name}」。`);
        break;
      }
      case "remove": {
        const names = Object.keys(config.agents);
        if (!names.length) break;
        const rm = await select({
          message: "删除哪个 agent",
          choices: names.map((n) => ({ name: n, value: n })),
        });
        if (await confirm({ message: `确认删除 ${rm}？`, default: false })) {
          config = removeAgent(config, rm);
        }
        break;
      }
      case "summary": {
        console.log("\n--- 配置摘要 ---");
        console.log(`base_url: ${config.baseUrl}`);
        console.log(`token_env: ${config.tokenEnv}`);
        console.log(`default: ${config.default ?? "(未设)"}`);
        for (const [n, a] of Object.entries(config.agents)) {
          console.log(`  ${n}: ${a.id}${a.description ? ` — ${a.description}` : ""}`);
        }
        console.log("---\n");
        break;
      }
      case "doctor": {
        const names = Object.keys(config.agents);
        if (!names.length) {
          console.log("无 agent。");
          break;
        }
        for (const n of names) {
          console.log(await doctorLine(config, n));
        }
        break;
      }
      case "save": {
        const savePath =
          path ??
          (await input({
            message: "保存路径",
            default: defaultConfigWritePath(),
          }));
        path = await saveConfig(config, savePath);
        console.log(`已保存: ${path}`);
        break;
      }
      case "trial": {
        try {
          const pick =
            Object.keys(config.agents).length > 1
              ? await select({
                  message: "试跑哪个 agent",
                  choices: Object.keys(config.agents).map((n) => ({
                    name: n,
                    value: n,
                  })),
                  default: config.default,
                })
              : Object.keys(config.agents)[0];
          if (!pick) {
            console.log("请先添加 agent。");
            break;
          }
          const { name } = resolveAgent(config, pick);
          resolveToken(config, config.agents[name]);
          const msg = await input({
            message: `试跑 input（agent: ${name}）`,
            default: "Hello from human setup wizard",
          });
          const result = await runTrigger({
            configPath: path,
            configOverride: config,
            agentName: name,
            message: msg,
          });
          console.log("试跑成功:", JSON.stringify(result));
        } catch (e) {
          console.error("试跑失败:", e instanceof Error ? e.message : e);
          console.error("可先保存配置、设置 token，或对 mock 使用 agents.mock.yaml");
        }
        break;
      }
      case "exit":
        if (
          Object.keys(config.agents).length &&
          (await confirm({
            message: "退出前保存配置？",
            default: true,
          }))
        ) {
          path = await saveConfig(config, path);
          console.log(`已保存: ${path}`);
        }
        exit = true;
        break;
    }
  }
}