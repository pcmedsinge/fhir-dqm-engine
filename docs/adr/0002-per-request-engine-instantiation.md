# ADR 0002 — Per-Request CQL Engine Instantiation

**Date:** 2026-05-27  
**Status:** Accepted

## Context

The `cql-execution` library's `Executor` object is stateful during a run. It accumulates
intermediate results as it processes patients. Two lifecycle options exist:

1. **Singleton**: Create one `Executor` per NestJS app lifecycle; reuse across requests.
2. **Per-request**: Create a new `Executor` (and its dependencies) for each compute request.

## Decision

Instantiate the CQL engine per-request.

## Rationale

- **Statelessness**: Each compute call starts with a clean engine state. No risk of result
  bleed-over between concurrent or sequential requests with different periods.
- **Low cost**: `Executor` instantiation is cheap (in-memory object construction, < 1 ms).
  The expensive part of a measure run is FHIR data retrieval, not engine setup.
- **Simplicity**: No need for mutex/lock or request-scoped NestJS providers. The service
  method is a plain async function.
- **Correctness**: The `ValueSetMap` and `Library` objects loaded from disk are immutable —
  they can safely be shared across instantiations without copying.

## Consequences

- No warm-up benefit across requests. Acceptable since engine init is negligible compared to
  HAPI query time (~5–10 min for 279 patients).
- If profiling later shows init cost matters (e.g., parsing 10 large ELM files per request),
  migrate to a cached `Library` + fresh `Executor` approach.
