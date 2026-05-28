# ADR 0004 — Value-Set Integrity Layer

**Status:** Accepted  
**Date:** 2026-05-28

## Context

CMS165 CBP requires an "Office Visit" encounter (VSAC OID `2.16.840.1.113883.3.464.1003.101.12.1001`).  
The canonical VSAC value set contains 8 CPT codes and 5 SNOMED codes. Synthea-generated patients use 7 SNOMED encounter codes that are absent from this canonical set. Without those codes, the IPP is 0 — the measure computes nothing useful against synthetic data.

In v0.3.0-alpha.1 the 7 Synthea codes were mixed silently into `valueSets.json`. There was no logging, no classification, no way to tell from the MeasureReport that the value set had been extended.

## Decision

Introduce a `ValueSetIntegrityService` that classifies every value set used by a loaded measure and applies a structured supplement mechanism:

- **`VSAC-CANONICAL`** — value set matches the canonical VSAC export exactly; no codes added or removed.
- **`LOCAL-MODIFIED`** — the canonical value set has been extended with codes from a supplement file in `measures/_synthetic-supplements/`. A startup `WARN` log is emitted for every such value set.
- **`LOCAL-CUSTOM`** — a value set defined entirely outside VSAC (future use).

Supplements are stored as named JSON files under `measures/_synthetic-supplements/`. Each file declares its `valueSetOid`, the `reason` for the supplement, and the `addedCodes` array. Supplements are loaded only when `ALLOW_SYNTHETIC_VALUESET_SUPPLEMENTS=true` (default in `development`; should be `false` in production).

Every value set entry in the integrity report carries a SHA-256 content hash computed over the sorted `system|code` pairs of the active (post-supplement) code list. This hash can be used to detect drift if the underlying VSAC export or supplement file changes.

## Consequences

- Running with `ALLOW_SYNTHETIC_VALUESET_SUPPLEMENTS=false` restores VSAC-spec compliance at the cost of a 0-patient IPP against Synthea data.
- The `GET /v1/value-sets/integrity` endpoint provides a machine-readable audit of every value set in use, its classification, canonical vs. active code counts, content hash, and the supplement file name and reason when applicable.
- Future measures onboarded to the engine automatically inherit this auditing with zero additional code.
- `valueSets.json` for each measure always reflects the canonical VSAC export; supplements are never written back to that file.
