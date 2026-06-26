# [Design] 后续演进方向与产品想法

> **状态**：设计讨论草稿（Cloud Agent 生成，可直接复制为 GitHub Issue）  
> **前提**：官方 Workspace Agents API 当前仅 **202 入队**，无 run id / 无响应体

---

## 设计原则（建议写进 CONTRIBUTING）

1. **保持薄封装**：不引入对话状态机，除非官方提供 retrieve/run status API
2. **双界面不变**：界面 A（触发）与界面 B（配置）继续共用 `trigger-service` / `config-io`
3. **mpt 对齐仅限 UX 骨架**：不引入压测引擎、RPM 调度、mpt 数据集
4. **密钥永不进 UI**：Web/交互只读 `process.env`，未来 OAuth 也走系统级回调而非浏览器存 token

---

## 短期（v0.2，与 API 现状匹配）

### 1. Trigger 审计日志

- 路径：`~/.gpt-agent/logs/triggers.jsonl`（目录已在 `workspace.ts` 创建）
- 字段：`ts`, `agentName`, `agentId`, `inputHash`（SHA256 前 8 位，不存明文）, `conversationKey`, `idempotencyKey`, `httpStatus`, `configPath`
- 用途：运维回溯「是否成功入队」、脚本对账
- CLI：`gpt-agent logs [--tail N] [--agent name]`

### 2. `--dry-run` / `--verbose`

- `--dry-run`：打印将 POST 的 URL、headers（token 打码）、body，不发起请求
- `-v`：打印 config 路径、resolved agent、conversation/idempotency 最终值
- 对标 mpt 执行前确认，降低首次接入踩坑成本

### 3. 输入模板与变量替换

```yaml
# agents.yaml 扩展示意（可选）
agents:
  triage:
    id: agtch_xxx
    input_template: |
      Ticket: {{TICKET_ID}}
      Body:
      {{INPUT}}
```

- CLI：`gpt-agent run triage -m "..." --var TICKET_ID=INC-42`
- 或从 env 自动注入 `GPT_AGENT_VAR_*`

### 4. batch 并发与限速

- 现状：串行 `for` 循环
- 提案：`--concurrency N`（默认 1）+ 遇 429 指数退避
- 保持幂等键后缀策略不变

### 5. 发布与 CI

- GitHub Actions：`typecheck` + 起 mock server 跑 `test:mock`
- `npm publish` 或 GitHub Release 附 `npx` 可用 tarball
- 版本与 CHANGELOG 自动化

---

## 中期（等官方 API 能力）

### 6. Response retrieval 适配层

当官方提供「查询 run / 拉取 agent 输出」时：

```
src/
  api.ts          # 新增 getRun / pollRun
  retrieve.ts     # 可选：gpt-agent wait <agent> --run-id ...
```

- CLI 新增 `wait` 子命令，**默认超时 + 非 0 退出码**
- 不在 v0.1 假装 polling；README 已说明边界，此处仅预留接口形状

### 7. 事件驱动触发（Webhook ingress）

```
外部系统 → POST localhost:3847/api/hooks/<agent> → runTrigger
```

- 场景：Slack / GitHub / 内部队列回调触发 agent
- 安全：HMAC 签名 + 仅 127.0.0.1 或 Unix socket
- 与「人类点 Web 触发」共用 `trigger-service`

### 8. 多 Profile / 多工作区

对标 mpt 多环境：

```yaml
profiles:
  prod:
    base_url: https://api.chatgpt.com
    token_env: GPT_AGENT_PROD_TOKEN
  staging:
    base_url: https://api.chatgpt.com
    token_env: GPT_AGENT_STAGING_TOKEN
```

- CLI：`gpt-agent --profile prod run ...`
- 与现有单文件 config 向后兼容（无 profiles 时行为不变）

---

## 长期 / 开放问题

| 话题 | 想法 | 风险 |
| --- | --- | --- |
| 与 ChatGPT 产品内会话联动 | conversation_key 文档化最佳实践；是否支持从 CLI 生成推荐 key 格式 | 官方 key 语义可能变化 |
| Agent 发现 | 若未来有 list agents API，加 `gpt-agent agent sync` | 依赖未发布 API |
| 结构化 input | JSON schema 校验后再 POST | API 是否只接受 string input |
| 团队共享配置 | git 管理 `agents.yaml` + 本地 override | 密钥仍不进 repo |
| TUI 增强 | 用 `@inquirer/prompts` 或 blessed 做历史/搜索 | 维护成本 vs 价值 |

---

## 与 mpt-bench 的边界（再次确认）

**应继续借鉴：**

- 菜单分区、channel/agent CRUD、doctor、引导式一键执行
- 配置实体 + enabled 开关

**不应引入：**

- 压测 RPM、数据集、HTML 报告、横评引擎
- 除非明确要做「Workspace Agents 触发 SLA 压测」独立子产品

若未来要做触发链路压测，建议 **独立 repo** 或 `gpt-agent bench` 可选插件，避免污染主 CLI 的「薄封装」定位。

---

## 讨论问题（欢迎在 Issue 回复）

1. Canonical 配置路径最终定 `~/.gpt-agent/config.yaml` 还是项目级 `agents.yaml` 优先？
2. Web UI 是否需要「触发历史」面板（读 jsonl）？
3. 是否接受 breaking change：v0.2 统一 CLI batch 实现并调整 save 路径行为？
4. npm 包名：`gpt-agent` vs `@zeropointsix/gpt-agent`？
