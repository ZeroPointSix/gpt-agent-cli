import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import {
  emptyConfig,
  loadOrEmpty,
  removeAgent,
  saveConfig,
} from "../config-io.js";
import { runTrigger } from "../trigger-service.js";
import type { AgentsConfig } from "../types.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

function publicDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "public"),
    join(process.cwd(), "src/web/public"),
    join(process.cwd(), "dist/web/public"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: import("node:http").ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

let memoryConfig: { path?: string; config: AgentsConfig } = {
  config: emptyConfig(),
};

export async function startWebServer(port = 3847): Promise<void> {
  const root = publicDir();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const path = url.pathname;

      if (path === "/api/health") {
        return json(res, 200, { ok: true, mode: "gpt-agent-web" });
      }

      if (path === "/api/config" && req.method === "GET") {
        const configPath = url.searchParams.get("configPath") ?? undefined;
        const loaded = configPath
          ? await loadOrEmpty(configPath)
          : memoryConfig.path
            ? await loadOrEmpty(memoryConfig.path)
            : await loadOrEmpty();
        if (Object.keys(loaded.config.agents).length) {
          memoryConfig = loaded;
        }
        return json(res, 200, {
          path: memoryConfig.path,
          config: memoryConfig.config,
        });
      }

      if (path === "/api/config" && req.method === "PUT") {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as {
          config?: AgentsConfig;
          configPath?: string;
          removeAgent?: string;
        };
        let config = body.config ?? memoryConfig.config;
        if (body.removeAgent && !body.config) {
          config = removeAgent(memoryConfig.config, body.removeAgent);
        }
        memoryConfig.config = config;
        const savePath = body.configPath ?? memoryConfig.path;
        memoryConfig.path = await saveConfig(config, savePath);
        return json(res, 200, memoryConfig);
      }

      if (path === "/api/doctor" && req.method === "GET") {
        const lines: { agent: string; env: string; ok: boolean }[] = [];
        for (const [name, profile] of Object.entries(memoryConfig.config.agents)) {
          const envName =
            profile.tokenEnv ??
            memoryConfig.config.tokenEnv ??
            "GPT_AGENT_ACCESS_TOKEN";
          lines.push({
            agent: name,
            env: envName,
            ok: Boolean(process.env[envName]?.trim()),
          });
        }
        return json(res, 200, { checks: lines });
      }

      if (path === "/api/trigger" && req.method === "POST") {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as {
          configPath?: string;
          agentName?: string;
          input?: string;
          conversationKey?: string;
          idempotencyKey?: string;
        };
        if (!body.input?.trim()) {
          return json(res, 400, { error: "input required" });
        }
        try {
          const result = await runTrigger({
            configPath: body.configPath ?? memoryConfig.path,
            agentName: body.agentName,
            message: body.input,
            conversationKey: body.conversationKey,
            idempotencyKey: body.idempotencyKey,
          });
          return json(res, 202, result);
        } catch (e) {
          return json(res, 500, {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      let filePath = path === "/" ? "/index.html" : path;
      const safe = join(root, filePath.replace(/\.\./g, ""));
      if (!safe.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(safe);
      const ext = extname(safe);
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      res.end(data);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve()),
  );
  console.log(`gpt-agent web UI: http://127.0.0.1:${port}/`);
  console.log("  · Agent 触发: /agent.html");
  console.log("  · 人类配置:   /setup.html");
}

