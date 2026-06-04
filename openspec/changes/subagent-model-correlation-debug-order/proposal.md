# Proposal: Subagent Model Correlation and Debug Ordering

## Intent

Close the observability gap where active runs show unknown models, oversized prompts dominate cards, and debug panels require scrolling for recent activity. This targets the local monitor API/view and preserves future TUI/statusline alignment through explicit provenance.

## Scope

### In Scope
- Enrich normalized runs with best-effort model correlation from event/session data when hook payloads omit model metadata.
- Add model provenance (`direct`, `inferred`, `unavailable`) so inferred values are honest, not fake.
- Render active/recent cards as compact summaries with full action/prompt retained in detail or copy flows.
- Show debug/timeline/event entries newest-first while preserving each multi-line entry as a unit.

### Out of Scope
- Rewriting the tracer contract to guarantee child session/delegation IDs for every `background.delegate` start.
- Adding new build tooling, test runner, or TUI/statusline surfaces.
- Perfect deterministic model attribution when OpenCode never exposes enough linkage data.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `subagent-observability-contract`: clarify model metadata may be direct, inferred later, or unavailable.
- `subagent-monitor-api`: add event/session-based model enrichment plus provenance on normalized runs.
- `subagent-monitor-view`: require compact card summaries, preserved full prompt/detail access, and newest-first debug ordering.

## Approach

Use server-side enrichment before `/runs`: prefer direct model fields, then infer from nearby `message.part.updated`, `session.next.model.switched`, and `session.updated` events using session linkage, title/action similarity, and bounded timestamps. Keep `background.delegate` matches lower-confidence unless linkage is explicit. Update the UI to summarize titles, clamp long text, expose full text in detail/copy paths, and reverse debug entries at formatting time.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `server.js` | Modified | Normalize model correlation and provenance from runs/events. |
| `public/app.js` | Modified | Compact cards, detail/copy path, newest-first debug rendering. |
| `public/styles.css` | Modified | Add clamping/disclosure styles for long prompts/actions. |
| `public/index.html` | Modified | Detail/copy affordances if needed. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Nearby runs get misattributed models | Med | Use timestamps, session linkage, action similarity, and provenance. |
| `background.delegate` remains ambiguous | Med | Mark unresolved as `unavailable`; avoid overclaiming inferred matches. |
| Newest-first formatting breaks multi-line entries | Low | Reverse parsed entries, not raw lines. |

## Rollback Plan

Revert the server enrichment and UI rendering changes; APIs fall back to existing normalized runs and chronological debug display.

## Dependencies

- Existing run, event, and timeline log shapes.

## Success Criteria

- [ ] Active/recent runs show direct or inferred model where feasible, with provenance.
- [ ] Huge prompts no longer dominate cards; full text remains accessible.
- [ ] Debug/timeline/event displays render newest entries first.
