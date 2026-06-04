## Exploration: subagent-model-correlation-debug-order

### Current State
The tracer already writes three per-project artifacts: structured `subagent-runs.ndjson`, raw `opencode-events.ndjson`, and append-only `subagent-timeline.md` from `src/opencode/plugins/subagent-tracer.ts`. `server.js` normalizes only run records, merges duplicates, and exposes `/runs`, `/timeline`, and `/events`. The web UI in `public/app.js` renders active/recent cards from normalized runs and renders debug content as raw text. In practice, many `task` and `delegate` start records have `model: null`, active/recent cards can render the full prompt as the title because `runTitle()` uses `run.action` verbatim, and the debug panel shows oldest-first because it prints file order without reversing entries.

Logs confirm model correlation is PARTLY feasible today. For native `task` runs, nearby `message.part.updated` events on the parent session already carry `metadata.parentSessionId`, `metadata.sessionId`, `metadata.model`, and a title matching the task description. Child sessions also emit `session.next.model.switched` and later `session.updated` events with agent/model data. For `background.delegate`, the child model is also visible in child-session events, but the current run record does not persist child session or delegation ID reliably at start, so correlation is weaker and more heuristic.

### Affected Areas
- `src/opencode/plugins/subagent-tracer.ts` — current capture rules for run IDs, action text, model extraction, and timeline/event logging.
- `server.js` — current normalization source of truth; best place to enrich runs from event correlation before the UI consumes them.
- `public/app.js` — card title/meta rendering, detail rendering, and oldest-first raw debug formatting all live here.
- `public/styles.css` — lacks a compact summary/disclosure pattern for long action text.
- `public/index.html` — debug panel and master/detail layout may need small affordances for expanded summaries.
- `logs/agent-monitor-20565965/subagent-runs.ndjson` — proves missing models and oversized `action` payloads in real run records.
- `logs/agent-monitor-20565965/opencode-events.ndjson` — proves model/session correlation data exists for many runs via event metadata and session events.
- `logs/agent-monitor-20565965/subagent-timeline.md` — confirms debug output is chronological append order, so newest-first is currently a presentation issue.

### Approaches
1. **Server-side correlation + presentation cleanup** — Keep the existing tracer contract, enrich `/runs` from `opencode-events.ndjson`, truncate/summarize cards, and reverse debug rendering in the UI.
   - Pros: Fastest path; active runs can show inferred models immediately; keeps canonical run state from `/runs`; minimal capture risk.
   - Cons: Correlation logic is heuristic for some `background.delegate` runs; server must scan both run and event logs; prompt/action summarization rules must be explicit.
   - Effort: Medium

2. **Plugin-first contract hardening** — Change the tracer so run records persist child session, delegation ID, and model earlier/more reliably, then keep server/UI logic simple.
   - Pros: Stronger long-term contract; less heuristic correlation; better foundation for future TUI/statusline consumers.
   - Cons: Does not solve existing historical logs; active model display still depends on what OpenCode exposes at hook time; higher coordination cost across capture and normalization.
   - Effort: Medium/High

3. **Hybrid enrichment with confidence/fallback states** — Add server correlation now, but label results as direct vs inferred and optionally backfill tracer fields in a follow-up change.
   - Pros: Best balance of immediate UX gain and architectural honesty; supports current logs; makes uncertainty explicit; preserves room for plugin hardening later.
   - Cons: Slightly more API/UI complexity because runs need provenance like direct/inferred/unavailable.
   - Effort: Medium

### Recommendation
Choose **Approach 3**. Add server-side run enrichment first, because the evidence is already in `opencode-events.ndjson`: native `task` runs can be matched by parent session + title + near-start timestamp, then resolved to child-session model data from `message.part.updated`, `session.next.model.switched`, or `session.updated`. For `background.delegate`, use a lower-confidence fallback based on parent session + nearby `session.created`/`session.updated` child sessions and the delegate completion text (`Delegation started: ...`) when present. Expose both the resolved model and a provenance field (`direct`, `inferred`, `unavailable`).

For the UI, stop using the full `run.action` as the card title. Use a compact primary summary (agent + short action/description), clamp or truncate long text in cards, and move the full prompt/action into detail or an explicit expand/copy affordance. Keep keyboard selection on the card button, avoid hidden focus targets, and do not stream large prompt text into live regions. For debug ordering, reverse entries at formatting time so newest items render first while preserving raw content for filtering.

### Risks
- `background.delegate` correlation is not yet deterministic because the run record often lacks child session and delegation ID at start; some matches may need time-window heuristics.
- A parent session can launch multiple runs close together, so title-only matching without timestamp bounds could misattribute a model.
- Reversing debug content after formatting must preserve filtering and avoid reordering multi-line event blocks incorrectly.
- Truncation UX can hide critical context if the detail view does not preserve the full action/prompt and copy affordances.

### Ready for Proposal
Yes — tell the user the proposal can proceed with a server-enriched model-correlation pass, a compact-card/detail disclosure UX, and newest-first debug rendering, while explicitly scoping `background.delegate` correlation as best-effort unless the tracer is hardened in a follow-up.
