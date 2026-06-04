# Tasks: Subagent Statusline Monitor

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700-1,000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 capture contract → PR 2 API normalization → PR 3 web monitor/docs |
| Delivery strategy | auto-forecast |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Emit structured run records | PR 1 | Global plugin only; manual fixture verification included. |
| 2 | Normalize monitor APIs | PR 2 | `server.js` endpoints over `subagent-runs.ndjson`. |
| 3 | Render web monitor | PR 3 | UI, styles, README, manual accessibility checks. |

## Phase 1: Capture Contract

- [x] 1.1 Add `SubagentRunRecord`/`RunStatus` helpers in `src/opencode/plugins/subagent-tracer.ts` with schema v1 and optional `usage`.
- [x] 1.2 Add append-only writer for `logs/<project>/subagent-runs.ndjson`, preserving existing `opencode-events.ndjson` and `subagent-timeline.md` writes.
- [x] 1.3 Capture native `task`/`delegate` starts from `tool.execute.before`, including project, delegation/session IDs when available, agent, model, action, and status `running`.
- [x] 1.4 Capture terminal records from `tool.execute.after`, mapping errors to `failed` and known success to `completed`; keep missing outcome/model/usage explicit.
- [x] 1.5 Investigate which OpenCode hook exposes token/context usage; record unavailable metadata as omitted/unknown, not inferred.
- [x] 1.6 Investigate whether native `task` and background `delegate` need a `source` discriminator while keeping `recordKind: "subagent.run"` stable.
- [x] 1.7 Version the global plugin source in `src/opencode/plugins/subagent-tracer.ts` and add `npm run install-plugin` sync script.
- [x] 1.8 Replace hardcoded local paths with `.env`-driven portable install/runtime configuration.

## Phase 2: API Normalization

- [x] 2.1 Add `readProjectRuns()` in `server.js` to parse `subagent-runs.ndjson`, skip invalid lines, and return empty runs when absent.
- [x] 2.2 Add pure normalization helpers in `server.js` for status mapping, duration math, unknown labels, and newest-record-per-run merging.
- [x] 2.3 Add `GET /api/projects/:project/runs?status=active|recent|all&limit=50` using structured records only.
- [x] 2.4 Add `GET /api/projects/:project/runs/:key` lookup by delegation ID, parent session ID, or child session ID.
- [x] 2.5 Keep `/timeline` and `/events` endpoints as debug data, not canonical monitor state.

## Phase 3: Web Monitor

- [ ] 3.1 Update `public/index.html` with active runs, recent runs, run detail, and raw debug tab regions using semantic landmarks and buttons.
- [ ] 3.2 Update `public/app.js` to fetch run APIs, render cards/details with `textContent`, copy session IDs, and stop deriving canonical state from timeline regex.
- [ ] 3.3 Update `public/styles.css` with status chips, dense master/detail layout, visible focus, responsive behavior, and reduced-motion-safe refreshes.
- [ ] 3.4 Update `README.md` to document `subagent-runs.ndjson`, endpoints, optional metadata, and raw log fallback.

## Phase 4: Verification

- [ ] 4.1 Create temporary fixture logs and verify active/recent/detail API responses with `npm start` and `curl`.
- [ ] 4.2 Manually verify UI scenarios: active work, terminal run detail, missing model/usage labels, copy links, and raw debug tabs.
- [ ] 4.3 Restart OpenCode and confirm the global plugin writes structured records without breaking existing timeline/events logs.
