# @tsukiyokai/vibe-review

[![npm](https://img.shields.io/npm/v/@tsukiyokai/vibe-review)](https://www.npmjs.com/package/@tsukiyokai/vibe-review)

[Claude Code](https://docs.anthropic.com/en/docs/claude-code)的代码审查skill —— 结构化、置信度分级、标准感知。支持C++和Python。

## 快速开始

```bash
npx @tsukiyokai/vibe-review --global
```

或通过 [skills.sh](https://skills.sh/) 安装：

```bash
npx skills add tsukiyokai/vibe-review-skill
```

安装后在Claude Code中即可使用：

```
> /vibe-review src/transport.cpp                    # 单文件审查
> /vibe-review HEAD~3..HEAD                         # git range审查
> /vibe-review https://github.com/org/repo/pull/42  # PR审查
```

## 核心能力

- 先读完整上下文（调用者、头文件、基类），再做判断
- 用工具验证每个发现 —— 不猜行号，不猜指针是否为空
- 标注置信度（确定 / 较确定 / 待确认）和严重级别（严重 / 一般 / 建议）
- 引用具体规则编号，过滤已知误报模式

## 工作流程

1. 解析目标 — 文件 / git range / PR URL
2. 加载分层标准
3. 读取完整上下文 — grep调用者、头文件、基类
4. 逐条检查必检规则 — 空指针、越界、格式串…
5. 工具验证每个发现
6. 输出结构化报告

## 分层标准

标准按层级加载 —— 外层是通用规则，内层是团队和项目的细化。skill自动识别当前仓库，加载匹配的标准层。

```
┌───────────────────────────────────────────┐
│ Company                                   │
│ ┌───────────────────────────────────────┐ │
│ │ Department                            │ │
│ │ ┌───────────────────────────────────┐ │ │
│ │ │ Product Line                      │ │ │
│ │ │ ┌───────────────────────────────┐ │ │ │
│ │ │ │ Project                       │ │ │ │
│ │ │ │ ┌───────────────────────────┐ │ │ │ │
│ │ │ │ │ Personal                  │ │ │ │ │
│ │ │ │ └───────────────────────────┘ │ │ │ │
│ │ │ └───────────────────────────────┘ │ │ │
│ │ └───────────────────────────────────┘ │ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

| 层级 | 文件 | 内容 |
| ---- | ---- | ---- |
| Company | `standards-company.md` | 公司级规范 |
| Department | `standards-dept.md` | 部门红线 & TOP-N |
| Product Line | `standards-productline-*.md` | 产品线规范 (CANN C++) |
| Project | `standards-project-*.md` | 项目级规范 (HCCL/FA/MC2) |
| Personal | `standards-personal.md` | 个人审查习惯 |

## 输出示例

````
## 变更概述

本MR为TcpTransport添加重试逻辑，涉及2个文件，新增45行。

## 审查发现

共发现3个问题（严重1 / 一般1 / 建议1）

---

### #1 [严重] 使用了禁用函数memcpy
- 位置：src/transport/tcp_transport.cpp:142
- 规则：2.18.1
- 置信度：确定

问题代码：
```cpp
memcpy(dst, src, len);
```

修复建议：
```cpp
errno_t ret = memcpy_s(dst, dstMax, src, len);
CHK_SAFETY_FUNC_RET(ret);
```

---

## 总结

建议优先处理1个严重问题。整体重试逻辑合理。
````

## 安装 / 卸载

```bash
# 方式一：npm
npx @tsukiyokai/vibe-review --global           # 全局安装
npx @tsukiyokai/vibe-review                    # 项目级安装
npx @tsukiyokai/vibe-review --remove --global  # 全局卸载
npx @tsukiyokai/vibe-review --remove           # 项目级卸载

# 方式二：skills.sh
npx skills add tsukiyokai/vibe-review-skill    # 安装
npx skills rm --global vibe-review             # 卸载
```

## 自定义

安装后编辑 `references/` 下的标准文件：

| 文件                    | 用途                |
| ----------------------- | ------------------- |
| `standards-company.md`  | 公司级编码规范      |
| `standards-dept.md`     | 部门红线及TOP-N问题 |
| `standards-personal.md` | 个人审查偏好        |
| `false-positives.md`    | 需要抑制的误报模式  |

如需支持新项目，创建 `standards-project-<name>.md` 并更新 `SKILL.md` 中的路由表。

## License

MIT
