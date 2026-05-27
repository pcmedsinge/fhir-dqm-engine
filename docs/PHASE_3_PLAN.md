# Phase 3 — First CQL measure end-to-end ⭐

**Project:** `fhir-dqm-engine` (codename **Pramana**)
**Phase:** P3 of 7 — The hinge of the project
**Predecessor:** P2 (FHIR data substrate) — complete at `v0.2.0-alpha.1`
**Estimated effort:** 20–28 hours of focused work, ~3 calendar weeks for an evening builder
**Target tag at end of phase:** `v0.3.0-alpha.1`

---

## 1. Goal in plain English

By the end of Phase 3, your engine runs **one real HEDIS-equivalent quality measure end-to-end** — from CQL file on disk, to FHIR data in HAPI, through NCQA's JavaScript CQL engine, to a fully-formed FHIR `MeasureReport` resource with population counts and an actionable care-gap list.

This is the most important phase in the entire project. Phases 1 and 2 built infrastructure. Phase 3 makes the engine _do its actual job_. After P3, the central thesis of Pramana stops being a claim and starts being a demo.

---

## 2. How the pieces connect (mental model)

```
   CQL file on disk          ELM compiled JSON       FHIR data in HAPI
        (.cql)                   (.elm.json)          (250 patients)
            │                        │                       │
            └─────── compile ────────┘                       │
                         │                                   │
                         ▼                                   │
                ┌────────────────────────────────────────────┘
                │       cql-execution engine
                │       + cql-exec-fhir data source
                │       (NCQA's JS libraries, in-process)
                ▼
        ┌─────────────────────────────────────────┐
        │  For each patient in scope:             │
        │    Initial Population?    true/false    │
        │    Denominator?           true/false    │
        │    Denom Exclusions?      true/false    │
        │    Numerator?             true/false    │
        └─────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  FHIR MeasureReport  │ ──► POST to HAPI (persisted)
              │  - Population counts │ ──► Returned to API caller
              │  - Per-patient flags │ ──► Care-gap list derivable
              └──────────────────────┘
```

Three things to grasp from this picture:

- **CQL doesn't run directly.** CQL is human-readable; the engine actually runs **ELM** (Expression Logic Model — compiled JSON form of the CQL). We need a CQL→ELM step.
- **The engine is in-process.** Unlike HAPI (separate Docker container), the CQL engine is just an npm dependency in your NestJS app. No new container.
- **HAPI is queried twice.** First for the patient cohort, then for each patient's relevant resources. The engine drives this via the `cql-exec-fhir` data source.

---

## 3. Definition of P3 success

A reviewer can verify P3 is complete with these commands:

```bash
# === Setup (assumes P2 stack is up) ===
git clone https://github.com/pcmedsinge/fhir-dqm-engine.git
cd fhir-dqm-engine
cp .env.example .env
pnpm install
pnpm build
docker compose up -d
pnpm run seed:fhir              # idempotent — fast on rerun

# === Start the engine (second terminal) ===
pnpm --filter @pramana/engine start:dev

# === Compute the measure ===
curl -X POST http://localhost:3000/v1/measures/<measure-id>/compute \
  -H "Content-Type: application/json" \
  -d '{
    "periodStart": "2026-01-01",
    "periodEnd":   "2026-12-31"
  }'

# Returns a FHIR MeasureReport:
# {
#   "resourceType": "MeasureReport",
#   "status": "complete",
#   "type": "summary",
#   "measure": "Measure/<measure-id>",
#   "period": { "start": "2026-01-01", "end": "2026-12-31" },
#   "group": [{
#     "population": [
#       { "code": { "coding": [{ "code": "initial-population" }] }, "count": 30 },
#       { "code": { "coding": [{ "code": "denominator" }] },        "count": 30 },
#       { "code": { "coding": [{ "code": "denominator-exclusion" }] }, "count": 1 },
#       { "code": { "coding": [{ "code": "numerator" }] },          "count": 22 }
#     ],
#     "measureScore": { "value": 0.733 }
#   }]
# }

# === List open care gaps ===
curl http://localhost:3000/v1/measures/<measure-id>/gaps
# Returns:
# {
#   "measureId": "<measure-id>",
#   "openGapsCount": 8,
#   "gaps": [
#     { "patientId": "Patient/abc-123", "reason": "denominator-met, numerator-not-met" },
#     ...
#   ]
# }
```

(Exact counts will vary with the measure chosen and Synthea seed. What matters is non-zero numerator and denominator counts that change when patient data changes.)

Plus, on GitHub:

- ✅ CI green on `main`
- ✅ `v0.3.0-alpha.1` tag pushed
- ✅ `CHANGELOG.md` updated
- ✅ README "Status" + "Technology choices" updated (see §10 — README correction)
- ✅ This plan committed at `docs/PHASE_3_PLAN.md`
- ✅ MeasureReport JSON returned matches the FHIR MeasureReport profile (validates via HAPI POST)

---

## 4. New things this phase adds

### 4.1 CQL engine dependencies

Install NCQA's JavaScript engines (npm packages):

- `cql-execution` — the runtime that evaluates compiled ELM against FHIR data
- `cql-exec-fhir` — the FHIR data source plugin for the engine

These are NCQA's _own_ reference engines (the ones they use to test HEDIS measures). Using them gives us free correctness alignment with NCQA's expectations.

Optional — for compiling CQL→ELM at build time (covered in §4.4):

- `cql-translator-service` (Docker) OR pre-compiled ELM JSON shipped alongside the CQL file

### 4.2 First measure: choose ONE

Pick one measure for v0.1. Resist the temptation to ship two. Candidates:

| Candidate                                                           | Why this                                                                    | Why not this                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **CMS125** Breast Cancer Screening (eCQM equivalent of HEDIS BCS-E) | Matches the BCS-E example we've used throughout the project; familiar shape | May need value-set substitution to match Synthea-generated mammography codes |
| **CMS124** Cervical Cancer Screening                                | Classic Connectathon test measure; widely available CQL+ELM artifacts       | Same Synthea data-quality consideration                                      |
| **CMS165** Controlling High Blood Pressure                          | Synthea generates rich BP data; high probability of non-zero numerator      | Slightly more complex (BP measurement logic)                                 |
| **CMS130** Colorectal Cancer Screening                              | Simpler structure                                                           | Mammography is the running BCS example we've been teaching with              |

**Recommendation:** start with **CMS125 (Breast Cancer Screening)** to continue the BCS-E narrative thread from the LinkedIn post and knowledge base. If during execution the Synthea data turns out to be too thin to produce non-zero numerators, fall back to CMS165 (BP control), where Synthea data is denser.

Where to get the measure files:

- eCQI Resource Center (https://ecqi.healthit.gov/) — official CMS eCQM publishing site
- `cqframework/sample-content-ig` — GitHub repo with FHIR-IG-packaged sample measures
- Connectathon test packs — public, well-tested

Save the measure artifacts under `packages/engine/measures/<measure-id>/` in the repo:

```
measures/
└── cms125-bcs/
    ├── README.md                          # what this measure is, where it came from
    ├── Measure-CMS125.json                # FHIR Measure resource
    ├── Library-CMS125.json                # FHIR Library resource (wraps ELM)
    ├── cql/                               # human-readable source
    │   └── BreastCancerScreening.cql
    ├── elm/                               # compiled, what the engine actually runs
    │   └── BreastCancerScreening.json
    └── value-sets/                        # if needed locally
        └── mammography.json
```

### 4.3 Posting Measure + Library to HAPI on startup

For the CQL engine to fully function (and for HAPI to validate the MeasureReport we POST later), the `Measure` and `Library` resources need to exist in HAPI. Add a startup step that:

1. Reads measure artifacts from `packages/engine/measures/`
2. POSTs them to HAPI (idempotent — use known IDs, PUT to upsert)
3. Logs the result

This way, a clean clone + `seed:fhir` results in a fully populated FHIR store including measure definitions.

### 4.4 ELM compilation strategy

**Recommended approach for v0.1: ship pre-compiled ELM in the repo.**

Reasoning: dynamic CQL→ELM compilation in Node.js requires either:

- Running the Java-based `cql-to-elm` translator as a sidecar service (extra Docker container)
- A JS port of the translator (exists but less mature)

For v0.1, the simplest, most reliable path is:

- Commit the `.cql` source (for humans and version control)
- Commit the corresponding `.elm.json` (for the engine to actually run)
- A future phase can add live CQL compilation if needed

Document this clearly in the measure README. Add a `pnpm run measures:recompile` script that talks to `cql-translator-service` (run as ad-hoc Docker) when measures need to be rebuilt — but it's not required for normal dev.

### 4.5 New module: `measure-engine`

Create at `packages/engine/src/modules/measure-engine/`:

```
measure-engine/
├── measure-engine.module.ts            # NestJS module
├── measure-engine.config.ts
├── services/
│   ├── measure-loader.service.ts       # loads ELM + value sets + FHIR resources from disk
│   ├── measure-loader.service.spec.ts
│   ├── cql-runtime.service.ts          # wraps cql-execution + cql-exec-fhir
│   ├── cql-runtime.service.spec.ts
│   ├── measure-report.service.ts       # transforms engine output → FHIR MeasureReport
│   └── measure-report.service.spec.ts
├── controllers/
│   └── measure.controller.ts           # POST /v1/measures/:id/compute, GET .../gaps
└── interfaces/
    ├── compute-request.dto.ts
    └── measure-report-summary.interface.ts
```

**`MeasureLoaderService` responsibilities:**

- Loads ELM JSON for a given measure ID
- Loads value sets (from disk; future phase: from a terminology server)
- Returns a runnable measure descriptor

**`CqlRuntimeService` responsibilities:**

- Instantiates the cql-execution engine with cql-exec-fhir as the data source
- Wires the data source to your existing `FhirClientService` (from P2)
- Executes the measure against a patient set
- Returns raw engine output (booleans per patient per population)

**`MeasureReportService` responsibilities:**

- Takes raw engine output + measure metadata
- Constructs a valid FHIR `MeasureReport` resource
- POSTs it to HAPI (so it lives in FHIR; idempotent on (measure, period) pair)
- Returns the MeasureReport JSON

### 4.6 API endpoints (versioned at /v1)

| Method | Path                       | Behavior                                                                                                                     |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v1/measures/:id/compute` | Body: `{ periodStart, periodEnd }`. Computes the measure. Returns FHIR MeasureReport JSON. Also POSTs MeasureReport to HAPI. |
| `GET`  | `/v1/measures/:id/gaps`    | Returns patients in the most recent MeasureReport whose denominator is met but numerator is not.                             |
| `GET`  | `/v1/measures/:id/report`  | Returns the most recent MeasureReport for this measure (fetched from HAPI).                                                  |
| `GET`  | `/v1/measures`             | Lists all measures the engine knows how to run.                                                                              |

All endpoints documented via Swagger.

### 4.7 Updated /health endpoint

Extend with measure-engine readiness:

```json
{
  "status": "ok",
  "info": {
    "service": { "status": "up" },
    "fhir":    { "status": "up", ... },
    "measureEngine": {
      "status": "up",
      "loadedMeasures": ["CMS125"],
      "cqlExecutionVersion": "..."
    }
  }
}
```

### 4.8 Configuration additions

New env vars:

- `MEASURES_PATH` — default `./packages/engine/measures` (path to measure artifacts on disk)
- `MEASUREREPORT_PERSIST_TO_FHIR` — default `true` (whether to POST MeasureReport to HAPI after computing)

---

## 5. Folder structure delta

```
fhir-dqm-engine/
├── packages/
│   └── engine/
│       ├── measures/                         # ← NEW (committed)
│       │   └── cms125-bcs/
│       │       ├── README.md
│       │       ├── Measure-CMS125.json
│       │       ├── Library-CMS125.json
│       │       ├── cql/BreastCancerScreening.cql
│       │       └── elm/BreastCancerScreening.json
│       └── src/
│           └── modules/
│               ├── health/                   # ← updated: measure-engine indicator
│               ├── fhir/                     # (from P2)
│               └── measure-engine/           # ← NEW (full module per §4.5)
└── docs/
    ├── PHASE_3_PLAN.md                       # ← this file
    └── adr/                                  # ← NEW (recommend; see §6)
        └── 0001-pre-compile-elm.md           # architecture decision record
```

---

## 6. Practical specifics

### Sanity-check the measure data BEFORE writing code

Before wiring up cql-execution, do this:

1. Pick the measure (e.g., CMS125)
2. Read its CQL source — understand the populations
3. Manually query HAPI: do we have patients matching the IPP? Do they have the procedures the numerator looks for?

If the answer is "no patients" or "no procedures matching the value sets," **stop and substitute either the measure or the value sets**. There's no point integrating the engine if the data won't satisfy the rules. This sanity check saves 5+ hours.

### Expect Synthea data-quality bumps

Synthea is good but not perfect. Common gotchas:

- Procedure codes may not exactly match value sets used in CMS measures (different code systems)
- Encounter classifications may be different
- Date ranges may not align with the default measurement period

Mitigation options, in order of preference:

1. Adjust the measurement period to a year when Synthea has dense data (often 2018–2023)
2. Use a more permissive variant of the value set
3. Augment specific patients with hand-crafted resources (last resort — note it in the README)

### Architecture Decision Records

P3 introduces real engineering decisions worth recording. Start an `docs/adr/` folder. First ADR: "Pre-compile ELM instead of doing live CQL→ELM in Node" (with rationale from §4.4). Use the simple Michael Nygard template. Future phases will add more.

### Don't over-engineer the runtime wrapper

`CqlRuntimeService` should be a thin wrapper. The cql-execution library does the hard work; your service just configures it. If your service grows beyond ~200 lines, you're probably duplicating something.

### One measure, one measure, one measure

Resist the gravity toward "while I'm here, let me add CMS165 too." Adding the second measure is Phase 4. Adding it now lengthens P3 by easily 30%, doubles debug surface, and risks not shipping P3.

---

## 7. What's explicitly OUT of scope for P3

- ❌ More than one measure — Phase 4
- ❌ Stratifiers (age bands, gender, race/ethnicity breakdowns) — Phase 4
- ❌ AI-driven extraction from notes — Phase 5
- ❌ Provenance writes — Phase 5
- ❌ MCP server — Phase 6
- ❌ Stars projection — Phase 7
- ❌ Web dashboard — Phase 7
- ❌ Live CQL→ELM compilation in the engine — future enhancement
- ❌ Terminology server integration (LOINC/SNOMED/RxNorm normalization beyond what's in value sets) — Phase 4+
- ❌ Authentication on measure compute endpoints — Phase 6 at earliest

---

## 8. Open questions for Claude Code's plan mode

Decisions worth resolving in plan mode before code:

1. **Measure selection.** Recommendation: **CMS125 (Breast Cancer Screening)** as primary; CMS165 (BP Control) as fallback if Synthea data is thin. Confirm or propose alternative.
2. **Source of measure artifacts.** eCQI Resource Center vs. `cqframework/sample-content-ig` vs. Connectathon packs. Recommendation: **investigate which has the cleanest current FHIR-flavored package for the chosen measure, prefer the one with pre-compiled ELM included**.
3. **Patient-list scope.** Engine can run measure against (a) all patients, (b) a Group resource, (c) a manually-supplied patient ID list. Recommendation: **support (a) for v0.1 with a Group-resource path stubbed for Phase 4**.
4. **MeasureReport type.** FHIR supports `individual`, `subject-list`, `summary`, `data-collection`. Recommendation: **summary** for v0.1; per-patient detail lives in the gaps endpoint.
5. **Where to POST the MeasureReport.** Recommendation: **HAPI** (consistency: all FHIR resources live in one store). Use the (`measure`, `period`) pair as conditional identity for idempotent upserts.
6. **Engine instantiation.** Recommendation: **per-request** (statelessness; clear lifecycle) rather than long-lived. Engine instantiation is cheap.
7. **Patient batching.** For 250 patients, single-batch is fine. Recommendation: **process all patients in one call to the engine; introduce batching later if needed**.
8. **Tests.** What's the minimum bar? Recommendation: **(a) unit test the MeasureReport assembly with mocked engine output; (b) one smoke test that boots the app + computes the measure against a tiny in-memory FHIR dataset; (c) one integration test against a running HAPI is nice but optional in CI**.

Claude Code: confirm these or propose alternatives in plan mode before executing.

---

## 9. How to start the Phase 3 build

```bash
cd /path/to/fhir-dqm-engine
git checkout main
git pull origin main

# Verify P2 baseline:
docker compose up -d
pnpm run seed:fhir
pnpm --filter @pramana/engine start:dev   # in another terminal
curl http://localhost:3000/v1/fhir/stats  # should show ~250 patients

# Once baseline is confirmed, start the session:
claude
```

First message to Claude Code:

> Read `docs/PHASE_3_PLAN.md` carefully. Phase 2 is complete at `v0.2.0-alpha.1`. First, review the current repo state — especially the `fhir` module from P2, the docker-compose setup, and any measure-engine-related dependencies already in package.json. Then propose a plan-mode breakdown of Phase 3 execution, ask me about the eight open questions in §8, and don't write any code until I approve the plan. Phase 3 is the most important phase of the project — please be especially careful about scope creep and surface any concerns about the chosen measure before installing anything.

Work through plan-mode with Claude Code. Approve. Let it execute. **Commit at meaningful milestones**: measure artifacts vendored, cql-execution + cql-exec-fhir installed, measure-loader service working, cql-runtime service computing booleans, MeasureReport assembly, API endpoints, gaps endpoint, README + technology table updates, CHANGELOG, tag.

---

## 10. README correction (do this as part of P3)

Recall the P2 plan flagged: the README's Technology choices table still says _"CQL execution — HL7 reference `cql-engine` (Java)"_. Fix this in Phase 3 — update that row to reflect the actual decision:

| Layer         | Choice                                         | Why                                                                           |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| CQL execution | `cql-execution` + `cql-exec-fhir` (JavaScript) | NCQA's own reference engines — measures they certify run bit-identically here |

Also update the "Status" section to reflect P3:

> **v0.3.0-alpha.1 — first measure running end-to-end.** Phases 1–3 complete. A reference HEDIS-equivalent measure (CMS125 Breast Cancer Screening) executes against synthetic Synthea data through NCQA's reference CQL engines, producing FHIR MeasureReports. Phase 4 (multiple measures + care-gap workflows) is next.

---

## 11. Exit criteria

Phase 3 closes when:

- All §3 checklist items pass on a fresh clone
- CI is green on `main`
- `v0.3.0-alpha.1` tag pushed
- `CHANGELOG.md` entry committed
- README "Status" and "Technology choices" updated (see §10)
- At least one ADR committed in `docs/adr/`
- (Optional but recommended) `docs/PHASE_3_RETRO.md` written

When all the above are true, come back to claude.ai for the Phase 4 plan. Phase 4 layers on: more measures, stratifiers, the formal care-gap workflow. Easier than P3 because the engine is no longer the unknown.

---

## 12. Why this phase matters more than the others (note to self)

After this phase, the project becomes demonstrable. You can:

- Hand someone a URL and have them see a real MeasureReport
- Update your LinkedIn with a concrete artifact ("first measure running end-to-end")
- Have a 5-minute demo for any payer/ACO conversation
- Point recruiters and collaborators at something working

Phases 1–2 were credibility-building (the repo looks real). Phase 3 is the **proof** phase. Pace yourself, sanity-check the data before the engine integration, and don't add measure #2 until v0.3.0 is tagged.

---

_Plan authored after Phase 2 completion (v0.2.0-alpha.1). Predecessor plans: `PHASE_1_PLAN.md`, `PHASE_2_PLAN.md`. Executor: Claude Code in plan mode. Reviewer: Parag Medsinge._
