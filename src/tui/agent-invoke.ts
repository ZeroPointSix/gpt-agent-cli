import { input, select, confirm, editor } from "@inquirer/prompts";
import { loadConfig } from "../config.js";
import { runTrigger } from "../trigger-service.js";

export type AgentInvokeOptions = {
  configPath?: string;
};

export async function runAgentInvokeTui(opts: AgentInvokeOptions): Promise<void> {
  const { path, config } = await loadConfig(opts.configPath);
  const names = Object.keys(config.agents).sort();
  if (!names.length) {
    console.error(
      "未配置 agent。请先运行: gpt-agent ui setup  或  gpt-agent serve 打开配置界面",
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n  gpt-agent · Agent 触发\n  （面向自动化/参数化调用，选定 agent 后入队触发）\n");
  if (path) console.log(`  配置: ${path}\n`);

  const agentName = await select({
    message: "选择要触发的 agent",
    default: config.default && names.includes(config.default) ? config.default : names[0],
    choices: names.map((n) => ({
      name: n === config.default ? `${n} (默认)` : n,
      value: n,
      description: config.agents[n].description ?? config.agents[n].id,
    })),
  });

  const inputMode = await select({
    message: "输入方式",
    choices: [
      { name: "单行消息", value: "line" },
      { name: "多行编辑器", value: "editor" },
      { name: "文件路径", value: "file" },
    ],
  });

  let message: string | undefined;
  let file: string | undefined;
  if (inputMode === "line") {
    message = await input({ message: "触发 input（传给 agent 的文本）" });
  } else if (inputMode === "editor") {
    message = await editor({
      message: "编辑触发内容（保存并退出编辑器以继续）",
      default: "在此输入要发给 workspace agent 的内容…",
    });
  } else {
    file = await input({ message: "输入文件路径" });
  }

  const useConv = await confirm({
    message: "设置 conversation_key（同一会话多轮）？",
    default: false,
  });
  const conversationKey = useConv
    ? await input({ message: "conversation_key" })
    : undefined;

  const useIdem = await confirm({
    message: "设置 Idempotency-Key（安全重试）？",
    default: false,
  });
  const idempotencyKey = useIdem
    ? await input({ message: "Idempotency-Key" })
    : undefined;

  const go = await confirm({
    message: `确认触发 agent「${agentName}」？`,
    default: true,
  });
  if (!go) {
    console.log("已取消。");
    return;
  }

  const result = await runTrigger({
    configPath: opts.configPath,
    agentName,
    message,
    file,
    conversationKey,
    idempotencyKey,
  });

  console.log("\n✓ 202 Accepted — 已入队");
  console.log(JSON.stringify(result, null, 2));
  console.log(
    "\n说明：Workspace Agents API 暂不支持拉取 agent 回复，仅触发入队。",
  );
}