/**
 * Local stub for Workspace Agents trigger endpoint (integration smoke tests).
 * Usage: npx tsx src/mock-server.ts
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT ?? 8787);

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url?.includes("/workspace_agents/")) {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.url.includes("agtch_forbidden")) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.url.includes("agtch_missing")) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.url.includes("agtch_conflict")) {
      res.writeHead(409);
      res.end();
      return;
    }
    res.writeHead(202);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.error(`mock workspace agents API on http://127.0.0.1:${port}`);
});