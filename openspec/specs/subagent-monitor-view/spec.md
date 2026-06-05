# Subagent Monitor View Specification

## Purpose

Define the web monitor as the first consumer of the structured subagent monitoring contract.

## Requirements

### Requirement: Summary-first run monitoring

The system MUST present active and recent subagent runs with visible status, duration, agent, model, and parent or child session references, while preserving progressive disclosure for deeper detail.

#### Scenario: Operator reviews active work

- GIVEN the monitor has active and recent runs
- WHEN the web view renders the monitor surface
- THEN each run shows status, elapsed or total duration, agent, model when known, and session linkage affordances

#### Scenario: Operator opens run detail

- GIVEN a run has additional detail
- WHEN the operator expands or selects that run
- THEN the view reveals outcome, failure state when present, and raw timeline or event links for debugging

### Requirement: Missing metadata is handled safely

The system MUST render incomplete run metadata without errors and SHOULD label unknown values clearly instead of hiding the run.

#### Scenario: Model or usage fields are missing

- GIVEN a normalized run omits model or usage fields
- WHEN the web view renders the run
- THEN the run remains visible with explicit unknown or unavailable labels where needed
