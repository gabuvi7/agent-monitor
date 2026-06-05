# Design: Subagent Model Correlation and Debug Ordering

## Technical Approach

Keep `/api/projects/:project/runs` as the canonical state source. `server.js` will read `subagent-runs.ndjson` plus `opencode-events.ndjson`, normalize runs, then enrich missing model metadata with bounded, explainable matches from OpenCode event/session data. The UI remains vanilla DOM: cards render compact summaries, detail preserves full action text and copy affordances, and debug panes render newest-first by parsed entry blocks rather than raw lines.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Model attribution | Server-side enrichment before `/runs` response | Client inference from debug logs | Keeps `/runs` canonical for future TUI/statusline consumers and avoids duplicating matching logic. |
| Provenance | `direct`, `inferred`, `unavailable` plus reason/confidence | Plain model string only | Makes ambiguous correlation honest and satisfies API/view specs without pretending certainty. |
| Matching bounds | Prefer direct model, then exact session ID, then nearby title/action similarity within a short time window; ambiguous delegate matches stay unavailable | Broad nearest-event matching | Reduces false positives when multiple agents run near each other. |
| Debug ordering | Parse timeline/events into blocks, reverse blocks, then filter blocks | Reverse raw lines | Preserves multi-line JSON/timeline entries and keeps search useful. |

## Data Flow

    subagent-tracer.ts ──writes──> subagent-runs.ndjson
             │                    opencode-events.ndjson
             └──────────────┐
                            ↓
    server.js readProjectRuns/readProjectEvents
        └─ normalize → enrich model → /runs JSON
                            ↓
    public/app.js cards/detail/debug render

Failure modes: if events are missing, malformed, stale, or match multiple candidate runs, leave `modelProvenance: "unavailable"` with a reason instead of guessing.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server.js` | Modify | Add event reader, event model extraction, bounded enrichment helpers, and API fields. |
| `public/app.js` | Modify | Render concise run titles, provenance labels, full action/copy in detail, and block-based newest-first debug filtering. |
| `public/styles.css` | Modify | Add clamped summary/detail text styles while preserving focus-visible and button behavior. |
| `src/opencode/plugins/subagent-tracer.ts` | Modify | Extend run records with direct model provenance defaults if needed; do not rewrite linkage semantics. |
| `public/index.html` | No expected change | Existing selected-detail and copy buttons are sufficient unless implementation needs an explicit detail label. |

## Interfaces / Contracts

Normalized run additions:

```js
{
  model: string | null,
  modelAvailable: boolean,
  modelProvenance: "direct" | "inferred" | "unavailable",
  modelUnavailableReason: string | null,
  modelInferenceReason: string | null,
  modelConfidence: number | null,
  actionSummary: string,
  action: string
}
```

Server rules:
- Direct `record.model` wins: provenance `direct`, confidence `1`.
- Exact `childSessionId`/`parentSessionId` event/session model match may infer with high confidence.
- Title/action similarity plus timestamp proximity may infer with lower confidence.
- `background.delegate` without explicit linkage must not be upgraded above low confidence; ambiguous matches become unavailable.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit/manual | Model extraction and scoring helpers | Add small pure helper fixtures or run Node snippets with representative logs. |
| Integration/manual | `/runs` active/recent/detail contract | Start `node server.js`; inspect JSON for direct, inferred, and unavailable runs. |
| UI/manual | Compact cards, copy/detail, debug order/filtering | Browser smoke test with long action text and multiline events/timeline entries. |

No automated runner exists; keep helpers pure so a future test runner can cover them cheaply.

## Migration / Rollout

No migration required. Existing logs remain readable; new fields are additive and UI must tolerate older records.

## Open Questions

- [ ] What exact timestamp window should be used for low-confidence title/action inference? Default design suggests conservative seconds/minutes, not unbounded session-wide matching.
