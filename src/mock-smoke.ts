import { WorkspaceAgentsClient } from "./api.js";

const base = process.env.MOCK_BASE ?? "http://127.0.0.1:8787";

async function main() {
  const client = new WorkspaceAgentsClient(base, "Bearer-test-token");
  const ok = await client.trigger("agtch_ok_demo", "ok", { input: "hello" });
  if (ok.status !== 202 || !ok.accepted) throw new Error("expected 202");
  try {
    await client.trigger("agtch_missing", "bad", { input: "x" });
    throw new Error("expected 404");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("404")) throw e;
  }
  console.log("mock-smoke: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});