import chalk from "chalk";
import { loadConfig } from "../config.js";
import { saveConfig } from "../config-io.js";
import type { AgentProfile, AgentsConfig } from "../types.js";
import { getConfigPath } from "../utils/workspace.js";

function resolveConfigPath(explicit?: string): string {
  return explicit ?? getConfigPath();
}

async function loadWritable(explicit?: string) {
  const path = resolveConfigPath(explicit);
  const { config } = await loadConfig(path);
  return { path, config };
}

export async function agentList(options: { config?: string; format?: string }) {
  const { path, config } = await loadWritable(options.config);
  const agents = Object.entries(config.agents);
  if (options.format === "json") {
    console.log(JSON.stringify(config.agents, null, 2));
    return;
  }
  console.log(`配置文件: ${path}\n`);
  console.log(
    "名称             agtch ID                      token_env                    状态",
  );
  console.log("-".repeat(90));
  for (const [name, ch] of agents) {
    const enabled = ch.enabled !== false;
    const status = enabled ? chalk.green("[启用]") : chalk.gray("[禁用]");
    const id = (ch.id || "").padEnd(28);
    const env = (ch.tokenEnv ?? config.tokenEnv ?? "GPT_AGENT_ACCESS_TOKEN").padEnd(
      28,
    );
    console.log(`${name.padEnd(16)} ${id} ${env} ${status}`);
  }
  const enabledCount = agents.filter(([, a]) => a.enabled !== false).length;
  console.log(`\n共 ${agents.length} 个 agent，${enabledCount} 个已启用`);
}

export async function agentAdd(options: {
  config?: string;
  name: string;
  id: string;
  description?: string;
  tokenEnv?: string;
  model?: string;
}) {
  const { path, config } = await loadWritable(options.config);
  if (config.agents[options.name]) {
    throw new Error(`agent "${options.name}" 已存在`);
  }
  const profile: AgentProfile = {
    id: options.id,
    description: options.description,
    tokenEnv: options.tokenEnv,
    enabled: true,
  };
  config.agents[options.name] = profile;
  if (!config.default) config.default = options.name;
  await saveConfig(config, path);
  console.log(`agent "${options.name}" 添加成功`);
}

export async function agentRemove(options: { config?: string; name: string }) {
  const { path, config } = await loadWritable(options.config);
  if (!config.agents[options.name]) {
    throw new Error(`agent "${options.name}" 未找到`);
  }
  delete config.agents[options.name];
  if (config.default === options.name) {
    config.default = Object.keys(config.agents)[0];
  }
  await saveConfig(config, path);
  console.log(`agent "${options.name}" 删除成功`);
}

export async function agentSetEnabled(
  options: { config?: string; name: string },
  enabled: boolean,
) {
  const { path, config } = await loadWritable(options.config);
  const profile = config.agents[options.name];
  if (!profile) throw new Error(`agent "${options.name}" 未找到`);
  profile.enabled = enabled;
  await saveConfig(config, path);
  console.log(`agent "${options.name}" 已${enabled ? "启用" : "禁用"}`);
}

export function getEnabledAgentNames(config: AgentsConfig): string[] {
  return Object.entries(config.agents)
    .filter(([, p]) => p.enabled !== false)
    .map(([n]) => n);
}