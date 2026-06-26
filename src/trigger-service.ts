import { loadConfig, resolveAgent, resolveToken } from "./config.js";
import { WorkspaceAgentsClient } from "./api.js";
import { resolveInput } from "./input.js";
import type { TriggerOptions, TriggerResult } from "./types.js";

export function resolveIdempotencyKey(
  explicit?: string,
  suffix?: string,
): string | undefined {
  const base = explicit ?? process.env.GPT_AGENT_IDEMPOTENCY_KEY;
  if (!base?.trim()) return undefined;
  const trimmed = base.trim();
  return suffix ? `${trimmed}:${suffix}` : trimmed;
}

export type RunTriggerParams = {
  configPath?: string;
  agentName?: string;
  message?: string;
  file?: string;
  stdin?: boolean;
  conversationKey?: string;
  idempotencyKey?: string;
};

export async function runTrigger(
  params: RunTriggerParams & { configOverride?: import("./types.js").AgentsConfig },
): Promise<TriggerResult> {
  const { config } = params.configOverride
    ? { config: params.configOverride }
    : await loadConfig(params.configPath);
  const { name, profile } = resolveAgent(config, params.agentName);
  const token = resolveToken(config, profile);
  const input = await resolveInput({
    message: params.message,
    file: params.file,
    stdin: params.stdin,
  });

  const client = new WorkspaceAgentsClient(
    config.baseUrl ?? "https://api.chatgpt.com",
    token,
  );

  const triggerOpts: TriggerOptions = {
    input,
    conversationKey: params.conversationKey,
    idempotencyKey: resolveIdempotencyKey(params.idempotencyKey),
  };

  return client.trigger(profile.id, name, triggerOpts);
}

export type BatchTriggerParams = {
  configPath?: string;
  agentNames: string[];
  message?: string;
  file?: string;
  stdin?: boolean;
  conversationKeyPrefix?: string;
  idempotencyKey?: string;
};

export type BatchItem =
  | ({ ok: true } & TriggerResult)
  | { ok: false; agentName: string; agentId: string; error: string };

export async function runBatchTrigger(
  params: BatchTriggerParams,
): Promise<BatchItem[]> {
  const { config } = await loadConfig(params.configPath);
  const input = await resolveInput({
    message: params.message,
    file: params.file,
    stdin: params.stdin,
  });

  const results: BatchItem[] = [];
  for (const agentName of params.agentNames) {
    const { name, profile } = resolveAgent(config, agentName);
    const token = resolveToken(config, profile);
    const client = new WorkspaceAgentsClient(
      config.baseUrl ?? "https://api.chatgpt.com",
      token,
    );
    const conversationKey = params.conversationKeyPrefix
      ? `${params.conversationKeyPrefix}:${name}`
      : undefined;
    try {
      const result = await client.trigger(profile.id, name, {
        input,
        conversationKey,
        idempotencyKey: resolveIdempotencyKey(params.idempotencyKey, name),
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
  return results;
}