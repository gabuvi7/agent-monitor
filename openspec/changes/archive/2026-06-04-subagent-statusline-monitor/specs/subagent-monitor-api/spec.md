# Subagent Monitor Api Specification

## Purpose

Define normalized read APIs over structured run records for monitor consumers.

## Requirements

### Requirement: Normalized monitor queries

The system MUST provide normalized monitor APIs for active runs, recent terminal runs, run detail, and delegation or session lookup using structured observability records as input.

#### Scenario: Active and recent runs are queried

- GIVEN stored run records exist in running and terminal states
- WHEN a monitor consumer requests active or recent runs
- THEN the response returns normalized run objects with status, duration, agent, model, and session linkage fields

#### Scenario: Run detail is queried by linkage key

- GIVEN a run is identified by delegation ID, parent session ID, or child session ID
- WHEN a monitor consumer requests run detail or lookup
- THEN the response returns the matching normalized run and related linkage fields

### Requirement: Structured data is the primary source

The system MUST NOT rely on regex parsing of human-readable timeline text to derive canonical run state, duration, or session relationships.

#### Scenario: Timeline text disagrees with record shape

- GIVEN human-readable timeline text is incomplete or ambiguous
- WHEN the API builds monitor responses
- THEN canonical fields come from structured records and raw timeline data remains debug-only
