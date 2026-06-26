import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const GPT_AGENT_HOME = join(homedir(), ".gpt-agent");

let initialized = false;

/** 对齐 mpt-bench：首次运行创建 ~/.gpt-agent/ */
export function getWorkspaceDir(): string {
  if (!initialized && !existsSync(GPT_AGENT_HOME)) {
    mkdirSync(join(GPT_AGENT_HOME, "logs"), { recursive: true });
    console.log(`已创建 gpt-agent 工作目录: ${GPT_AGENT_HOME}\n`);
  }
  initialized = true;
  return GPT_AGENT_HOME;
}

export function getConfigPath(): string {
  return join(getWorkspaceDir(), "config.yaml");
}

export function getLogsDir(): string {
  const dir = join(getWorkspaceDir(), "logs");
  mkdirSync(dir, { recursive: true });
  return dir;
}