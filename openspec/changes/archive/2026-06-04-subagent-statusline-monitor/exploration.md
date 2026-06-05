## Exploration: subagent-statusline-monitor

### Current State
The runtime source is now owned by the repo at `src/opencode/plugins/subagent-tracer.ts` and installed globally to `~/.config/opencode/plugins/subagent-tracer.ts` via `npm run install-plugin`. It writes centralized artifacts per project under `logs/<project-hash>/`: a human-readable `subagent-timeline.md`, raw `opencode-events.ndjson`, and structured `subagent-runs.ndjson`. The local `server.js` currently exposes raw read APIs and does no full normalization yet. The current web UI in `public/` is still mostly a passive log viewer. The project-local plugin at `.opencode/plugin/subagent-tracer.ts` is an older prototype and should not drive new product decisions.

### Affected Areas
- `src/opencode/plugins/subagent-tracer.ts` — emits the structured observability contract and is installed to the global opencode plugin path.
- `~/.config/opencode/plugins/background-agents.ts` — already creates delegation IDs, child sessions, parent session links, completion notifications, and persisted outputs; this is the best upstream source for session/task mapping semantics.
- `server.js` — currently serves raw files only; likely needs a normalization/API layer for sessions, tasks, statuses, durations, and drill-down views.
- `public/app.js` — currently parses text heuristically; would need stateful rendering for task lists, child sessions, status summaries, and navigation.
- `public/index.html` — layout is optimized for a single log pane, not for statusline-style monitoring or master/detail exploration.
- `public/styles.css` — would need support for dense status chips, hierarchy, progressive disclosure, and scroll affordances.
- `.opencode/plugin/subagent-tracer.ts` — should remain explicitly out of the main implementation path or be removed later to avoid dual-source confusion.

### Approaches
1. **UI-only log parsing** — Keep capture as-is and build richer views by mining timeline/NDJSON on the server or client.
   - Pros: Fastest path, low capture risk, minimal runtime disruption.
   - Cons: Session/task mapping stays heuristic, status accuracy is fragile, token/context usage remains inconsistent, and future TUI/statusline work would inherit weak data contracts.
   - Effort: Low

2. **Structured observability contract + normalized monitor API** — Extend the global plugin to emit first-class delegation/task records, then add server-side normalization and a richer monitor UI.
   - Pros: Reliable states, durations, parent/child session mapping, model attribution, failure/completion tracking, and optional token/context fields when present. Creates a reusable contract for both the web UI and a future statusline/TUI.
   - Cons: Requires coordinated changes across plugin, server, and UI. Needs careful handling for partial/missing metadata.
   - Effort: Medium

3. **Direct statusline/TUI integration first** — Skip the web viewer evolution and build an opencode-native statusline or terminal monitor immediately.
   - Pros: Closer to the user's end vision and better fits “don’t lose control while delegating.”
   - Cons: Premature without a stable capture/normalization contract; the same missing lifecycle/session fields would reappear in a harder-to-debug surface.
   - Effort: High

### Recommendation
Choose **Approach 2** and stage it in two layers: first define and capture a structured task/delegation model in the global plugin, then expose a normalized read API that the web UI can use as the reference monitor surface. This is the right foundation because the current bottleneck is not rendering — it is missing semantics. Once the contract can answer “who is running, under which parent session, for how long, with what outcome, and with what model/usage metadata when available,” a future statusline or TUI becomes an alternate presentation layer instead of a second observability system.

Recommended next slice:
- Promote delegation/session concepts to structured records: delegation ID, parent session ID, child session ID, agent, model, started/completed timestamps, status, summary/action text, and optional usage fields.
- Add server normalization endpoints such as current runs, recent completed runs, run detail, and session/delegation lookup.
- Evolve the UI from raw log viewer to master/detail monitor: active runs list, status chips, durations, expandable detail, and links/copy affordances for child session IDs.
- Keep raw timeline/events as debug tabs, not the primary product surface.

### Risks
- OpenCode events may not always expose token/context usage; the contract must mark these fields as optional and avoid implying accuracy when data is absent.
- The current runtime has two tracer implementations; any accidental work on `.opencode/plugin/subagent-tracer.ts` would create false confidence and drift.
- Auto-refreshing dense logs can become noisy and inaccessible if the UI announces too much; live updates should be summarized, debounced, and progressively disclosed.
- Background delegations run in isolated sessions outside the main session tree, so “what changed” may need inferred file activity unless OpenCode exposes direct mutation metadata.

### Ready for Proposal
Yes — tell the user the next proposal should define a structured observability contract and normalized monitoring API first, with the web UI as the initial consumer and statusline/TUI integration explicitly deferred until that contract exists.
