# gpt-agent

TypeScript 单体 CLI，用于通过 [Workspace Agents API](https://developers.openai.com/workspace-agents/trigger-runs) 触发已发布的 ChatGPT 工作区智能体。

**交互与目录结构对齐本机 `npx mpt-bench`（`mpt`）**：无参数进入 Banner + 数字菜单；配置默认 `~/.gpt-agent/config.yaml`；`gpt-agent agent` 子命令对标 `mpt channel`。

## 前置条件

- Node.js 20+
- ChatGPT 工作区已开启 Workspace Agents，且用户可创建 **Workspace Agents** 范围的 Access Token（`GPT_AGENT_ACCESS_TOKEN`）
- 在 ChatGPT 中发布智能体的 **API 通道**，获得 `agtch_...` 触发 ID

## 安装

```bash
npm install
npm run build
npm link   # 可选：全局使用 gpt-agent 命令
```

开发时可直接：

```bash
npm run dev -- list
```

## 配置

复制 `agents.example.yaml` 为 `agents.yaml`（或放在 `~/.config/gpt-agent/agents.yaml`），或通过 `GPT_AGENT_CONFIG` 指定路径。

```yaml
token_env: GPT_AGENT_ACCESS_TOKEN
default: escalation
agents:
  escalation:
    id: agtch_your_channel_id
```

## 双界面（对标 mpt 菜单分区）

| 分区 | mpt 类比 | gpt-agent |
| --- | --- | --- |
| **触发执行** | 一键压测 / 横评 | 菜单 `1` 一键触发、`2` 批量触发 |
| **配置管理** | 渠道管理 | 菜单 `3` Agent 管理；`gpt-agent agent list/add/...` |
| **Web** | — | 菜单 `5` 或 `gpt-agent serve` → `/agent.html` + `/setup.html` |

```bash
npx gpt-agent          # 或 npm run dev — 交互菜单（推荐）
gpt-agent agent list
gpt-agent agent add --name demo --id agtch_xxx
```

| 界面 | 终端快捷 | Web |
| --- | --- | --- |
| Agent 触发 | 菜单 `1` 或 `gpt-agent ui invoke` | `/agent.html` |
| 人类配置 | 菜单 `3` 或 `gpt-agent ui setup` | `/setup.html` |

```bash
npm run serve
# 浏览器打开 http://127.0.0.1:3847/
```

Web/API 使用**服务端进程环境变量**中的 token，不要在浏览器里填写密钥。`serve` 默认只监听 **127.0.0.1**（勿暴露到公网，无鉴权）。

## 常见调用方式（无 UI）

| 场景 | 命令 |
| --- | --- |
| 列出已配置 agent | `gpt-agent list` |
| 单次触发（默认 agent） | `gpt-agent run -m "Summarize this thread"` |
| 指定 agent | `gpt-agent trigger escalation -m "..."` |
| 从文件读入 | `gpt-agent run research -f prompt.txt` |
| 管道输入 | `cat email.txt \| gpt-agent run --stdin` |
| 同一会话多轮 | `gpt-agent run -k ticket_42 -m "Follow up"` |
| 幂等重试 | `gpt-agent trigger demo -m "..." --idempotency-key evt-001` |
| 多 agent 同一输入 | `gpt-agent batch escalation research -m "..."` |
| 批量幂等重试 | `gpt-agent batch a b -m "..." --idempotency-key evt-001` |
| 检查配置/令牌环境变量 | `gpt-agent doctor` |

### `batch` 与单次触发的差异

- **`conversation_key`**：单次 `run` / `trigger` 的 `-k` 会原样传给 API。`batch -k <prefix>` 会对每个 agent 发送 `<prefix>:<agentName>`（例如 `-k sprint1` + agent `research` → `sprint1:research`），避免多 agent 共用同一会话键。
- **`Idempotency-Key`**：`batch` 使用 `--idempotency-key`（或 `GPT_AGENT_IDEMPOTENCY_KEY`）时，对每个 agent 发送 `<key>:<agentName>`，与官方「同一事件重试用同一键」语义一致且互不冲突。
- **退出码**：任一 agent 触发失败则 `exit 1`；`--json` 输出每项 `ok` / `error` 便于脚本汇总。

成功时 API 返回 **202 Accepted**（无响应体）；当前版本**不能**通过 API 拉取 agent 回复，CLI 仅负责入队触发。

## 环境变量

- `GPT_AGENT_ACCESS_TOKEN` — 默认 Bearer 令牌
- `GPT_AGENT_CONFIG` — 配置文件路径
- `GPT_AGENT_IDEMPOTENCY_KEY` — 可选，全局默认幂等键

## 本地模拟（无真实令牌）

```bash
npm run mock:api          # 终端 1：202/401/404 等桩
GPT_AGENT_ACCESS_TOKEN=x npm run test:mock
GPT_AGENT_ACCESS_TOKEN=x npm run dev -- trigger ok -m "test" -c agents.mock.yaml
```

## 文档

- [Trigger runs](https://developers.openai.com/workspace-agents/trigger-runs)
- [Authentication](https://developers.openai.com/workspace-agents/authentication)