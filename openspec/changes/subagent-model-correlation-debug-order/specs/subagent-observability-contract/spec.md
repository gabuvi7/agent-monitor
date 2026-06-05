# Delta for subagent-observability-contract

## MODIFIED Requirements

### Requirement: Structured subagent run record

The system MUST emit one structured run record per delegated subagent run with stable identifiers for delegation, parent session, and child session, plus agent, lifecycle timestamps, status, outcome, and model metadata that is either direct, inferred, or unavailable.
(Previously: model presence depended only on whether OpenCode exposed it directly.)

#### Scenario: Running run is captured

- GIVEN a delegated run has started
- WHEN the tracer writes observability data
- THEN the record includes delegation ID, parent session ID, child session ID when known, agent, start timestamp, and status `running`
- AND model metadata includes a value or explicit `unavailable` state plus provenance

#### Scenario: Completed or failed run is finalized

- GIVEN a delegated run finishes
- WHEN the tracer updates the record
- THEN the record includes a terminal status of `completed` or `failed`, a completion timestamp, and outcome summary when known
- AND any inferred model value remains distinguishable from a direct value through provenance
