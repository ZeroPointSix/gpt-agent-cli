import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { AgentProfile, AgentsConfig } from "./types.js";
import { findConfigPath } from "./config.js";

export function defaultConfigWritePath(): string {
  return join(process.cwd(), "agents.yaml");
}

export function configToYamlObject(config: AgentsConfig): Record<string, unknown> {
  const agents: Record<string, Record<string, unknown>> = {};
  for (const [name, p] of Object.entries(config.agents)) {
    const row: Record<string, unknown> = { id: p.id };
    if (p.description) row.description = p.description;
    if (p.tokenEnv) row.token_env = p.tokenEnv;
    agents[name] = row;
  }
  const out: Record<string, unknown> = { agents };
  if (config.tokenEnv) out.token_env = config.tokenEnv;
  if (config.default) out.default = config.default;
  if (config.baseUrl && config.baseUrl !== "https://api.chatgpt.com") {
    out.base_url = config.baseUrl;
  }
  return out;
}

export async function saveConfig(
  config: AgentsConfig,
  explicitPath?: string,
): Promise<string> {
  const path =
    explicitPath ??
    (await findConfigPath()) ??
    defaultConfigWritePath();
  const resolved = resolve(path);
  await mkdir(dirname(resolved), { recursive: true });
  const yaml = stringifyYaml(configToYamlObject(config), { lineWidth: 0 });
  await writeFile(resolved, yaml, "utf8");
  return resolved;
}

export async function loadOrEmpty(
  explicitPath?: string,
): Promise<{ path?: string; config: AgentsConfig }> {
  const { loadConfig } = await import("./config.js");
  return loadConfig(explicitPath);
}

export function emptyConfig(): AgentsConfig {
  return {
    baseUrl: "https://api.chatgpt.com",
    tokenEnv: "GPT_AGENT_ACCESS_TOKEN",
    agents: {},
  };
}

export function upsertAgent(
  config: AgentsConfig,
  name: string,
  profile: AgentProfile,
): AgentsConfig {
  return {
    ...config,
    agents: { ...config.agents, [name]: profile },
  };
}

export function removeAgent(config: AgentsConfig, name: string): AgentsConfig {
  const agents = { ...config.agents };
  delete agents[name];
  let def = config.default;
  if (def === name) def = undefined;
  return { ...config, agents, default: def };
}

export function suggestedHomeConfigDir(): string {
  return join(homedir(), ".config", "gpt-agent");
}