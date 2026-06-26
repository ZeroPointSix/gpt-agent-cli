# Issue 草稿

Cloud Agent 审查 `gpt-agent-cli` 后生成的 Issue 草稿。当前 GitHub Integration **无 Issues 读写权限**，请手动创建 Issue 或合并 PR 后由维护者粘贴。

| 文件 | 建议 Issue 标题 |
| --- | --- |
| [01-code-review-v0.1.md](./01-code-review-v0.1.md) | `[Review] v0.1 代码审查结论与待办` |
| [02-roadmap-design-ideas.md](./02-roadmap-design-ideas.md) | `[Design] 后续演进方向与产品想法` |

## 快速创建（本地有 `gh` 且具备 Issues 权限时）

```bash
gh issue create --title "[Review] v0.1 代码审查结论与待办" --body-file .github/ISSUE_DRAFTS/01-code-review-v0.1.md
gh issue create --title "[Design] 后续演进方向与产品想法" --body-file .github/ISSUE_DRAFTS/02-roadmap-design-ideas.md
```
