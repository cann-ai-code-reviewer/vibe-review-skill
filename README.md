# @tsukiyokai/vibe-review

Code review skill for [Claude Code](https://claude.ai/code).

Provides structured, confidence-graded code review with support for C++ and Python, covering coding standards compliance, security vulnerabilities, memory issues, and more.

## Install

```bash
# Global (recommended) — available in all projects
npx @tsukiyokai/vibe-review --global

# Project-level — only available in current project
npx @tsukiyokai/vibe-review
```

## Uninstall

```bash
npx @tsukiyokai/vibe-review --remove --global
npx @tsukiyokai/vibe-review --remove
```

## Usage

After installation, the skill is automatically available in Claude Code. Trigger it with:

- "review this file"
- "code review"
- "check coding standards"

Or invoke directly: `/vibe-review`

## What's included

- `SKILL.md` — Review workflow, confidence grading (HIGH/MEDIUM/LOW), output format template
- `references/` — Layered coding standards (company → product line → project → personal)

## License

MIT
