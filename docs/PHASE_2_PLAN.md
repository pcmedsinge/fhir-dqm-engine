# Phase 2 — Test data + FHIR store

**Project:** `fhir-dqm-engine` (codename **Pramana**)
**Phase:** P2 of 7 — Clinical data foundation
**Predecessor:** P1 (scaffold) — complete at `v0.1.0-alpha.1`
**Estimated effort:** 14–18 hours of focused work, ~2–3 calendar weeks for an evening builder
**Target tag at end of phase:** `v0.2.0-alpha.1`

---

## 1. Goal in plain English

By the end of Phase 2, your laptop runs a real FHIR server populated with 250 synthetic patients, and your NestJS app can talk to that server.

Phase 1 gave you an app shell that knows nothing about healthcare. Phase 2 adds clinical data underneath. Phase 3 will run real quality measures against that data. **No measures, no care gaps, no AI yet** — that's Phase 3 onward. This phase is _foundation_.

---

## 2. How the pieces connect (mental model)

```
You / Loader / NestJS app
    │   speaks FHIR over HTTP (port 8080)
    ▼
HAPI FHIR server          ◄── new in P2
    │   speaks SQL internally
    ▼
Postgres database         ◄── new in P2
```

Three things matter from this picture:

- **You only ever speak FHIR.** Your code makes HTTP calls to HAPI; HAPI does all the SQL.
- **HAPI is the translator.** It turns FHIR resources into SQL `INSERT`s and FHIR queries into SQL `SELECT`s.
- **Postgres is HAPI's private storage.** You never read or write Postgres tables directly. If you swap HAPI for Azure FHIR or AWS HealthLake tomorrow, your code keeps working — that's the whole point of the FHIR standard.

---

## 3. Definition of P2 success

A reviewer can verify P2 is complete by running these commands on a fresh clone:

```bash
# === Setup ===
git clone https://github.com/pcmedsinge/fhir-dqm-engine.git
cd fhir-dqm-engine
cp .env.example .env
pnpm install
pnpm build

# === Start the FHIR stack (HAPI + Postgres) ===
docker compose up -d            # services come up in background

# Wait until HAPI is healthy:
curl http://localhost:8080/fhir/metadata   # 200 + CapabilityStatement JSON

# === One-time bootstrap: generate Synthea data, load into HAPI ===
pnpm run seed:fhir              # ~10–15 minutes the first time
                                # near-instant ("already seeded") on subsequent runs

# === Start the engine (in a SECOND terminal) ===
pnpm --filter @pramana/engine start:dev
# Engine listens on http://localhost:3000

# === Verify (back in the first terminal) ===
curl http://localhost:3000/health
# Now also reports the FHIR server:
# { "status": "ok", "info": { "service": {...}, "fhir": { "status": "up", "url": "..." } }, ... }

curl http://localhost:3000/v1/fhir/stats
# {
#   "fhirServerUrl": "http://localhost:8080/fhir",
#   "fhirVersion": "4.0.1",
#   "resourceCounts": {
#     "Patient": 250,
#     "Encounter": ~12500,
#     "Observation": ~89000,
#     "Procedure": ~4200,
#     ...
#   }
# }
```

(The exact resource counts will vary slightly with the Synthea seed; ranges above are typical.)

Plus, on GitHub:

- ✅ CI green on `main`
- ✅ `v0.2.0-alpha.1` tag pushed
- ✅ `CHANGELOG.md` updated with phase-2 entry
- ✅ README "Status" section updated to reflect P2 completion
- ✅ This plan committed at `docs/PHASE_2_PLAN.md`
- ✅ `docker-compose.yml` includes HAPI + Postgres and works on a fresh clone

---

## 4. New things this phase adds

### 4.1 Local FHIR server stack (docker-compose)

Add two services to `docker-compose.yml`:

| Service         | Image                               | Purpose                                       |
| --------------- | ----------------------------------- | --------------------------------------------- |
| `hapi-fhir`     | `hapiproject/hapi:<pinned-version>` | The FHIR R4 server (port 8080)                |
| `hapi-postgres` | `postgres:16-alpine`                | HAPI's persistence (port 5432, internal only) |

**Why Postgres, not H2 (HAPI's default in-memory store):** Postgres matches what production deployments use. Any quirks we hit locally are quirks production users would also hit — better to find them in dev.

**HAPI configuration is via environment variables** (the Docker image maps env vars onto Spring properties). Set at minimum:

- `spring.datasource.url=jdbc:postgresql://hapi-postgres:5432/hapi`
- `spring.datasource.username=hapi`
- `spring.datasource.password=hapi` (dev only; document override for production)
- `spring.datasource.driverClassName=org.postgresql.Driver`
- `spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQL10Dialect`
- `hapi.fhir.fhir_version=R4`
- `hapi.fhir.subscription.resthook_enabled=false` (reduces noise in dev)

Volumes:

- `hapi-postgres-data` — persistent Postgres data (so restarting containers doesn't lose your seeded patients)

Network: docker-compose default network is fine. Both services on it; the NestJS app (running on the host, not in compose) reaches HAPI via `http://localhost:8080`.

### 4.2 Synthea-based test data generation

Add a `tools/synthea/` directory with:

- A script (Node TypeScript) that invokes Synthea to generate FHIR R4 bundles
- Pinned configuration:
  - **State:** Massachusetts (Synthea's most validated module set)
  - **Population:** 250 living patients with the standard module mix
  - **Format:** FHIR R4 bundles, one per patient
  - **Random seed:** Fixed so the same seed = the same 250 patients across runs

Output location: `tools/synthea/output/fhir/` — gitignored (~300–500 MB).

Pnpm script: `pnpm run synthea:generate`.

### 4.3 Bulk loader (Synthea bundles → HAPI)

A small Node script under `tools/loader/load-to-hapi.ts` that:

1. Reads all `.json` files from `tools/synthea/output/fhir/`
2. **Checks for a sentinel resource** in HAPI (`Basic` resource with identifier `urn:pramana:seed-marker`). If found and no `--force` flag, prints "Already seeded — skipping" and exits with code 0.
3. Otherwise, for each Bundle file, POSTs it to HAPI as a **transaction bundle** (`POST /fhir/`). Synthea writes Bundles with `type: transaction` already — we keep that type so HAPI resolves cross-resource references atomically.
4. Tracks progress (log every 25 patients), retries each Bundle up to 2 times on 5xx with backoff.
5. **Fails fast on persistent error.** Does NOT write the sentinel marker. The dataset is left partially loaded; the user fixes and re-runs (the loader is naturally idempotent because Synthea bundles use unique identifiers — re-POSTing them is safe).
6. On full success: writes the `Basic` sentinel resource, prints a resource-count summary, exits 0.

Pnpm script: `pnpm run fhir:load`.
Combined script: `pnpm run seed:fhir` runs `synthea:generate` then `fhir:load`.

Arg parsing: use `yargs` (or equivalent) so flags work consistently:

```
pnpm run seed:fhir              # normal run, respects sentinel
pnpm run seed:fhir --force      # ignore sentinel, reload
```

### 4.4 FHIR client module in NestJS

New module at `packages/engine/src/modules/fhir/`:

```
fhir/
├── fhir.module.ts                    # NestJS module
├── fhir.config.ts                    # validates FHIR_SERVER_URL etc.
├── fhir.client.service.ts            # axios wrapper with FHIR-aware helpers
├── fhir.client.service.spec.ts       # unit tests with mocked axios
├── interfaces/
│   ├── fhir-resource.interface.ts
│   └── fhir-search-params.interface.ts
└── controllers/
    └── fhir-stats.controller.ts      # GET /v1/fhir/stats
```

**FhirClientService responsibilities:**

- Configurable base URL (from `FHIR_SERVER_URL` env)
- Timeouts: 30s default, 3s for health checks (separately configurable)
- Hand-rolled retry: 2 retries on 5xx with exponential backoff, no retry on 4xx (no retry library — keep dependency surface small)
- Methods:
  - `getCapabilityStatement()` → `GET /metadata`
  - `getResourceCount(resourceType)` → `GET /{resourceType}?_summary=count`
  - `searchResources(resourceType, params)` → generic search
  - `getResource(resourceType, id)` → fetch one
- Logs every request (info) and every error (warn/error)

**FHIR types:** install `@types/fhir` for ambient typings. Don't bring in `fhir.js` or `fhirclient` yet — axios + types is enough and stays simple.

### 4.5 Updated /health endpoint

Extend the existing health module to include a FHIR indicator using `@nestjs/terminus`:

```json
{
  "status": "ok",
  "info": {
    "service": { "status": "up" },
    "fhir": {
      "status": "up",
      "url": "http://localhost:8080/fhir",
      "fhirVersion": "4.0.1",
      "responseTimeMs": 47
    }
  },
  "version": "0.2.0-alpha.1",
  "node": "v20.x.x",
  "uptime": 12.34
}
```

The FHIR indicator hits `GET /metadata` with a 3s timeout; reports `up` on 200 + valid CapabilityStatement, `down` with an error message otherwise. The endpoint should still return 200 (with overall `status: ok`) even if FHIR is down, so it's safe to call during dev when HAPI isn't running.

### 4.6 Verification endpoint

`GET /v1/fhir/stats` — returns the resource-count JSON from §3. No auth needed (none exists yet). Useful for:

- Confidence-building after seeding
- A baseline future tests can assert against
- Quick visual proof to anyone you're showing the project to

### 4.7 Configuration additions

New env vars (in `.env.example` and validated by config schema):

- `FHIR_SERVER_URL` — default `http://localhost:8080/fhir`
- `FHIR_REQUEST_TIMEOUT_MS` — default `30000`
- `FHIR_HEALTH_CHECK_TIMEOUT_MS` — default `3000`

Validation rejects startup if `FHIR_SERVER_URL` is malformed.

---

## 5. Folder structure delta

```
fhir-dqm-engine/
├── docker-compose.yml                # ← updated: HAPI + Postgres services
├── .gitignore                        # ← updated: tools/synthea/output/, *.synthea.bundle.json
├── tools/                            # ← NEW
│   ├── synthea/
│   │   ├── README.md
│   │   ├── generate.ts
│   │   └── output/                   # gitignored
│   └── loader/
│       ├── load-to-hapi.ts
│       └── load-to-hapi.smoke.spec.ts  # one smoke test, not full coverage
├── packages/
│   └── engine/
│       └── src/
│           └── modules/
│               ├── health/           # ← updated: adds FHIR indicator
│               └── fhir/             # ← NEW (full module per §4.4)
└── docs/
    └── PHASE_2_PLAN.md               # ← this file
```

---

## 6. Practical specifics

### Patient count: why 250

Synthea generates 200–500 resources per patient. 250 patients gives us:

- Enough denominators for Phase 3 measure testing (e.g., women 50–74 for BCS-E; adults with diabetes for HBD-E)
- A manageable dataset (~300 MB) that loads in 10–15 minutes
- Determinism via fixed seed

If Phase 3 finds 250 too thin for a specific measure, we'll bump it then.

### State: Massachusetts

Synthea's MA module set is the most validated. Avoids subtle data-quality surprises. Other states are fine to add later.

### Two terminals during development

P2 development is _unavoidably_ two-terminal:

- **Terminal A:** `docker compose up -d` (one-time per session) and any `pnpm run seed:fhir` / curl commands
- **Terminal B:** `pnpm --filter @pramana/engine start:dev` (the engine runs in the foreground here)

Document this clearly in the README's Quick Start.

### Idempotency is the single most important UX detail

A developer running `pnpm run seed:fhir` should:

- Get a fresh load on first run
- Get a near-instant "already seeded" message on subsequent runs
- Be able to force reload with `pnpm run seed:fhir --force`

This is what makes the project pleasant to clone, walk away from for 5 days, come back to, and resume.

### Don't over-engineer the loader

Dev tool, not production. Sequential POSTs are fine (no parallelism), inline retry helper is fine (no library), one smoke test is fine (no full coverage).

---

## 7. What's explicitly OUT of scope for P2

- ❌ US Core profile validation — Phase 3
- ❌ Loading CMS eCQM sample measures — Phase 3
- ❌ `cql-execution` / `cql-exec-fhir` packages — Phase 3
- ❌ CARIN BB / X12 claims ingestion — much later
- ❌ HL7 v2 ADT feeds — much later
- ❌ Terminology services (LOINC/SNOMED/RxNorm/ICD-10 normalization) — Phase 3 onward
- ❌ Authentication / authorization on FHIR — Phase 6 at earliest
- ❌ NestJS app persistence (database for the engine itself) — engine stays stateless for now
- ❌ Kubernetes / production manifests — much later
- ❌ Performance benchmarking — too early

---

## 8. Open questions for Claude Code's plan mode

Decisions worth confirming before code is written:

1. **Synthea invocation.** Synthea is officially distributed as a JAR, not a Docker image. Options:
   - (a) Pull and run the JAR via a Node script (requires Java on the dev machine)
   - (b) Use a community Docker image of Synthea (e.g., `intersystemsdc/irisdemo-base-synthea` or similar) — varies in quality, may bundle other things
   - (c) Run Synthea via a generic Java Docker image, downloading the JAR at build time
   - **Recommendation: (c)** — most reliable, no community-image surprises, no Java required on the host
2. **HAPI image version.** Pin to a specific recent stable tag (check `hapiproject/hapi` on Docker Hub at execution time). Don't use `latest` — silent breakage when HAPI publishes a new image.
3. **Postgres credentials in docker-compose.** Hardcode `hapi`/`hapi` for dev with a clear comment that production must override.
4. **Bundle loading: transaction vs batch.** Recommendation: **transaction** (atomic, preserves references), as Synthea writes them.
5. **Block `seed:fhir` until HAPI is healthy.** Recommendation: yes — poll `GET /metadata` with backoff up to 60s.
6. **FHIR client library.** Recommendation: `axios` + `@types/fhir`, not `fhir.js` or `fhirclient`.
7. **Postgres volume location.** Named volume (`hapi-postgres-data`) under Docker's management vs a bind mount under `./data/`. Recommendation: named volume — cleaner, no host permission issues, easy to wipe with `docker compose down -v`.

Claude Code: confirm these or propose alternatives in plan mode before executing.

---

## 9. How to start the Phase 2 build (terminal commands)

Open your terminal:

```bash
cd /path/to/fhir-dqm-engine
git checkout main
git pull origin main
claude
```

First message to Claude Code:

> Read `docs/PHASE_2_PLAN.md` carefully. Phase 1 is complete at `v0.1.0-alpha.1` — first review the current repo state (look at `package.json`, `pnpm-workspace.yaml`, the existing `health` module, `docker-compose.yml`, the README) so your plan reflects what's actually there. Then propose a plan-mode breakdown of Phase 2 execution, ask me about the seven open questions in §8, and don't write any code until I approve the plan.

Work through plan-mode with Claude Code. Approve. Let it execute. **Commit at meaningful milestones** (compose file added, Synthea script working, loader working, FHIR client added, health updated, stats endpoint, README updated) — not as one giant final commit.

---

## 10. Exit criteria

Phase 2 closes when:

- All §3 checklist items pass on a fresh clone
- CI is green on `main`
- `v0.2.0-alpha.1` tag pushed
- `CHANGELOG.md` entry committed
- README Status section updated
- (Optional but recommended) `docs/PHASE_2_RETRO.md` written — same five-prompt format as P1

When all of the above are true, come back to claude.ai for the Phase 3 plan. Phase 3 is the hinge of the project — the actual CQL engine integration and the first end-to-end HEDIS measure execution.

---

## 11. P3 reminder

Small inconsistency in the README to fix in Phase 3: the Technology choices table says _"CQL execution — HL7 reference `cql-engine` (Java)"_ but the strategic decision (per `docs/PHM_strategic_recommendation.md` §4) is to use NCQA's JavaScript engines (`cql-execution` + `cql-exec-fhir`). Phase 3 will fix this naturally when adding the real install info.

---

_Plan authored: May 23, 2026. Predecessor: PHASE_1_PLAN.md / `v0.1.0-alpha.1`. Executor: Claude Code in plan mode. Reviewer: Parag Medsinge._
