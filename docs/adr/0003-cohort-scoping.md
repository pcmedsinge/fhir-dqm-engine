# ADR 0003 — Cohort Scoping via FHIR Group Resources

**Status:** Accepted  
**Date:** 2026-05-28

## Context

Phase 3 computed measures against all patients in HAPI (`Patient?_count=1000`, no filter). This is fine for a demo but unusable in any real care management workflow: quality programs operate over defined populations (attributed panel, insurer cohort, risk tier). The compute endpoint also had no way for the caller to specify which patients to run against.

## Decision

Scope measure compute to **FHIR `Group` resources**. A `Group` identifies a set of patients either by explicit member references (v0.1) or by characteristic (future). The compute endpoint accepts an optional `cohortId` parameter that resolves to a `Group` in HAPI.

Key design points:

1. **Member-list Groups only for v0.1.** A Group containing `member[].entity.reference` entries pointing to Patient resources is the simplest, most explicit model. Characteristic-based Groups (e.g., "all patients with ICD-10 I10") overlap with what CQL already does and are deferred.

2. **`all-patients` sentinel.** A Group named `all-patients` is seeded to HAPI on engine startup (idempotent PUT). When `resolvePatientIds('all-patients')` is called it returns `null`, which the data-source adapter interprets as "no filter." This preserves backward-compatible behavior.

3. **`cohortId` defaults to `all-patients`** in the compute endpoint, so existing callers that omit the field get the same behavior as Phase 3.

4. **`GET /v1/cohorts`** lists available Group resources from HAPI. `GET /v1/cohorts/:id` retrieves a single one. These are read-only in v0.1; Group creation (POST) is deferred.

## Consequences

- The `FhirDataSourceAdapter.buildPatientBundles(patientIds?)` signature already accepts an optional list; the resolver just populates it.
- Compute time scales with cohort size — smaller cohorts are faster, which also makes it easier to develop and debug specific subpopulations.
- The `all-patients` Group in HAPI makes the cohort system self-documenting: developers can inspect `GET /fhir/Group/all-patients` and understand the default behavior.
