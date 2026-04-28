# PR/MR URL Review Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract PR/MR URL handling into a standalone file `pr-review.md`, loaded on demand by SKILL.md, with full clone-based diff workflow.

**Architecture:** SKILL.md detects PR URL in arguments and uses Read to load `pr-review.md`. The new file contains the complete flow: URL parsing → local repo check → clone/reuse → fetch PR ref → generate diff → hand off to review. `standards-personal.md` gains a repo mapping table for local path lookups.

**Tech Stack:** Git CLI, gh CLI (optional, GitHub only), Claude Code skill system

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `skills/vibe-review/SKILL.md` | Modify | Update `allowed-tools`, change PR/MR line in argument parsing to Read `pr-review.md` |
| `skills/vibe-review/pr-review.md` | Create | Full PR/MR URL handling flow (Steps 1-6) |
| `skills/vibe-review/references/standards-personal.md` | Modify | Add local repo mapping table |

---

## Chunk 1: Modify SKILL.md

### Task 1: Update allowed-tools in SKILL.md

**Files:**
- Modify: `skills/vibe-review/SKILL.md:5`

- [ ] **Step 1: Replace the allowed-tools line**

Replace line 5:
```yaml
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(git remote*), Bash(wc *)
```

With:
```yaml
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(git remote*), Bash(git clone*), Bash(git fetch*), Bash(git checkout*), Bash(git merge-base*), Bash(git rev-parse*), Bash(git branch*), Bash(gh api *), Bash(wc *), Bash(rm -rf /tmp/vibe-review-*), Bash(ls /tmp/vibe-review-*), Bash(mkdir -p /tmp/vibe-review-*)
```

- [ ] **Step 2: Verify frontmatter is valid**

Read `SKILL.md` lines 1-6 and confirm the YAML frontmatter is well-formed.

### Task 2: Update PR/MR argument parsing line in SKILL.md

**Files:**
- Modify: `skills/vibe-review/SKILL.md:17`

- [ ] **Step 1: Replace the PR/MR URL line**

Replace line 17:
```markdown
- PR/MR URL → 通过平台工具获取diff
```

With:
```markdown
- PR/MR URL → 使用 Read 工具读取 `skills/vibe-review/pr-review.md`，按其中的流程执行
```

### Task 3: Update PR/MR review section in SKILL.md

**Files:**
- Modify: `skills/vibe-review/SKILL.md:75-78`

- [ ] **Step 1: Replace the PR/MR review block**

Replace lines 75-78:
```markdown
PR/MR审查：
1. 通读所有diff，理解MR整体意图（新特性？bug修复？重构？）
2. 对每个变更的函数/类，主动读取：调用者（grep函数名）、所属类头文件、基类/派生类、同模块文件
3. 识别遗漏：基于MR意图，检查是否有应改而未改的地方
```

With:
```markdown
PR/MR审查（通过 `pr-review.md` 流程已获得 diff 和仓库工作目录）：
1. 通读所有diff，理解MR整体意图（新特性？bug修复？重构？）
2. 对每个变更的函数/类，主动在仓库目录中读取：调用者（grep函数名）、所属类头文件、基类/派生类、同模块文件
3. 识别遗漏：基于MR意图，检查是否有应改而未改的地方
```

- [ ] **Step 2: Commit SKILL.md changes**

```bash
git add skills/vibe-review/SKILL.md
git commit -m "feat: update SKILL.md to support PR URL review via pr-review.md"
```

---

## Chunk 2: Create pr-review.md

### Task 4: Create pr-review.md with PR/MR URL handling flow

**Files:**
- Create: `skills/vibe-review/pr-review.md`

- [ ] **Step 1: Write the complete pr-review.md file**

```markdown
# PR/MR URL 处理流程

当参数是 PR/MR 链接时，按以下步骤执行。

## Step 1: 解析 URL

解析前先规范化 URL：移除 trailing slash、移除 `/files`、`/commits`、`/checks` 等 tab 页后缀、移除查询参数（`?` 及之后）、将 `http://` 统一为 `https://`。

从规范化后的 URL 中提取 PLATFORM、OWNER、REPO、PR_NUMBER：

| 平台    | URL 模式                                                 |
| ------- | -------------------------------------------------------- |
| GitHub  | `github.com/{OWNER}/{REPO}/pull/{PR_NUMBER}`             |
| GitCode | `gitcode.com/{OWNER}/{REPO}/pull/{PR_NUMBER}`            |
| GitLab  | `gitlab.com/{OWNER}/{REPO}/-/merge_requests/{PR_NUMBER}` |
| Gitee   | `gitee.com/{OWNER}/{REPO}/pulls/{PR_NUMBER}`             |

注意：OWNER 可能包含 `/`（如 GitLab 子群组 `group/subgroup`）。
仓库 HTTPS 地址：`https://{PLATFORM}/{OWNER}/{REPO}.git`

同时解析可选参数：
- `--base <branch>`：用户指定的目标分支（PR 合入的目标），优先级最高

## Step 2: 检查本地是否已有该仓库

1. 检查当前工作目录是否就是目标仓库（`git remote -v` 比对 OWNER/REPO）
2. 若不是，读取本 skill 目录下的 `references/standards-personal.md` 中的"本地仓库映射"表格，查找 `{PLATFORM}/{OWNER}/{REPO}` 对应的本地路径
3. 若找到匹配的本地仓库 → 在该仓库中 `git fetch origin` 后跳到 Step 4
4. 若均未命中 → 进入 Step 3

## Step 3: Clone 或复用仓库

```bash
WORK_DIR="/tmp/vibe-review-{REPO}-{PR_NUMBER}"
```

如果 `$WORK_DIR` 已存在且是有效 git 仓库（`git -C "$WORK_DIR" rev-parse --git-dir` 成功），则复用：
```bash
cd "$WORK_DIR"
git fetch origin
```

否则重新 clone：
```bash
rm -rf "$WORK_DIR"
git clone --filter=blob:none "https://{PLATFORM}/{OWNER}/{REPO}.git" "$WORK_DIR"
cd "$WORK_DIR"
```

关键说明：
- 使用 `--filter=blob:none`（blobless clone），保留完整 commit/tree 历史，仅按需下载 blob。确保 `git merge-base` 能正确工作
- 不使用 `--depth=N`（shallow clone），因为 shallow clone 截断历史会导致 `git merge-base` 失败或返回错误结果
- 如果 clone 失败，提示用户："git clone 失败，请确认 git credentials 已配置"

## Step 4: Fetch PR ref

**GitHub 平台优先尝试 gh api（静默降级）：**

如果平台是 GitHub，依次检查：
1. `which gh` — 未安装则跳过
2. `gh api repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}` — 失败则跳过

若 `gh api` 成功，从返回 JSON 中提取：
- `base.ref` → TARGET_BRANCH（若用户未通过 `--base` 指定）
- `head.ref` → SOURCE_BRANCH
- 然后 `git fetch origin {SOURCE_BRANCH}:pr-{PR_NUMBER}` 并跳到 Step 5

**通用 ref fetch（所有平台的兜底方案）：**

按平台依次尝试不同的 PR ref 格式，首个成功即停止：

| 平台    | 优先尝试                          | 备选尝试                        |
| ------- | --------------------------------- | ------------------------------- |
| GitHub  | `pull/{PR_NUMBER}/head`           | --                              |
| GitCode | `merge-requests/{PR_NUMBER}/head` | `pull/{PR_NUMBER}/head`         |
| GitLab  | `merge-requests/{PR_NUMBER}/head` | --                              |
| Gitee   | `pull/{PR_NUMBER}/head`           | `merge-requests/{PR_NUMBER}/head` |
| 未知    | 依次尝试上述所有格式              | --                              |

```bash
git fetch origin {REF_FORMAT}:pr-{PR_NUMBER}
```

如果所有 ref 格式都 fetch 失败，告知用户：
"/vibe-review 无法获取 PR ref，请手动提供分支名：`/vibe-review {url} --base main --head feature-xxx`"

## Step 5: 生成 diff

确定目标分支（按优先级）：
1. 用户通过 `--base` 指定的分支
2. Step 4 中 `gh api` 返回的 `base.ref`
3. fallback：检查 `origin/main` 是否存在，存在则用 `main`，否则用 `master`

```bash
TARGET_BRANCH=<按上述优先级确定>

# 找到分叉点
MERGE_BASE=$(git merge-base origin/$TARGET_BRANCH pr-{PR_NUMBER})

# 生成 diff
git diff $MERGE_BASE pr-{PR_NUMBER}
```

如果 diff 超过 5000 行，告知用户变更量大，建议分批审查。

## Step 6: 执行 review 并提示清理

设定工作目录为仓库目录。仅在需要 Read/Grep 文件内容进行深度审查时，再 `git checkout pr-{PR_NUMBER}`。

按 SKILL.md 的"## 1. 理解变更上下文"开始正常审查流程。

review 完成后，如果使用的是临时 clone 目录，在报告末尾提示：
"临时仓库保留在 `{WORK_DIR}`，如需清理：`rm -rf {WORK_DIR}`"
```

- [ ] **Step 2: Verify the file was created correctly**

Read `skills/vibe-review/pr-review.md` and confirm all 6 steps are present and well-formatted.

- [ ] **Step 3: Commit pr-review.md**

```bash
git add skills/vibe-review/pr-review.md
git commit -m "feat: add pr-review.md for PR/MR URL handling flow"
```

---

## Chunk 3: Update standards-personal.md and final verification

### Task 5: Add local repo mapping table to standards-personal.md

**Files:**
- Modify: `skills/vibe-review/references/standards-personal.md` (append after line 92)

- [ ] **Step 1: Append the repo mapping section**

Add at the end of the file:

```markdown

## 本地仓库映射

PR/MR URL 审查时，skill 会查找此表以定位本地仓库，避免重复 clone。

| 仓库                                  | 本地路径                    |
| ------------------------------------- | --------------------------- |
| gitcode.com/cann/ops-transformer      | ~/repo/cann/ops-transformer |
```

注意：表格中只放一条示例行，用户按需自行添加。路径支持 `~` 展开。

- [ ] **Step 2: Commit standards-personal.md changes**

```bash
git add skills/vibe-review/references/standards-personal.md
git commit -m "feat: add local repo mapping table to standards-personal.md"
```

### Task 6: Final verification

- [ ] **Step 1: Verify SKILL.md allowed-tools contains all new commands**

Read `SKILL.md` line 5, confirm it includes: `git clone*`, `git fetch*`, `git checkout*`, `git merge-base*`, `git rev-parse*`, `git branch*`, `gh api *`, `rm -rf /tmp/vibe-review-*`, `ls /tmp/vibe-review-*`, `mkdir -p /tmp/vibe-review-*`.

- [ ] **Step 2: Verify SKILL.md argument parsing references pr-review.md**

Read `SKILL.md` line 17, confirm it says: `使用 Read 工具读取 \`skills/vibe-review/pr-review.md\``

- [ ] **Step 3: Verify pr-review.md exists and has all 6 steps**

Read `skills/vibe-review/pr-review.md`, confirm Steps 1-6 are all present.

- [ ] **Step 4: Verify standards-personal.md has the mapping table**

Read `skills/vibe-review/references/standards-personal.md`, confirm the "本地仓库映射" section exists at the end.

- [ ] **Step 5: Run git log to confirm all commits**

```bash
git log --oneline -5
```

Expected: 3 new commits on top of existing history.

---

## Chunk 4: Integration Testing

### Task 7: Smoke test with GitCode PR URL

使用真实 PR URL 执行 `/vibe-review`，验证完整流程是否走通。

- [ ] **Step 1: 测试 GitCode PR URL**

执行：
```
/vibe-review https://gitcode.com/cann/ops-transformer/pull/2752
```

验证点：
1. URL 解析正确：PLATFORM=gitcode.com, OWNER=cann, REPO=ops-transformer, PR_NUMBER=2752
2. Step 2 本地仓库检查：若当前目录不是 ops-transformer 且 standards-personal.md 无映射，应进入 Step 3
3. Step 3 clone 或复用：`/tmp/vibe-review-ops-transformer-2752` 目录被创建，blobless clone 成功
4. Step 4 fetch PR ref：至少一种 ref 格式（`merge-requests/2752/head` 或 `pull/2752/head`）fetch 成功
5. Step 5 生成 diff：`git merge-base` + `git diff` 产出非空 diff
6. Step 6 输出审查报告，末尾有临时目录清理提示

- [ ] **Step 2: 测试临时目录复用**

不清理 `/tmp/vibe-review-ops-transformer-2752`，再次执行：
```
/vibe-review https://gitcode.com/cann/ops-transformer/pull/2752
```

验证点：
1. 不重新 clone，而是 `git fetch origin` 更新
2. 后续流程正常产出审查报告

- [ ] **Step 3: 记录 GitCode PR ref 格式**

根据 Step 1 的实测结果，记录 gitcode.com 实际生效的 ref 格式（`merge-requests/{n}/head` 还是 `pull/{n}/head`），更新 `pr-review.md` 中 GitCode 行的优先级顺序（如果需要）。

### Task 8: Smoke test with GitHub public PR URL

- [ ] **Step 1: 找一个 GitHub 公开仓库的 PR URL 进行测试**

选择一个小型公开仓库的 PR（用户提供或自行选取），执行 `/vibe-review <url>`。

验证点：
1. `gh api` 路径是否生效（如已安装 gh 且已登录）
2. 若 `gh api` 不可用，是否静默降级到 `pull/{n}/head` ref fetch
3. diff 生成和审查报告正常输出

### Task 9: Test error handling

- [ ] **Step 1: 测试无 git credentials 场景**

对一个需要认证但未配置 credentials 的仓库 URL 执行 `/vibe-review`。

验证点：
1. clone 失败时输出清晰提示："git clone 失败，请确认 git credentials 已配置"
2. 不进入无限重试

- [ ] **Step 2: 测试无效 PR 号**

对一个不存在的 PR 号执行 `/vibe-review`（如将 PR 号改为 999999）。

验证点：
1. fetch ref 失败后输出提示，建议用户手动提供 `--base` 和 `--head`
2. 不进入无限重试
