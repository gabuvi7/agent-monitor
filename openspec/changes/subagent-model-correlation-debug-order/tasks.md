# Tasks: Subagent Model Correlation and Debug Ordering

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500-750 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 server contract → PR 2 compact UI/debug order |
| Delivery strategy | chosen chained PRs after risk prompt |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — chained PR path resolved for PR 1 server/API slice
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add bounded model provenance to normalized runs | PR 1 | `server.js`, optional tracer defaults; manual `/runs` JSON check included. |
| 2 | Compact cards and newest-first debug blocks | PR 2 | `public/app.js`, `public/styles.css`; depends on PR 1 API fields. |

## Phase 1: Capture Contract

- [x] 1.1 Review `src/opencode/plugins/subagent-tracer.ts` run writes; add direct model provenance defaults only if records can carry them without linkage rewrites.
- [x] 1.2 Ensure old `subagent-runs.ndjson` records still normalize when model provenance fields are absent.

## Phase 2: Normalization

- [x] 2.1 Add `readProjectEvents()` and safe event parsing in `server.js` for `opencode-events.ndjson`.
- [x] 2.2 Add pure helpers in `server.js` to extract models from session/message events and score session, title/action, and timestamp matches.
- [x] 2.3 Update `server.js` run normalization to emit `modelAvailable`, `modelProvenance`, unavailable/inference reason, confidence, `actionSummary`, and full `action`.
- [x] 2.4 Keep ambiguous `background.delegate` matches `unavailable` unless explicit session linkage satisfies the API/detail scenarios.

## Phase 3: Presentation

- [ ] 3.1 Update `public/app.js` cards to use compact summaries, provenance labels, durations, agent, model, and session linkage without long prompt titles.
- [ ] 3.2 Update `public/app.js` selected-detail rendering to show full action/prompt, outcome/failure, reasons/confidence, and existing copy affordances.
- [ ] 3.3 Refactor `public/app.js` debug/timeline formatting to parse entry blocks, reverse blocks, then apply filters.
- [ ] 3.4 Add `public/styles.css` clamping/detail styles with accessible buttons, focus-visible support, and usable stacked layout defaults.

## Phase 4: Verification

- [x] 4.1 Start `node server.js`; inspect `/api/projects/:project/runs` for direct, inferred, and unavailable model provenance.
- [ ] 4.2 Browser-smoke active/recent cards with huge action text; verify full text is available through detail/copy.
- [ ] 4.3 Browser-smoke multiline debug/timeline entries; verify newest-first order preserves each entry as one block.
- [x] 4.4 Record manual verification notes in the apply/verify output because no automated runner exists.
