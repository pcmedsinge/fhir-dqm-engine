# ADR 0001 — Ship Pre-Compiled ELM Instead of Compiling at Runtime

**Date:** 2026-05-27  
**Status:** Accepted

## Context

CQL (Clinical Quality Language) is the human-readable format for quality measure logic.
The `cql-execution` JavaScript engine does not execute CQL directly — it executes ELM
(Expression Logical Model), which is the compiled JSON/XML form of CQL.

Two strategies exist for getting from CQL to ELM:

1. **Compile at runtime** using a running `cql-translation-service` Java server (extra Docker container)
   or a JS port of the translator (less mature and tested).
2. **Ship pre-compiled ELM** alongside the CQL source — the engine loads ELM directly.

## Decision

Ship pre-compiled ELM in the repository (`packages/engine/measures/<id>/elm/*.json`).

The CQL source is also committed (`cql/`) for human readability and version control diff purposes.

## Rationale

- **Simplicity**: No extra Docker service needed for normal development or CI.
- **Correctness**: The `cqframework/ecqm-content-qicore-2024` repo already ships pre-compiled ELM
  (base64-encoded in FHIR Library resources). Using the same ELM that NCQA uses for testing ensures
  correctness alignment.
- **Startup performance**: ELM loads in milliseconds from disk; Java CQL translator cold-start is 5–10 s.
- **Stability**: Measure logic is pinned to a specific source commit. Dynamic compilation could silently
  produce different ELM if the translator version changes.

## Consequences

- ELM must be refreshed when CQL changes. The `pnpm run measures:recompile` script (documented in
  the measure README) handles this via an ad-hoc `cql-translation-service` Docker container.
- Committed ELM files are large (~150 KB each). Acceptable for a few measures; if the library grows
  to 50+ measures, revisit (e.g., `.gitattributes` LFS for elm/).
