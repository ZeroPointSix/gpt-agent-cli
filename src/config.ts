import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentProfile, AgentsConfig } from "./types.js";

const DEFAULT_BASE = "https://api.chatgpt.com";
const DEFAULT_TOKEN_ENV = "GPT_AGENT_ACCESS_TOKEN";

const CONFIG_CANDIDATES = [
  process.env.GPT_AGENT_CONFIG,
  join(process.cwd(), "agents.yaml"),
  join(process.cwd(), "agents.yml"),
  join(process.cwd(), "gpt-agent.yaml"),
  join(homedir(), ".config", "gpt-agent", "agents.yaml"),
].filter((p): p is string => Boolean(p));

export async function findConfigPath(explicit?: string): Promise<string | undefined> {
  if (explicit) {
    const p = resolve(explicit);
    return p;
  }
  for (const candidate of CONFIG_CANDIDATES) {
    try {
      await readFile(candidate, "utf8");
      return resolve(candidate);
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function normalizeProfile(raw: Record<string, unknown>): AgentProfile {
  const id = raw.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Each agent must have a non-empty string `id` (agtch_...).");
  }
  return {
    id: id.trim(),
    description: typeof raw.description === "string" ? raw.description : undefined,
    tokenEnv:
      typeof raw.token_env === "string"
        ? raw.token_env
        : typeof raw.tokenEnv === "string"
          ? raw.tokenEnv
          : undefined,
  };
}

export async function loadConfig(explicitPath?: string): Promise<{
  path?: string;
  config: AgentsConfig;
}> {
  const path = await findConfigPath(explicitPath);
  if (!path) {
    return {
      config: {
        baseUrl: DEFAULT_BASE,
        tokenEnv: DEFAULT_TOKEN_ENV,
        agents: {},
      },
    };
  }

  const text = await readFile(path, "utf8");
  const raw = path.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid config file: ${path}`);
  }

  const obj = raw as Record<string, unknown>;
  const agentsRaw = obj.agents;
  if (!agentsRaw || typeof agentsRaw !== "object") {
    throw new Error(`Config must contain an \`agents\` map: ${path}`);
  }

  const agents: Record<string, AgentProfile> = {};
  for (const [name, value] of Object.entries(agentsRaw)) {
    if (!value || typeof value !== "object") {
      throw new Error(`Agent "${name}" must be an object.`);
    }
    agents[name] = normalizeProfile(value as Record<string, unknown>);
  }

  return {
    path,
    config: {
      baseUrl:
        typeof obj.base_url === "string"
          ? obj.base_url
          : typeof obj.baseUrl === "string"
            ? obj.baseUrl
            : DEFAULT_BASE,
      tokenEnv:
        typeof obj.token_env === "string"
          ? obj.token_env
          : typeof obj.tokenEnv === "string"
            ? obj.tokenEnv
            : DEFAULT_TOKEN_ENV,
      default: typeof obj.default === "string" ? obj.default : undefined,
      agents,
    },
  };
}

export function resolveAgent(
  config: AgentsConfig,
  name?: string,
): { name: string; profile: AgentProfile } {
  const key = name ?? config.default;
  if (!key) {
    throw new Error(
      "Agent name required. Pass as argument or set `default` in config.",
    );
  }
  const profile = config.agents[key];
  if (!profile) {
    const known = Object.keys(config.agents).join(", ") || "(none)";
    throw new Error(`Unknown agent "${key}". Configured: ${known}`);
  }
  return { name: key, profile };
}

export function resolveToken(config: AgentsConfig, profile: AgentProfile): string {
  const envName = profile.tokenEnv ?? config.tokenEnv ?? DEFAULT_TOKEN_ENV;
  const token = process.env[envName];
  if (!token?.trim()) {
    throw new Error(
      `Missing access token. Set environment variable ${envName} (Workspace Agents scope).`,
    );
  }
  return token.trim();
}