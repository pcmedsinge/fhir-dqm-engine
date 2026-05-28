# Phase 4 — Multiple measures, cohorts, and an honest care-gap workflow

**Project:** `fhir-dqm-engine` (codename **Pramana**)
**Phase:** P4 of 7 — From one-measure demo to a real multi-measure engine
**Predecessor:** P3 (first measure end-to-end) — complete at `v0.3.0-alpha.1`
**Estimated effort:** 22–30 hours of focused work, ~3–4 calendar weeks for an evening builder
**Target tag at end of phase:** `v0.4.0-alpha.1`

---

## 1. Goal in plain English

Phase 3 proved one measure (CMS165) runs end-to-end against all patients. Phase 4 turns that proof into a real engine:

- Measures run against **defined cohorts** (Group resources), not just "everyone."
- The engine is **honest about its own value sets** — any deviation from canonical VSAC is explicit, logged, and visible in the output. The hidden CMS165 workaround becomes a documented, flagged supplement.
- **Two more measures** join CMS165 — CMS122 (diabetes HbA1c control) and CMS130 (colorectal cancer screening) — each added cleanly through the integrity layer.
- A **proper care-gap workflow** derives gaps from stored MeasureReports (not by recomputing), with per-patient detail, across all three measures.

After P4, Pramana computes multiple measures over real cohorts and tells the truth about how it did it. That honesty is the differentiator.

---

## 2. Why these four threads, in this order

The Phase 3 audit revealed three realities that shape this phase:

1. **Scope is hardcoded to all patients** (`fhir-data-source.adapter.ts → buildPatientBundles()`, fetches `Patient?_count=1000` unfiltered). A care-gap _workflow_ needs cohorts first.
2. **CMS165 used a silent value-set workaround** — 7 Synthea SNOMED codes added to the Office Visit value set (commit b659ff0), not in canonical VSAC. Spec-non-compliant and currently invisible. This must become honest _before_ more measures pile on more hidden hacks.
3. **The gaps endpoint recomputes CQL** instead of reading the stored MeasureReport — wasteful and risks inconsistency.

Order matters: cohorts and value-set integrity are _foundations_. Adding measures #2 and #3 on top of a clean foundation prevents accumulating technical debt. The care-gap workflow comes last because it consumes everything before it.

---

## 3. Definition of P4 success

```bash
# === Setup ===
git clone https://github.com/pcmedsinge/fhir-dqm-engine.git
cd fhir-dqm-engine && cp .env.example .env && pnpm install && pnpm build
docker compose up -d
pnpm run seed:fhir
pnpm --filter @pramana/engine start:dev   # second terminal

# === List all registered measures (now three) ===
curl http://localhost:3000/v1/measures
# [
#   { "id": "cms165-cbp", "title": "Controlling High Blood Pressure", ... },
#   { "id": "cms122-hba1c", "title": "Diabetes HbA1c Poor Control", ... },
#   { "id": "cms130-crc", "title": "Colorectal Cancer Screening", ... }
# ]

# === Cohort: create / list Groups ===
curl http://localhost:3000/v1/cohorts
# Lists available Group resources (at minimum a default "all-patients" Group)

# === Compute a measure against a cohort ===
curl -X POST http://localhost:3000/v1/measures/cms165-cbp/compute \
  -H "Content-Type: application/json" \
  -d '{ "periodStart": "2025-01-01", "periodEnd": "2025-12-31", "cohortId": "all-patients" }'
# Returns MeasureReport — now including value-set provenance (see below)

# === The MeasureReport now declares value-set integrity ===
# Within the returned MeasureReport:
# "extension": [{
#   "url": "https://pramana.dev/fhir/StructureDefinition/value-set-provenance",
#   "extension": [
#     { "url": "valueSet", "valueString": "Office Visit (2.16.840.1.113883.3.464.1003.101.12.1001)" },
#     { "url": "source", "valueString": "LOCAL-MODIFIED" },
#     { "url": "note", "valueString": "7 Synthea SNOMED codes added; not in canonical VSAC" }
#   ]
# }]

# === Care gaps now read from stored MeasureReport (not recomputed) ===
curl "http://localhost:3000/v1/measures/cms165-cbp/gaps?periodStart=2025-01-01&periodEnd=2025-12-31&cohortId=all-patients"
# {
#   "measureId": "cms165-cbp",
#   "cohortId": "all-patients",
#   "source": "MeasureReport/<id>",     # ← derived from stored report, not a re-run
#   "openGapsCount": 41,
#   "gaps": [ { "patientId": "Patient/x", "reason": "denominator-met, numerator-not-met" }, ... ]
# }

# === Integrity report: which value sets are canonical vs modified ===
curl http://localhost:3000/v1/value-sets/integrity
# {
#   "canonical": [ ... ],
#   "modified": [
#     { "name": "Office Visit", "oid": "...1001", "addedCodes": 7, "reason": "synthetic-data supplement" }
#   ]
# }
```

Plus on GitHub:

- ✅ CI green on `main`
- ✅ `v0.4.0-alpha.1` tag pushed
- ✅ `CHANGELOG.md` updated
- ✅ README "Status" updated; all "CMS125" references corrected to "CMS165"
- ✅ This plan committed at `docs/PHASE_4_PLAN.md`
- ✅ New ADRs in `docs/adr/` for cohort scoping and value-set integrity approach
- ✅ Startup logs warn about any LOCAL-MODIFIED value sets

---

## 4. Thread 1 — Cohort scoping

### What changes

Replace the hardcoded "all patients" fetch with a cohort abstraction backed by FHIR `Group` resources.

- A FHIR `Group` resource defines a set of patients (by reference or by characteristic).
- The engine resolves a `cohortId` to a patient set before running the measure.
- A default `Group` named `all-patients` is created at seed time so existing behavior is preserved (backward compatible).

### Implementation sketch

- New module `packages/engine/src/modules/cohort/`:
  - `cohort.service.ts` — resolve a cohortId → list of Patient references (via Group resource in HAPI)
  - `cohort.controller.ts` — `GET /v1/cohorts`, `GET /v1/cohorts/:id`, `POST /v1/cohorts` (create a Group)
- Modify `fhir-data-source.adapter.ts`:
  - `buildPatientBundles()` accepts an optional patient-ID list
  - When a cohort is supplied, fetch only those patients; when omitted, default to the `all-patients` Group
- The compute endpoint accepts an optional `cohortId` (defaults to `all-patients`)

### Keep it simple for v0.1

- Support Group-by-explicit-member-list first (a Group listing Patient references)
- Group-by-characteristic (e.g., "all diabetics") can be stubbed/deferred — it overlaps with what measures already do
- Don't build a cohort _builder_ UI — that's later

---

## 5. Thread 2 — Value-set integrity core

This is the production-grade honesty layer. Build the part that makes deviations impossible to hide; defer the part that makes them easy to manage.

### Build now

1. **Value-set metadata.** Every value set the engine loads carries:
   - `oid` (the VSAC identifier)
   - `source`: one of `VSAC-CANONICAL` | `LOCAL-MODIFIED` | `LOCAL-CUSTOM`
   - `version` (if known)
   - `contentHash` (hash of the sorted code list — detects drift)
   - For modified/custom: a `note` explaining why

2. **Relocate the CMS165 workaround.** The 7 Synthea SNOMED codes currently merged into `valueSets.json` under the Office Visit OID move to an explicit, clearly-named supplement:
   - `measures/_synthetic-supplements/office-visit-synthea-supplement.json`
   - This file is loaded _only_ when an env flag (`ALLOW_SYNTHETIC_VALUESET_SUPPLEMENTS=true`, default true in dev) is set
   - The base Office Visit value set returns to its canonical (empty-compose / VSAC) state
   - When the supplement is applied, the value set's `source` flips to `LOCAL-MODIFIED` and records the 7 codes + reason

3. **MeasureReport provenance extension.** Every computed MeasureReport carries a `value-set-provenance` extension listing any non-canonical value sets used in that computation. A clean, spec-compliant run shows an empty/absent extension; a supplemented run declares exactly what deviated.

4. **Startup integrity check.** On boot, log a clear WARNING for each LOCAL-MODIFIED or LOCAL-CUSTOM value set in use, e.g.:
   `[ValueSetIntegrity] WARNING: Office Visit (OID ...1001) is LOCAL-MODIFIED — 7 codes added for synthetic data. Results are not VSAC-spec-compliant.`

5. **Integrity endpoint.** `GET /v1/value-sets/integrity` returns the canonical-vs-modified breakdown (shown in §3).

### Defer to a later dedicated phase

- Live VSAC API integration / auto-download
- Full terminology server (LOINC/SNOMED/RxNorm normalization)
- Value-set version management and multi-version measures
- Authoring tools

### Why this matters (capture in an ADR)

Write `docs/adr/0003-value-set-integrity.md` explaining: the engine's value proposition is trustworthy measurement; therefore any deviation from canonical value sets must be transparent and auditable, never silent; we build the transparency core now and defer the management infrastructure. This ADR is itself a credibility artifact.

---

## 6. Thread 3 — Add CMS122 and CMS130

With cohorts and integrity in place, add two measures _through_ the new machinery.

### Candidates and rationale

| Measure    | What it is                         | Why chosen                                                                                        | Synthea risk                                             |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **CMS122** | Diabetes: HbA1c Poor Control (>9%) | Continues the diabetes thread from the knowledge base (HBD-E); proportion measure, familiar shape | HbA1c observations should exist in Synthea; verify codes |
| **CMS130** | Colorectal Cancer Screening        | Different clinical domain (screening); rounds out the demo across chronic + preventive            | Colonoscopy/FIT codes — verify against Synthea           |

### Process for EACH measure (mandatory order)

1. **Data sanity check first** (same discipline as P3): manually query HAPI — do patients matching the IPP exist? Do the numerator-defining resources exist with codes the value sets contain?
2. If data is thin: prefer adjusting the measurement period or using a _documented_ supplement (through the integrity layer — never a silent hack) over hand-augmenting patients.
3. Vendor the measure artifacts (Measure, Library, CQL, ELM, value sets) under `measures/<id>/`.
4. Register the measure; confirm compute + gaps work.
5. Any value-set deviation gets the `LOCAL-MODIFIED` treatment automatically — no exceptions.

### Note on integrity

CMS122 and CMS130 may need their own synthetic supplements. That's fine — _as long as each one is explicit, flagged, and shows up in the integrity endpoint and MeasureReport provenance._ The rule for this phase: **zero silent value-set modifications.** Every deviation is on the record.

---

## 7. Thread 4 — Honest care-gap workflow

### What changes

Currently `/gaps` re-runs the full CQL. Change it to derive gaps from a **stored MeasureReport**.

### Implementation

- `/compute` already persists a MeasureReport to HAPI (P3). Ensure it persists a `subject-list` or `individual`-level detail sufficient to identify per-patient population membership. (Summary-only reports can't yield per-patient gaps — this may require changing the MeasureReport `type` or adding an evaluatedResources/contained detail. Resolve in plan mode.)
- `/gaps` flow:
  1. Look up the most recent MeasureReport for (measure, period, cohort) in HAPI
  2. If none exists, return a clear error telling the caller to run `/compute` first (do NOT silently recompute)
  3. Parse the report: patients where denominator=met and numerator=not-met are the open gaps
  4. Return the gap list with the `source` field pointing to the MeasureReport ID

### Cross-measure gap view (nice-to-have, keep small)

- `GET /v1/patients/:id/gaps` — all open gaps for one patient across all three measures. Useful precursor to the Phase 6 care-manager copilot. Build only if time allows; otherwise defer to P5/P6.

---

## 8. Thread 5 — Housekeeping

- Replace every "CMS125 Breast Cancer Screening" reference with "CMS165 Controlling High Blood Pressure" in: README Status section, CHANGELOG, any P3 doc references, Swagger descriptions.
- Update README "Status" to:
  > **v0.4.0-alpha.1 — multi-measure engine with cohort scoping and value-set integrity.** Three reference measures (CMS165 BP control, CMS122 diabetes HbA1c, CMS130 colorectal screening) run against FHIR cohorts through NCQA's reference CQL engines. Value-set deviations from canonical VSAC are explicitly flagged and auditable. Phase 5 (AI extraction layer) is next.
- Update README "Technology choices" CQL row if not already corrected: `cql-execution` + `cql-exec-fhir` (JavaScript), NCQA's reference engines.

---

## 9. Folder structure delta

```
fhir-dqm-engine/
├── packages/engine/
│   ├── measures/
│   │   ├── cms165-cbp/                       # (from P3 — value sets cleaned up)
│   │   ├── cms122-hba1c/                     # ← NEW
│   │   ├── cms130-crc/                       # ← NEW
│   │   └── _synthetic-supplements/           # ← NEW
│   │       └── office-visit-synthea-supplement.json
│   └── src/modules/
│       ├── cohort/                           # ← NEW
│       ├── value-set-integrity/              # ← NEW
│       ├── measure-engine/                   # ← updated: cohort + integrity aware
│       ├── care-gap/                         # ← NEW (or fold into measure-engine)
│       ├── fhir/                             # (from P2)
│       └── health/                           # ← updated: integrity + measure count
└── docs/
    ├── PHASE_4_PLAN.md                       # ← this file
    └── adr/
        ├── 0002-cohort-scoping.md            # ← NEW
        └── 0003-value-set-integrity.md       # ← NEW
```

---

## 10. Open questions for Claude Code's plan mode

1. **MeasureReport detail level.** To derive gaps without recomputing, reports need per-patient detail. Options: `subject-list` MeasureReport, or `summary` + contained evaluated resources, or a separate stored per-patient result. Recommendation: **subject-list MeasureReport** — it's the FHIR-native way to carry per-patient population membership. Confirm feasibility with cql-execution output.
2. **Cohort model.** Group-by-member-list vs Group-by-characteristic. Recommendation: **member-list for v0.1**, characteristic deferred.
3. **Supplement application mechanism.** Env-flag gating (`ALLOW_SYNTHETIC_VALUESET_SUPPLEMENTS`) vs per-measure config. Recommendation: **env flag, default true in dev, with the integrity layer recording the effect regardless**.
4. **CMS122 / CMS130 artifact sources.** Same as P3 — eCQI Resource Center / cqframework sample IGs / Connectathon packs. Recommendation: **prefer packages with pre-compiled ELM included**.
5. **care-gap as its own module vs part of measure-engine.** Recommendation: **its own module** — it'll grow in P5/P6.
6. **Content hashing algorithm for value sets.** Recommendation: **SHA-256 over the sorted, normalized code list**. Simple, deterministic.
7. **What happens if /gaps is called before /compute.** Recommendation: **return 409 with a helpful message**; never silently recompute.

Claude Code: confirm or propose alternatives in plan mode before executing.

---

## 11. How to start the Phase 4 build

```bash
cd /path/to/fhir-dqm-engine
git checkout main && git pull origin main
cp ~/Downloads/PHASE_4_PLAN.md docs/PHASE_4_PLAN.md
git add docs/PHASE_4_PLAN.md
git commit -m "docs: add Phase 4 plan"
git push origin main

# Verify P3 baseline:
docker compose up -d
pnpm run seed:fhir
pnpm --filter @pramana/engine start:dev   # second terminal
curl -X POST http://localhost:3000/v1/measures/cms165-cbp/compute \
  -H "Content-Type: application/json" \
  -d '{ "periodStart": "2025-01-01", "periodEnd": "2025-12-31" }'
# Confirm it still returns a MeasureReport. Then start the session.

claude
```

First message to Claude Code:

> Read `docs/PHASE_4_PLAN.md` carefully. Phase 3 is complete at `v0.3.0-alpha.1` — CMS165 runs end-to-end against all patients. This phase has four threads: (1) cohort scoping via Group resources, (2) a value-set integrity core that makes the existing CMS165 value-set workaround explicit and auditable, (3) adding CMS122 and CMS130, (4) fixing the care-gap endpoint to read stored MeasureReports instead of recomputing. Plus housekeeping to fix stale CMS125 references. First review the current code — especially `fhir-data-source.adapter.ts`, the measure-engine module, the value sets under measures/, and the gaps endpoint. Then propose a plan-mode breakdown, ask me about the seven open questions in §10, and don't write any code until I approve. Be strict about the integrity rule: zero silent value-set modifications this phase — every deviation must be flagged and auditable.

Commit at meaningful milestones: cohort module, integrity core + CMS165 cleanup, CMS122, CMS130, care-gap refactor, housekeeping, ADRs, CHANGELOG, tag.

---

## 12. Exit criteria

Phase 4 closes when:

- All §3 checklist items pass on a fresh clone
- Three measures run against cohorts
- Every value-set deviation is flagged in the integrity endpoint AND in MeasureReport provenance
- `/gaps` reads stored MeasureReports (no recompute); returns 409 if none exists
- All "CMS125" references corrected
- CI green; `v0.4.0-alpha.1` tagged; CHANGELOG updated; README updated
- ADRs 0002 and 0003 committed
- (Optional) `docs/PHASE_4_RETRO.md`

Then come back to claude.ai for Phase 5 — the AI extraction layer, where an LLM pulls structured FHIR evidence out of unstructured notes with mandatory provenance. That's the phase where the "AI" in the project's pitch becomes real.

---

_Plan authored after Phase 3 completion (v0.3.0-alpha.1), informed by the Phase 3 code audit (all-patients scope; CMS165 fallback; 7-code Office Visit supplement; gaps-recompute). Executor: Claude Code in plan mode. Reviewer: Parag Medsinge._
