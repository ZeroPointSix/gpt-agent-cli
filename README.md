# gpt-agent

TypeScript 单体 CLI，用于通过 [Workspace Agents API](https://developers.openai.com/workspace-agents/trigger-runs) 触发已发布的 ChatGPT 工作区智能体。

**交互与目录结构对齐本机 `npx mpt-bench`（`mpt`）**：无参数进入 Banner + 数字菜单；配置默认 `~/.gpt-agent/config.yaml`；`gpt-agent agent` 子命令对标 `mpt channel`。

## 设计说明

### 定位

`gpt-agent` 是 **Workspace Agents「触发入队」** 的薄封装，不做对话托管、不拉取 agent 回复（与[官方 API](https://developers.openai.com/workspace-agents/trigger-runs) 当前能力一致：成功为 **202 Accepted**，无 run id / 无响应体）。目标用户两类：

1. **人**：在终端或浏览器里选 agent、配 `agents.yaml`、试跑触发（对标 **mpt-bench** 里「人类选渠道 / 配参数再执行」）。
2. **自动化**：脚本 / CI 用子命令直接 `run` / `trigger` / `batch`，可 `--json`。

### 为什么参考 mpt-bench（`mpt`）

本仓库交互是 **对照已安装的 `npx mpt-bench`** 实现的，而不是抽象「某个 bench 文档」：

| 借鉴自 mpt | 在 gpt-agent 中的对应 |
| --- | --- |
| 无子命令 → Banner + 数字菜单（`prompts` + `chalk`） | `gpt-agent` 默认进入 `src/interactive/index.ts` |
| 工作目录 `~/.mpt/` + `config.yaml` | `~/.gpt-agent/config.yaml`（`src/utils/workspace.ts`） |
| `mpt channel`：list / add / remove / enable / disable | `gpt-agent agent`：同名语义，管理的是 **已发布 API 通道**（`agtch_...`） |
| 菜单分区：压测执行 / 配置管理 / 报告 | 触发执行（1–2）/ Agent 管理（3）/ doctor & Web（4–5） |
| 一键引导流（选渠道 → 填参数 → 执行） | 菜单 **1 一键触发**（选 agent → input → conversation / 幂等 → POST） |

**不照搬**：mpt 的压测引擎、数据集、HTML 报告、RPM 调度等属于 LLM 性能测试域；gpt-agent 只保留 **「配置实体 + 引导式触发 + 子命令脚本化」** 这一套 UX 骨架。

### 双界面（产品层）

从使用场景拆成两个界面，终端与 Web 各一份：

```
                    ┌─────────────────────────────────────┐
                    │           gpt-agent                 │
                    └─────────────────────────────────────┘
           ┌────────────────┴────────────────┐
           ▼                                 ▼
   【界面 A · Agent 触发】            【界面 B · 人类配置】
   选 agent + 填 input               增删改 agent 映射
   conversation_key / 幂等键          base_url / token_env / default
   面向：跑一次、批量跑               面向：首次接入、换通道 ID
           │                                 │
           ├─ 菜单 1 / 2                     ├─ 菜单 3 / agent 子命令
           ├─ ui invoke                      ├─ ui setup
           ├─ run / trigger / batch          ├─ setup.html
           └─ agent.html                     └─ 保存 config.yaml
```

- **界面 A** 只关心「这次发给哪个 agent、发什么」；token 来自环境变量，不在 UI 里填密钥。
- **界面 B** 对标 mpt 的 **渠道管理**：名称 → `agtch_` ID、可选专用 `token_env`、`enabled` 是否参与批量/默认列表。

Web（`gpt-agent serve`）与终端共用 `trigger-service` / `config-io`，避免两套逻辑分叉。

### 架构（单体 TypeScript）

```
src/
  cli.ts              Commander 入口；无子命令 → showMenu
  interactive/        mpt 风格主菜单与引导流
  cli/agent-cmd.ts    对标 mpt channel 的 CRUD + enable
  config.ts           加载 YAML；解析 agents 映射
  config-io.ts        写回 YAML
  trigger-service.ts  runTrigger / runBatchTrigger（CLI + Web 共用）
  api.ts              POST .../workspace_agents/{id}/trigger
  utils/workspace.ts  ~/.gpt-agent 初始化
  web/                静态双页 + 本机 API（127.0.0.1）
```

**数据流（单次触发）**：读 config → `resolveAgent` + `resolveToken(env)` → 组装 `{ input, conversation_key? }` + 可选 `Idempotency-Key` → `fetch` → 202 则打印/JSON；否则带状态码提示（401/403/404/409 等与文档对齐）。

### 配置模型

```yaml
token_env: GPT_AGENT_ACCESS_TOKEN   # 默认 Bearer 所在环境变量名
default: escalation                 # run/trigger 省略 agent 名时使用
base_url: https://api.chatgpt.com
agents:
  escalation:
    id: agtch_xxx                   # 必填：已发布 API 通道 ID
    description: optional
    token_env: optional             # 覆盖全局 token_env
    enabled: true                   # false 时不参与菜单批量列表（对标 mpt channel.enabled）
```

查找顺序：`GPT_AGENT_CONFIG` → `~/.gpt-agent/config.yaml` → 项目下 `agents.yaml` 等（见 `src/config.ts`）。

### 安全与边界

- **密钥**：仅通过环境变量注入；Web 与交互菜单均不收集 token 明文。
- **Web**：默认绑定 `127.0.0.1`，无登录；仅适合本机辅助，勿反代到公网。
- **API 边界**：不模拟「等待 agent 跑完」；需要结果时需等官方后续「retrieve response」能力或走 ChatGPT 产品内渠道。

### 本地开发辅助

- `mock-server.ts` + `agents.mock.yaml`：无真实令牌时验证 202/4xx 路径。
- 对抗式 workflow 审查用于核对与官方 trigger 文档、与 mpt UX 对齐度（见提交历史中的 review 结论）。

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

首次运行 `gpt-agent` 会在 **`~/.gpt-agent/config.yaml`** 生成空配置（与 mpt 写 `~/.mpt` 同理）。也可复制 `agents.example.yaml` 到项目 `agents.yaml`，或用 `GPT_AGENT_CONFIG` 指定路径。

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