export type AgentProfile = {
  /** Stable public trigger id, e.g. agtch_XXX */
  id: string;
  description?: string;
  /** Env var name holding bearer token; falls back to global token_env */
  tokenEnv?: string;
  /** 对齐 mpt channel.enabled：参与 batch / 引导默认列表 */
  enabled?: boolean;
};

export type AgentsConfig = {
  /** Base URL override, default https://api.chatgpt.com */
  baseUrl?: string;
  /** Default env var for access token when agent has no tokenEnv */
  tokenEnv?: string;
  /** Named agent used when command omits agent name */
  default?: string;
  agents: Record<string, AgentProfile>;
};

export type TriggerOptions = {
  input: string;
  conversationKey?: string;
  idempotencyKey?: string;
};

export type TriggerResult = {
  status: number;
  accepted: boolean;
  agentName: string;
  agentId: string;
};