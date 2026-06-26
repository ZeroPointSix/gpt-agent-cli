import type { TriggerOptions, TriggerResult } from "./types.js";

export class WorkspaceAgentsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async trigger(
    agentId: string,
    agentName: string,
    options: TriggerOptions,
  ): Promise<TriggerResult> {
    const url = new URL(
      `/v1/workspace_agents/${encodeURIComponent(agentId)}/trigger`,
      this.baseUrl.replace(/\/$/, ""),
    );

    const body: Record<string, string> = { input: options.input };
    if (options.conversationKey) {
      body.conversation_key = options.conversationKey;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 202) {
      return {
        status: 202,
        accepted: true,
        agentName,
        agentId,
      };
    }

    const detail = await safeBody(res);
    const hint = mapErrorHint(res.status);
    throw new TriggerApiError(
      res.status,
      `Trigger failed (${res.status})${hint}: ${detail}`,
      agentName,
      agentId,
    );
  }
}

export class TriggerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly agentName: string,
    public readonly agentId: string,
  ) {
    super(message);
    this.name = "TriggerApiError";
  }
}

async function safeBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.trim() || "(empty body)";
  } catch {
    return "(could not read body)";
  }
}

function mapErrorHint(status: number): string {
  switch (status) {
    case 401:
      return " — token missing, expired, or invalid";
    case 403:
      return " — token cannot trigger this agent";
    case 404:
      return " — agent id not found or not visible";
    case 409:
      return " — channel/agent not in runnable state";
    case 429:
      return " — rate limited; retry later with same Idempotency-Key if applicable";
    default:
      if (status >= 500) {
        return " — server error; retry with same Idempotency-Key for safe replay";
      }
      return "";
  }
}