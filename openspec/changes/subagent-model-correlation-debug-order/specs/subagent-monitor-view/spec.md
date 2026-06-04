# Delta for subagent-monitor-view

## MODIFIED Requirements

### Requirement: Summary-first run monitoring

The system MUST present active and recent subagent runs with visible status, duration, agent, model, model provenance, and parent or child session references using compact summaries, while preserving progressive disclosure for full prompt, action, outcome, and debug detail.
(Previously: the view showed summary fields and disclosure, but it did not require compact titles or preserved full-text access paths.)

#### Scenario: Operator reviews active work

- GIVEN the monitor has active and recent runs
- WHEN the web view renders the monitor surface
- THEN each run shows a compact summary with status, elapsed or total duration, agent, model when known, provenance, and session linkage affordances
- AND oversized prompt or action text does not become the card title or dominate the card layout

#### Scenario: Operator opens run detail

- GIVEN a run has additional detail
- WHEN the operator expands or selects that run
- THEN the view reveals outcome, failure state when present, full prompt or action text, and raw timeline or event links for debugging
- AND debug or timeline entries are rendered newest-first by entry while preserving each multi-line entry as a unit

### Requirement: Missing metadata is handled safely

The system MUST render incomplete run metadata without errors and SHOULD label unknown, unavailable, or inferred values clearly instead of hiding the run or overstating certainty.
(Previously: missing metadata was only labeled as unknown or unavailable.)

#### Scenario: Model or usage fields are missing

- GIVEN a normalized run omits model or usage fields
- WHEN the web view renders the run
- THEN the run remains visible with explicit unknown or unavailable labels where needed

#### Scenario: Model value is inferred

- GIVEN a normalized run includes an inferred model value
- WHEN the web view renders the run
- THEN the run remains visible and labels that model as inferred rather than presenting it as direct fact
