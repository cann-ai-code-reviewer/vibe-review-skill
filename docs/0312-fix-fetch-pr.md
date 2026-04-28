# vibe-review Skill PR URL 处理修改方案（终稿）

> 日期：2026-03-12
> 对应 Issue：#1（gitcode.com PR URL 支持失败）
> 目标文件：`skills/vibe-review/SKILL.md`
> 状态：审核通过（修改后采纳）

---

## 1. 问题分析

### 1.1 当前失败链路（以 gitcode.com 为例）

用户执行 `/vibe-review https://gitcode.com/cann/ops-transformer/pull/2618` 后，skill 按以下顺序尝试获取 diff，全部失败：

| 步骤 | 操作 | 结果 | 根因 |
|------|------|------|------|
| 1 | `curl .../pull/2618.diff` | 301 -> HTML | gitcode 不支持 GitHub 风格的 `.diff` 后缀 |
| 2 | `curl -sL .../pull/2618.diff` | SPA HTML | 跟随重定向后仍返回 SPA 壳页面 |
| 3 | `WebFetch(url)` | 域名验证失败 | WebFetch 无法验证 gitcode.com 安全性 |
| 4 | gitcode API `/pulls/2618` | 400 UN_KNOW | API v5 需要认证 token |
| 5 | gitcode API `/pulls/2618/files` | 400 UN_KNOW | 同上 |
| 6 | `git fetch origin pull/2618/head:pr-2618` | fatal: couldn't find remote ref | gitcode 的 PR ref 格式与 GitHub 不同 |

最终耗时 5 分 34 秒，未产出任何审查结果。

### 1.2 根本原因

当前 SKILL.md 第 17 行对 PR/MR URL 的处理仅写了一句 "通过平台工具获取diff"，没有给出具体策略。Claude 只能靠自行推测逐一试错，导致：

1. **无平台适配逻辑**：不知道 gitcode 与 GitHub 的 diff 获取方式不同
2. **无降级策略**：没有"当 API/curl 失败时，通过 git clone + merge-base diff 的方式获取变更"的兜底方案
3. **allowed-tools 不足**：当前只允许 `git diff/log/show/remote`，不允许 `git clone`、`git fetch`、`git checkout` 等操作
4. **无临时工作目录概念**：skill 假设审查在用户当前仓库中进行，没有考虑 PR 对应的仓库可能不在本地

---

## 2. 解决方案概述

### 核心思路

放弃"通过 HTTP 获取 diff"的方式，改为**纯 git 操作**的通用方案：

```
PR URL -> 解析平台/org/repo/PR号 -> clone 目标仓库(blobless) -> fetch PR ref -> git merge-base + git diff 生成变更 -> 在仓库目录中执行 review -> 提示清理
```

优势：
- **平台无关**：只要能 `git clone`，就能工作，不依赖任何平台 API
- **无认证要求**：如果用户能 clone 仓库（本地有 git credentials），就能 review PR
- **复用现有 review 逻辑**：生成 diff 后，后续流程与 `git range` 审查完全相同

### 分层策略

| 优先级 | 策略 | 适用场景 | 耗时 |
|--------|------|----------|------|
| P0 | 检测当前仓库或用户配置的本地仓库路径 | 用户本地已有该仓库 | 最快（秒级） |
| P1 | GitHub 场景使用 `gh api` 获取 PR 信息 | GitHub 公开/私有仓库（已安装 gh CLI） | 快（数秒） |
| P2 | git clone（blobless）+ fetch PR ref | 所有场景的兜底方案 | 较慢（取决于仓库大小） |

---

## 3. SKILL.md 具体修改内容

### 3.1 `allowed-tools` 修改

**修改前：**
```yaml
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(git remote*), Bash(wc *)
```

**修改后：**
```yaml
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(git remote*), Bash(git clone*), Bash(git fetch*), Bash(git checkout*), Bash(git merge-base*), Bash(git rev-parse*), Bash(git branch*), Bash(gh api *), Bash(wc *), Bash(rm -rf /tmp/vibe-review-*), Bash(ls /tmp/vibe-review-*), Bash(mkdir -p /tmp/vibe-review-*)
```

### 3.2 新增 allowed-tools 清单及理由

| 命令模式 | 用途 | 审核说明 |
|----------|------|----------|
| `Bash(git clone*)` | blobless clone 目标仓库到临时目录 | -- |
| `Bash(git fetch*)` | fetch PR 的源分支 / PR ref | -- |
| `Bash(git checkout*)` | 切换到 PR head commit 以支持 Read/Grep 深度审查 | 仅在需要读取文件时使用，生成 diff 无需 checkout |
| `Bash(git merge-base*)` | 找到源分支与目标分支的分叉点 | 需要 blobless clone（非 shallow）才能正确工作 |
| `Bash(git rev-parse*)` | 解析分支引用、验证 ref 是否存在 | -- |
| `Bash(git branch*)` | 创建/列出本地分支 | -- |
| `Bash(gh api *)` | GitHub 场景获取 PR 元信息（自动处理认证） | 比 curl 更安全，仅限 GitHub API |
| `Bash(rm -rf /tmp/vibe-review-*)` | 清理临时目录 | 路径限制为 `/tmp/vibe-review-*` |
| `Bash(ls /tmp/vibe-review-*)` | 检查临时目录状态 | 路径限制为 `/tmp/vibe-review-*` |
| `Bash(mkdir -p /tmp/vibe-review-*)` | 创建临时目录 | 路径限制为 `/tmp/vibe-review-*`，而非宽泛的 `mkdir *` |

**移除项：**
- ~~`Bash(curl *)`~~：权限过于宽泛，存在数据外泄风险。GitHub 场景改用 `gh api`，其他平台走 clone 兜底
- ~~`Bash(cat /tmp/vibe-review-*)`~~：Read 工具已覆盖此功能，冗余

### 3.3 参数解析部分修改

**修改前（第 14-18 行）：**
```markdown
参数解析：
- 文件路径（如`src/foo.cpp`）-> 单文件审查
- git range（如`HEAD~3..HEAD`）-> `git diff <range>`获取变更
- PR/MR URL -> 通过平台工具获取diff
- 无参数 -> 询问用户要审查什么
```

**修改后：**
```markdown
参数解析：
- 文件路径（如`src/foo.cpp`）-> 单文件审查
- git range（如`HEAD~3..HEAD`）-> `git diff <range>`获取变更
- PR/MR URL -> 按下方"PR/MR URL 处理流程"章节执行
- 无参数 -> 询问用户要审查什么
```

### 3.4 新增章节："PR/MR URL 处理流程"

在参数解析部分之后、"## 当前环境" 之前，插入以下内容：

---

```markdown
### PR/MR URL 处理流程

当参数是 PR/MR 链接时，按以下步骤执行。

#### Step 1: 解析 URL

解析前先规范化 URL：移除 trailing slash、移除 `/files`、`/commits`、`/checks` 等 tab 页后缀、移除查询参数（`?` 及之后）、将 `http://` 统一为 `https://`。

从规范化后的 URL 中提取 PLATFORM、OWNER、REPO、PR_NUMBER：

| 平台    | URL 模式                                               |
| ------- | ------------------------------------------------------ |
| GitHub  | `github.com/{OWNER}/{REPO}/pull/{PR_NUMBER}`           |
| GitCode | `gitcode.com/{OWNER}/{REPO}/pull/{PR_NUMBER}`          |
| GitLab  | `gitlab.com/{OWNER}/{REPO}/-/merge_requests/{PR_NUMBER}` |
| Gitee   | `gitee.com/{OWNER}/{REPO}/pulls/{PR_NUMBER}`           |

注意：OWNER 可能包含 `/`（如 GitLab 子群组 `group/subgroup`）。
仓库 HTTPS 地址：`https://{PLATFORM}/{OWNER}/{REPO}.git`

#### Step 2: 检查本地是否已有该仓库

1. 检查当前工作目录是否就是目标仓库（`git remote -v` 比对 OWNER/REPO）
2. 若不是，检查 `standards-personal.md` 中是否声明了本地仓库路径映射
3. 若找到匹配的本地仓库 -> 在该仓库中 `git fetch origin` 后跳到 Step 4
4. 若均未命中 -> 进入 Step 3

#### Step 3: Clone 仓库

```bash
WORK_DIR="/tmp/vibe-review-{REPO}-{PR_NUMBER}"
rm -rf "$WORK_DIR"
git clone --filter=blob:none "https://{PLATFORM}/{OWNER}/{REPO}.git" "$WORK_DIR"
cd "$WORK_DIR"
```

关键说明：
- 使用 `--filter=blob:none`（blobless clone），保留完整 commit/tree 历史，仅按需下载 blob。这确保 `git merge-base` 能正确工作
- 不使用 `--depth=N`（shallow clone），因为 shallow clone 截断历史会导致 `git merge-base` 失败或返回错误结果
- 如果 clone 失败，提示用户："git clone 失败，请确认 git credentials 已配置"

#### Step 4: Fetch PR ref

按平台依次尝试不同的 PR ref 格式，首个成功即停止：

| 平台    | 优先尝试                             | 备选尝试                           |
| ------- | ------------------------------------ | ---------------------------------- |
| GitHub  | `pull/{PR_NUMBER}/head`              | --                                 |
| GitCode | `merge-requests/{PR_NUMBER}/head`    | `pull/{PR_NUMBER}/head`            |
| GitLab  | `merge-requests/{PR_NUMBER}/head`    | --                                 |
| Gitee   | `pull/{PR_NUMBER}/head`              | `merge-requests/{PR_NUMBER}/head`  |
| 未知    | 依次尝试上述所有格式                 | --                                 |

```bash
git fetch origin {REF_FORMAT}:pr-{PR_NUMBER}
```

对于 GitHub 平台且已安装 gh CLI，可优先通过 `gh api repos/{OWNER}/{REPO}/pulls/{PR_NUMBER}` 获取 PR 的 base/head 分支信息。

如果所有 ref 格式都 fetch 失败，告知用户手动提供分支名：
"/vibe-review 无法获取 PR ref，请手动提供：`/vibe-review {url} --base main --head feature-xxx`"

#### Step 5: 生成 diff

```bash
# 获取目标分支（默认检查 origin/main 或 origin/master）
TARGET_BRANCH=$(git rev-parse --verify origin/main 2>/dev/null && echo main || echo master)

# 找到分叉点
MERGE_BASE=$(git merge-base origin/$TARGET_BRANCH pr-{PR_NUMBER})

# 生成 diff
git diff $MERGE_BASE pr-{PR_NUMBER}
```

如果 diff 超过 5000 行，告知用户变更量大，建议分批审查。

#### Step 6: 执行 review 并提示清理

生成 diff 后，仅在需要 Read/Grep 文件内容进行深度审查时，再 `git checkout pr-{PR_NUMBER}`。

设定工作目录为仓库目录，按"## 1. 理解变更上下文"开始正常审查流程。

review 完成后，如果使用的是临时 clone 目录，在报告末尾提示：
"临时仓库保留在 `{WORK_DIR}`，如需清理：`rm -rf {WORK_DIR}`"
```

---

### 3.5 修改 "PR/MR审查" 部分（第 75-78 行）

**修改前：**
```markdown
PR/MR审查：
1. 通读所有diff，理解MR整体意图（新特性？bug修复？重构？）
2. 对每个变更的函数/类，主动读取：调用者（grep函数名）、所属类头文件、基类/派生类、同模块文件
3. 识别遗漏：基于MR意图，检查是否有应改而未改的地方
```

**修改后：**
```markdown
PR/MR审查（通过上方"PR/MR URL处理流程"已获得diff和仓库工作目录）：
1. 通读所有diff，理解MR整体意图（新特性？bug修复？重构？）
2. 对每个变更的函数/类，主动在仓库目录中读取：调用者（grep函数名）、所属类头文件、基类/派生类、同模块文件
3. 识别遗漏：基于MR意图，检查是否有应改而未改的地方
```

---

## 4. 各平台适配策略汇总

| 平台 | .diff 后缀 | API 匿名访问 | PR ref 格式 | 推荐策略 |
|------|-----------|-------------|-------------|----------|
| GitHub（公开） | 支持 | 支持 | `pull/{n}/head` | P1: gh api -> P2: clone |
| GitHub（私有） | 需 token | 需 token | `pull/{n}/head` | P0: 本地仓库 -> P1: gh api -> P2: clone |
| GitCode | 不支持 | 不支持 | `merge-requests/{n}/head`（需验证） | P0: 本地仓库 -> P2: clone |
| GitLab（公开） | 支持 | 支持 | `merge-requests/{n}/head` | P2: clone |
| GitLab（私有） | 需 token | 需 token | `merge-requests/{n}/head` | P0: 本地仓库 -> P2: clone |
| Gitee | 不支持 | 部分支持 | `pull/{n}/head`（需验证） | P0: 本地仓库 -> P2: clone |

### GitCode 特殊说明

GitCode 基于 GitLab CE 定制，但有以下差异：
1. URL 路径使用 `pull/{n}` 而非 GitLab 原生的 `merge_requests/{n}`
2. API 使用 v5（类似 Gitee）而非 GitLab v4
3. PR ref 优先尝试 `merge-requests/{n}/head`，失败则尝试 `pull/{n}/head`

---

## 5. 风险和注意事项

### 5.1 安全风险

| 风险 | 缓解措施 |
|------|----------|
| `git clone` 可能 clone 恶意仓库 | 限制 clone 目标为 `/tmp/vibe-review-*`，skill 不执行仓库中的任何脚本 |
| `rm -rf` 误删 | 限制为 `/tmp/vibe-review-*` 模式 |
| 临时目录泄露敏感代码 | 使用 `/tmp` 目录（重启自动清除），报告中提示用户清理 |
| 已移除 `curl *` | 避免任意 URL 访问和数据外泄风险，GitHub 场景用 `gh api` 替代 |
| `mkdir` 任意创建目录 | 已收窄为 `mkdir -p /tmp/vibe-review-*` |

### 5.2 性能风险

| 风险 | 缓解措施 |
|------|----------|
| 大仓库 clone 耗时长 | blobless clone 仅下载 commit/tree，blob 按需获取，远快于 full clone |
| 多次 fetch 尝试浪费时间 | 先检查本地仓库（P0），再 gh api（P1），最后 clone（P2） |
| diff 过大导致审查质量下降 | 超过 5000 行时提示用户分批审查 |

### 5.3 兼容性风险

| 风险 | 缓解措施 |
|------|----------|
| 某些平台的 PR ref 格式未知 | 依次尝试多种格式，全部失败时告知用户手动提供分支名 |
| git credentials 未配置 | clone 失败时给出清晰的错误提示 |
| `--filter=blob:none` 服务端不支持 | GitHub/GitLab/Gitee 均已支持；gitcode.com 需验证，不支持时回退到 full clone |

### 5.4 功能局限

1. **无法获取 PR 评论/讨论**：仅获取代码变更
2. **合并冲突未处理**：如 PR 与目标分支有冲突，diff 可能不完全反映最终合并结果
3. **依赖 git 命令行**：需要环境中有 git 且版本 >= 2.22（partial clone 支持）

---

## 6. 审核意见摘要

方案经过独立审核，以下是审核中发现的问题及其在终稿中的处理状态：

| # | 问题 | 严重程度 | 处理状态 |
|---|------|----------|----------|
| 1 | `--depth=100` shallow clone 与 `git merge-base` 不兼容 | 严重 | 已修复：改为 `--filter=blob:none` |
| 2 | `Bash(curl *)` 权限过于宽泛 | 严重 | 已修复：移除，GitHub 用 `gh api` 替代 |
| 3 | `Bash(mkdir *)` 模式过于宽泛 | 一般 | 已修复：收窄为 `Bash(mkdir -p /tmp/vibe-review-*)` |
| 4 | `Bash(cat /tmp/vibe-review-*)` 冗余 | 建议 | 已修复：移除，用 Read 工具替代 |
| 5 | Step 2 本地搜索路径硬编码 | 一般 | 已修复：改为检查当前仓库 + standards-personal.md 配置 |
| 6 | GitCode PR ref 格式未验证 | 一般 | 已标注：优先尝试 + 备选，实施前需实测 |
| 7 | URL 解析未覆盖常见变体 | 一般 | 已修复：增加 URL 规范化规则 |
| 8 | 新增章节篇幅较大 | 建议 | 已优化：精简 Step 合并、移除冗余说明 |
| 9 | checkout 触发大量 blob 下载 | 建议 | 已修复：明确仅在需要 Read/Grep 时 checkout |
| 10 | `--single-branch` 与多分支 fetch 冲突 | 一般 | 已修复：移除 `--single-branch` |
| 11 | 缺少 `gh api` 权限 | 建议 | 已修复：新增 `Bash(gh api *)` |

---

## 7. 实施检查清单

- [ ] 更新 `allowed-tools`（新增 git clone/fetch/checkout/merge-base/rev-parse/branch、gh api、临时目录操作）
- [ ] 修改参数解析第 17 行，指向新的处理流程章节
- [ ] 在参数解析和"当前环境"之间插入"PR/MR URL 处理流程"章节
- [ ] 更新"理解变更上下文"中的 PR/MR 审查说明
- [ ] 验证 gitcode.com 的 PR ref 格式（`merge-requests/{n}/head` vs `pull/{n}/head`）
- [ ] 验证 gitcode.com 是否支持 `--filter=blob:none`（partial clone）
- [ ] 在本地环境下使用 gitcode.com PR URL 实测
- [ ] 测试 GitHub 公开仓库 PR URL
- [ ] 测试无 git credentials 时的错误提示
