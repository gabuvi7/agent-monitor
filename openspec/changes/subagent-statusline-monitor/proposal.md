# Proposal: Subagent Statusline Monitor

## Intent

Delegation should not mean losing control. This change establishes reliable subagent observability: agent/model, state, duration, parent/child sessions, outcome, and token/context usage when OpenCode exposes it.

## Scope

### In Scope
- Define a structured delegation/run contract emitted by the global tracer.
- Add normalized monitor APIs over raw timeline/events.
- Use the web UI as the first monitor: active/recent runs, status chips, run details, and child session copy/navigation.
- Keep raw timeline/events as debug views.

### Out of Scope
- Direct statusline/TUI integration before the contract exists.
- Changing background-agent delegation behavior.
- Treating token/context usage as guaranteed.
- Using the project-local prototype tracer as runtime truth.

## Capabilities

### New Capabilities
- `subagent-observability-contract`: structured run records for IDs, sessions, agent, model, lifecycle timestamps, status, outcome, and optional usage metadata.
- `subagent-monitor-api`: normalized APIs for active runs, recent completed/failed runs, run detail, and session/delegation lookup.
- `subagent-monitor-view`: web monitor behavior using dense, progressive disclosure before future TUI/statusline surfaces.

### Modified Capabilities
- None. No existing `openspec/specs/` capabilities are present.

## Approach

Follow exploration: solve semantics before rendering. Extend `src/opencode/plugins/subagent-tracer.ts` to emit first-class records, then install it to `~/.config/opencode/plugins/subagent-tracer.ts` via `npm run install-plugin`. Use the installed `background-agents.ts` plugin only as the reference for delegation IDs and child sessions. Normalize data in `server.js`; render `public/` from API data instead of regex-parsed timeline text.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/opencode/plugins/subagent-tracer.ts` | Modified | Emit structured records. |
| `scripts/install-opencode-plugin.js` | New | Sync repo-owned plugin source to opencode global plugin directory. |
| `~/.config/opencode/plugins/background-agents.ts` | Reference | Delegation/session semantics. |
| `server.js` | Modified | Add monitor endpoints. |
| `public/app.js` | Modified | Render monitor state. |
| `public/index.html` | Modified | Add master/detail structure. |
| `public/styles.css` | Modified | Add chips, hierarchy, dense details. |
| `.opencode/plugin/subagent-tracer.ts` | Deferred | Avoid dual-source drift. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Usage metadata is partial | Med | Optional fields and clear unknown states. |
| Tracer drift | Med | Target only the global plugin. |
| Noisy refresh UI | Med | Summary-first, debounced, expandable updates. |

## Rollback Plan

Revert global plugin changes and remove monitor endpoints/UI sections. Existing raw timeline/events APIs remain as fallback.

## Dependencies

- OpenCode event metadata availability.
- Global tracer and background-agent session semantics.

## Success Criteria

- [ ] Users can distinguish running, completed, and failed subagent work.
- [ ] Each run shows agent/model, duration, parent/child session IDs, and known outcome.
- [ ] Optional usage metadata never blocks rendering.
- [ ] Raw logs remain available for debugging.
