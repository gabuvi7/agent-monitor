# Subagent Observability Contract Specification

## Purpose

Define the structured run record emitted by the global tracer as the monitor source of truth.

## Requirements

### Requirement: Structured subagent run record

The system MUST emit one structured run record per delegated subagent run with stable identifiers for delegation, parent session, and child session, plus agent, model, lifecycle timestamps, status, and outcome.

#### Scenario: Running run is captured

- GIVEN a delegated run has started
- WHEN the tracer writes observability data
- THEN the record includes delegation ID, parent session ID, child session ID, agent, start timestamp, and status `running`
- AND model is included when OpenCode exposes it

#### Scenario: Completed or failed run is finalized

- GIVEN a delegated run finishes
- WHEN the tracer updates the record
- THEN the record includes a terminal status of `completed` or `failed`, a completion timestamp, and outcome summary when known

### Requirement: Optional metadata remains explicit

The system MUST treat usage, context, and other partial metadata as optional fields and MUST represent absent values without blocking consumers or inferring fake values.

#### Scenario: Usage metadata is present

- GIVEN OpenCode exposes token or context usage for a run
- WHEN the record is emitted
- THEN the usage fields are included with the run

#### Scenario: Usage metadata is absent

- GIVEN OpenCode does not expose token or context usage for a run
- WHEN the record is emitted
- THEN the record remains valid and marks those values as unknown or omitted
