# Design: Subagent Statusline Monitor

## Technical Approach

Build the monitor contract first. The global tracer remains the runtime source of truth and will emit append-only structured run records beside the existing timeline/NDJSON logs. `server.js` will normalize those records into stable monitor APIs, and the vanilla web UI will render active/recent runs from API data while keeping raw logs as debug-only views. Native OpenCode statusline/TUI integration stays deferred until this contract is proven.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|--------------------------|-----------|
| Source of truth | Modify `src/opencode/plugins/subagent-tracer.ts` and install it with `npm run install-plugin` | Edit `~/.config/opencode/plugins/subagent-tracer.ts` by hand, build from `.opencode/plugin/subagent-tracer.ts`, or client-side regex parsing | The repo must own reviewable source; the global plugin is install output. Regex timeline parsing cannot reliably infer lifecycle/session state. |
| Storage shape | Append records to `logs/<project>/subagent-runs.ndjson` | Mutate one JSON file per run | Append-only NDJSON matches existing logging, survives partial writes, and is simple to normalize. |
| API layer | Normalize in `server.js` | Let `public/app.js` parse records | Server normalization gives web UI and future TUI/statusline consumers one contract. |
| UI pattern | Summary-first master/detail in existing no-build app | Add framework/router | Current project is vanilla HTML/CSS/JS; adding tooling is not justified. |

## Data Flow

```text
OpenCode hooks ──→ global subagent-tracer ──→ logs/<project>/subagent-runs.ndjson
       │                         │
       │                         └── existing timeline/events debug logs
       └── background-agents semantics reference

server.js ── normalizes records ──→ /api/projects/:project/runs
                                  └→ /api/projects/:project/runs/:key

public/app.js ── renders active/recent monitor + raw debug tabs
```

Missing fields stay explicit: consumers must show `Unknown`/`Unavailable`, never invent model, usage, or outcome data.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/opencode/plugins/subagent-tracer.ts` | Modify | Emit structured `subagent.run` records and keep existing timeline/events. |
| `scripts/install-opencode-plugin.js` | Create | Install/sync repo-owned plugin source to opencode's global plugin directory. |
| `~/.config/opencode/plugins/background-agents.ts` | Reference | Use delegation/session/status semantics: delegation ID, parent session, child session, terminal statuses. |
| `server.js` | Modify | Add run-record reader, normalization helpers, and monitor endpoints. |
| `public/index.html` | Modify | Add monitor regions: active runs, recent runs, run detail, and raw debug tabs. Keep semantic landmarks and accessible controls. |
| `public/app.js` | Modify | Fetch normalized APIs; render run cards/details; stop deriving canonical state via timeline regex. |
| `public/styles.css` | Modify | Add status chips, dense cards, responsive master/detail layout, visible focus, reduced-motion-safe updates. |
| `README.md` | Modify | Document contract file, endpoints, and known partial metadata behavior. |
| `.opencode/plugin/subagent-tracer.ts` | Deferred | Do not use as implementation target; later remove/deprecate to avoid drift. |

## Interfaces / Contracts

```ts
type RunStatus = "running" | "completed" | "failed" | "cancelled" | "timeout" | "unknown"

interface SubagentRunRecord {
  schemaVersion: 1
  recordKind: "subagent.run"
  projectName: string
  projectRoot: string
  delegationId: string | null
  parentSessionId: string | null
  parentMessageId?: string | null
  childSessionId: string | null
  agent: string | null
  model?: string | null
  status: RunStatus
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  durationMs?: number | null
  action?: string | null
  outcome?: string | null
  error?: string | null
  usage?: { inputTokens?: number; outputTokens?: number; contextPercent?: number } | null
  raw?: unknown
}
```

API endpoints:
- `GET /api/projects/:project/runs?status=active|recent|all&limit=50` → `{ project, runs }`
- `GET /api/projects/:project/runs/:key` → lookup by delegation ID, parent session ID, or child session ID.
- Existing `/timeline` and `/events` remain for debug tabs.

Normalization maps background-agent `complete` to API `completed`; all missing/unknown status values become `unknown`.

## UI Rendering Strategy

Use semantic HTML: one `h1`, `<main>`, `<aside>` for project/run navigation, `<section>` for detail, `<button>` for actions, and `<output aria-live="polite">` only for summarized refresh status to avoid noisy announcements. Render lists with DOM APIs and `textContent`. Use status chips with text plus color, never color alone. CSS should use custom properties, `:focus-visible`, logical spacing where practical, `@container` or responsive grid if needed, and `content-visibility: auto` for long recent-run lists.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Record normalization, status mapping, duration math, missing metadata | Add small Node assertion tests if a runner is introduced; otherwise extract pure functions and verify manually with fixtures. |
| Integration | API responses from sample `subagent-runs.ndjson` | Create fixture logs under a temporary project directory; run `npm start`; query endpoints with `curl`. |
| UI | Active/recent rendering, detail lookup, raw debug fallback, accessibility labels | Manual browser verification because no runner/linter/typechecker exists. |

## Migration / Rollout

No data migration required. Roll out by writing new `subagent-runs.ndjson` while preserving existing logs. If structured records are absent, API returns empty runs and the UI keeps raw debug views.

## Open Questions

- [ ] Which OpenCode hook reliably exposes token/context usage, if any?
- [ ] Should failed native `task` delegations and background `delegate` runs share one record kind or use a source discriminator?
