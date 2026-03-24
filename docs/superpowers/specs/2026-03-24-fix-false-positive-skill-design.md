# 设计文档：fix-false-positive Skill

**日期**：2026-03-24
**状态**：已批准

---

## 背景与问题

vibe-review skill 在审查 ops-transformer 仓时产生误报。当前 `references/false-positives.md` 提供了手动维护误报模式的机制，但依赖人工直接修改 skill 文件，效率低且缺乏验证闭环。

**目标**：建立一套以 GitHub Issue 为入口、以 Claude 为执行者的误报修复流程，人只需录入 issue 和最终审核 PR。

---

## 方案选择

| 方案 | 描述 | 结论 |
|------|------|------|
| 新建独立 skill | 单一职责，与 vibe-review 解耦 | ✅ 采用 |
| 扩展 vibe-review | 在现有 skill 内加 `--fix` 模式 | 逻辑混杂，放弃 |
| 脚本 + skill 分工 | 机械步骤用脚本，语义步骤用 skill | 调试复杂，放弃 |

---

## 整体流程

```
人发现误报
  → 提 GitHub Issue（填写 PR 链接、审查原文、误报理由）
  → 执行 /fix-false-positive [issue-number]
  → Claude 拉取 issue → 分析 → 修改 skill 文件
  → 验证：重新审查原 PR（最多3轮迭代）
  → 验证通过：创建 PR + 发布验证报告 comment
  → 人在 PR 里审核并合并
```

---

## Section 1：GitHub Issue 模板

**Label**：`false-positive`（用于批量拉取过滤）

**必填字段**：

```markdown
## 误报信息

**PR 链接**：https://github.com/org/ops-transformer/pull/123

**误报发现（粘贴审查报告原文）**：
### #3 [严重] 空指针解引用
- 位置：`src/ops/relu.cpp:45`
- 规则：红线1.5
- 置信度：较确定
...

**为什么是误报**：
该指针在工厂函数中保证非空，CreateOp() 失败时直接 throw，不会返回 nullptr。
```

规则 ID 从审查原文中自动解析，不需要单独填写。

---

## Section 2：Skill 工作流

### 触发方式

```bash
/fix-false-positive                  # 处理所有 label=false-positive 的 open issues
/fix-false-positive 42               # 只处理 issue #42
/fix-false-positive 42 43 44         # 处理指定的多个 issue
```

### 处理步骤（每个 issue）

```
1. 解析 issue
   - 提取 PR URL、审查原文（含规则 ID）、误报理由

2. 阅读现有规则
   - 读取 SKILL.md、false-positives.md、standards-project-ops-transformer.md

3. 判断修改位置（Claude 自主决定）
   - 规则覆盖太宽 → 修改 standards-project-xxx.md 或 SKILL.md 中的规则描述
   - 已知代码模式例外 → 追加条目到 false-positives.md

4. 执行修改

5. 验证循环（最多3轮）
   ┌─ 清理 /tmp/vibe-review-{REPO}-{PR_NUMBER}（确保干净工作区）
   ├─ 对 issue 里的 PR 重新跑 vibe-review
   ├─ 判定标准：Claude 判断新报告中是否仍存在"相同根因"的发现
   │   - 相同根因：规则 ID 相同 + 同一代码位置（允许行号因代码变动而偏移）
   │   - 若发现已消失或降为"待确认" → 验证通过，退出循环
   │   - 若相同根因的发现仍以"确定"或"较确定"出现 → 本轮失败
   ├─ 失败 → 重新分析修改方案，再次修改，进入下一轮
   │   每轮修改后立即 `git add` 但不 commit（等验证通过后一次性 commit）
   └─ 第3轮仍失败 → `git checkout -- <modified-files>` 回滚本 issue 的所有修改
                    → 在原 issue 下发布失败报告 comment，标记为"需人工处理"

6. 验证通过后：
   - `git add` + `git commit`（commit message 含 issue 编号，如 `fix: 修复误报 #42`）
   - 记录验证报告（含轮次和修改内容）
```

### 批量处理策略

- 多个 issue 逐一串行处理（避免修改冲突）
- 某个 issue 验证失败不影响其他 issue 的处理
- 所有 issue 处理完毕后，若至少有一个 issue 验证通过，则创建 PR；若全部失败则不创建 PR，失败报告已在各 issue 下发布

---

## Section 3：文件结构

### 新增文件

```
skills/fix-false-positive/
  SKILL.md          ← 本 skill 的全部逻辑
```

### 修改目标文件（运行时修改，非新增）

```
skills/vibe-review/references/false-positives.md
skills/vibe-review/references/standards-project-ops-transformer.md
skills/vibe-review/SKILL.md（仅在规则本身需要收窄时）
```

### Skill frontmatter 中的 allowed-tools

```yaml
allowed-tools:
  - Read
  - Edit
  - Write
  - Grep
  - Glob
  - Bash(gh api *)
  - Bash(gh issue *)
  - Bash(gh pr *)
  - Bash(git checkout *)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(git push *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git show *)
  - Bash(git remote *)
  - Bash(git fetch *)
  - Bash(git clone *)
  - Bash(git merge-base *)
  - Bash(git rev-parse *)
  - Bash(git branch *)
  - Bash(wc *)
  - Bash(rm -rf /tmp/vibe-review-*)
  - Bash(ls /tmp/vibe-review-*)
  - Bash(mkdir -p /tmp/vibe-review-*)
```

> 注：包含 vibe-review 的全部 allowed-tools，因为验证步骤需要执行完整的 PR 审查流程。

---

## Section 4：验证报告格式

每个 issue 的验证报告作为独立 comment 发布到 PR。

### 验证通过（第1轮）

```markdown
## 验证报告：#42

**误报**：`src/ops/relu.cpp:45` — 空指针解引用（红线1.5）
**修改位置**：`references/false-positives.md`
**修改内容**：追加工厂函数保证非空的已知模式

**验证结果**：✅ 通过（第1轮）

重新审查 PR #123 后，该发现未出现在报告中。

<details>
<summary>完整审查报告</summary>

[审查报告全文]

</details>
```

### 验证通过（多轮迭代）

```markdown
**验证结果**：✅ 通过（第2轮）

第1轮：修改了 false-positives.md，条件描述不够精确，发现仍出现。
第2轮：补充"工厂函数 throw 语义"的判断条件后通过。
```

### 验证失败（需人工处理）

```markdown
**验证结果**：❌ 失败（已迭代3轮，无法自动修复）

已回滚本 issue 的所有修改，请人工分析处理。

| 轮次 | 修改方案 | 失败原因 |
|------|----------|----------|
| 第1轮 | 追加 false-positives.md 条目 | 发现仍出现 |
| 第2轮 | 收窄规则描述 | 发现仍出现 |
| 第3轮 | 修改置信度判断逻辑 | 发现仍出现 |
```

---

## PR 结构

- **分支名**：`fix/false-positive-issues-42-43`
- **PR 标题**：`fix: 修复误报 #42 #43`
- **PR 描述**：列出处理的 issue 编号及结论（通过/失败）；仅验证通过的 issue 使用 `Closes #N`，失败的 issue 使用 `Related #N`
- **验证报告**：每个 issue 一条独立 comment（通过和失败的均发布）
- **推送目标**：`origin`（当前仓库的主 remote）

---

## 约束与边界

- 本 skill 仅处理 vibe-review 的误报，不处理其他 skill 的问题
- 验证步骤必须通过才能将该 issue 纳入 PR，失败的 issue 不阻塞其他 issue
- Claude 不修改 `google-cpp-style-guide.md` 等外部引用文件
- issue 缺少必填字段时，跳过该 issue 并在终端提示（解析失败不中断批量流程）
- 向 `false-positives.md` 追加条目时，必须插入到文件中已有的对应分类下（空指针类/整数溢出类等），保持文件结构；若无匹配分类则新建分类

---

## 成功标准

1. 人提 issue → Claude 自动修复并验证 → 人只需审核 PR
2. 验证报告清晰说明修改了哪里、为什么、验证结果如何
3. 误报修复后不引入新的漏报（验证步骤覆盖原 PR 全量审查）
