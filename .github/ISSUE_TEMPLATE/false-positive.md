---
name: 误报修复
about: 报告 vibe-review 的误报，由 Claude 自动修复
title: "误报：[规则ID] [简短描述]"
labels: false-positive
assignees: ''
---

## 误报信息

**PR 链接**：
<!-- 粘贴触发误报的 ops-transformer PR 链接，如 https://github.com/org/ops-transformer/pull/123 -->

**误报发现（粘贴审查报告原文）**：
<!-- 将 vibe-review 输出的完整发现块粘贴到此处，包含位置、规则、置信度等字段 -->

```
### #N [等级] 发现标题
- 位置：`文件:行号`
- 规则：规则编号
- 置信度：确定/较确定/待确认
（问题描述...）
```

**为什么是误报**：
<!-- 说明该发现不应被报出的原因，如：上游已判空、值域受限、RAII 管理等 -->
