# Skill Registry

Generated: 2026-06-04
Project: agent-monitor
Scope rule: project skills override user skills; `sdd-*`, `_shared`, and `skill-registry` are intentionally omitted.

## Indexed Skills

| Skill | Scope | Trigger text | Path |
| --- | --- | --- | --- |
| branch-pr | user | creating, opening, or preparing PRs for review | `~/.config/opencode/skills/branch-pr/SKILL.md` |
| chained-pr | user | PRs over 400 lines, stacked PRs, review slices | `~/.config/opencode/skills/chained-pr/SKILL.md` |
| cognitive-doc-design | user | writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs | `~/.config/opencode/skills/cognitive-doc-design/SKILL.md` |
| comment-writer | user | PR feedback, issue replies, reviews, Slack messages, or GitHub comments | `~/.config/opencode/skills/comment-writer/SKILL.md` |
| find-skills | user | when the user asks for functionality that might exist as an installable skill | `~/.agents/skills/find-skills/SKILL.md` |
| flags-sdk | user | feature flags, A/B testing, experimentation, `flags/*`, Vercel Flags CLI | `~/.agents/skills/flags-sdk/SKILL.md` |
| go-testing | user | Go tests, coverage, Bubbletea teatest, golden files | `~/.config/opencode/skills/go-testing/SKILL.md` |
| issue-creation | user | creating GitHub issues, bug reports, or feature requests | `~/.config/opencode/skills/issue-creation/SKILL.md` |
| judgment-day | user | judgment day, dual review, adversarial review, juzgar | `~/.config/opencode/skills/judgment-day/SKILL.md` |
| modern-web-guidance | user | mandatory first step for HTML/CSS and client-side JS work | `~/.agents/skills/modern-web-guidance/SKILL.md` |
| nextjs-16 | user | Next.js 16, App Router, proxy.ts, route handlers, Server Components, caching | `~/.agents/skills/nextjs-16/SKILL.md` |
| skill-creator | user | new skills, agent instructions, documenting AI usage patterns | `~/.config/opencode/skills/skill-creator/SKILL.md` |
| skill-improver | user | improve skills, audit skills, refactor skills, skill quality | `~/.config/opencode/skills/skill-improver/SKILL.md` |
| supabase | user | any task involving Supabase products, auth, CLI, or schema work | `~/.agents/skills/supabase/SKILL.md` |
| supabase-postgres-best-practices | user | optimizing Postgres queries, schema, or database configuration | `~/.agents/skills/supabase-postgres-best-practices/SKILL.md` |
| work-unit-commits | user | implementation, commit splitting, chained PRs, reviewable work units | `~/.config/opencode/skills/work-unit-commits/SKILL.md` |

## Project Convention Files

No project-level `AGENTS.md`, `agents.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, or `copilot-instructions.md` were detected in this repository.

## Notes

- Runtime architecture depends on the repo-owned plugin source at `src/opencode/plugins/subagent-tracer.ts`, installed to `~/.config/opencode/plugins/subagent-tracer.ts` via `npm run install-plugin`.
- The project currently has no project-local skills under `.opencode/skills/` or other scanned project skill roots.
