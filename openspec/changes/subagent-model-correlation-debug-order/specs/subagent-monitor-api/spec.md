# Delta for subagent-monitor-api

## MODIFIED Requirements

### Requirement: Normalized monitor queries

The system MUST provide normalized monitor APIs for active runs, recent terminal runs, run detail, and delegation or session lookup using structured observability records as input, and MUST expose model provenance alongside any normalized model value.
(Previously: normalized responses included model when present but did not distinguish direct versus inferred attribution.)

#### Scenario: Active and recent runs are queried

- GIVEN stored run records exist in running and terminal states
- WHEN a monitor consumer requests active or recent runs
- THEN the response returns normalized run objects with status, duration, agent, model, model provenance, and session linkage fields

#### Scenario: Run detail is queried by linkage key

- GIVEN a run is identified by delegation ID, parent session ID, or child session ID
- WHEN a monitor consumer requests run detail or lookup
- THEN the response returns the matching normalized run and related linkage fields
- AND any model inferred from related events or sessions is marked `inferred` instead of `direct`
