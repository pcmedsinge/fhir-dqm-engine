# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.3.0-alpha.1] — 2026-05-27

### Added

- **CMS165 CBP measure artifacts** (`packages/engine/measures/cms165-cbp/`) — pre-compiled ELM (10 libraries), CQL source, 33 FHIR ValueSet resources, FHIR Measure resource, and `valueSets.json` in cql-execution format. Sourced from `cqframework/ecqm-content-qicore-2024` main branch.
- **`cql-execution@3.3.0` + `cql-exec-fhir@2.1.6`** added as engine dependencies; both ship TypeScript types — no shims needed.
- **`MeasureEngineModule`** (`packages/engine/src/modules/measure-engine/`) — full NestJS module containing:
  - `MeasureLoaderService` — reads ELM + value sets from disk into an in-memory cache; `loadMeasure(id)` and `listMeasureIds()`.
  - `FhirDataSourceAdapter` — bulk-fetches Patients, Conditions, Observations (LOINC `85354-9` BP only), Encounters, Procedures, and MedicationRequests in parallel; adds QICore BP profile URL to Synthea observations for correct CQL profile retrieval; groups by patient into per-patient FHIR Bundles.
  - `CqlRuntimeService` — wires `cql-execution` Repository / Library / Executor + `cql-exec-fhir` PatientSource; per-request instantiation (ADR 0002); returns `PatientResultsMap`.
  - `MeasureReportService` — assembles FHIR `MeasureReport` (type=`summary`) from raw results; PUTs to HAPI with deterministic ID `{measureId}-{periodStart}-{periodEnd}`; `deriveGaps()` returns denominator-met, numerator-not-met patients.
  - `MeasurePublisherService` — `OnApplicationBootstrap` hook: PUTs FHIR Measure resource(s) to HAPI on engine start (idempotent).
  - `MeasureController` — `GET /v1/measures`, `POST /v1/measures/:id/compute`, `GET /v1/measures/:id/report`, `GET /v1/measures/:id/gaps`.
  - `ComputeRequestDto` — class-validator `@IsDateString()` DTO for compute body.
- **`MeasureEngineHealthIndicator`** — soft-down indicator reporting `loadedMeasures` list and `cqlExecutionVersion`; wired into `/health`.
- **ADRs** `docs/adr/0001-pre-compile-elm.md` and `docs/adr/0002-per-request-engine-instantiation.md`.
- **`MEASURES_PATH`** and **`MEASUREREPORT_PERSIST_TO_FHIR`** env vars in `app.module.ts` Joi schema and `.env.example`.

### Changed

- `/health` now includes a `measureEngine` indicator alongside `fhir`.
- `commitlint.config.cjs` — added `measures` to the allowed scope list.

---

## [0.2.0-alpha.1] — 2026-05-27

### Added

- **HAPI FHIR R4 server** (`hapiproject/hapi:v8.8.0-1`) + **Postgres 16** in `docker-compose.yml` with a named volume `hapi-postgres-data` and a `pramana` bridge network. Engine service moved to the `containerized-engine` profile (run on host by default).
- **Synthea patient generator** (`tools/synthea/generate.ts`) — runs Synthea inside `eclipse-temurin:17-jre`; generates 250 Massachusetts patients with seed `20250523`, 10 years of history, FHIR R4 transaction bundles. JAR cached in `.cache/synthea/` so subsequent runs skip the ~60 MB download.
- **HAPI bulk loader** (`tools/loader/load-to-hapi.ts`) with five phases:
  - **A. Readiness** — polls `/fhir/metadata` up to 180 s (HAPI JVM cold-start takes ~4 min).
  - **B. Sentinel** — skips if `Basic/urn-pramana-seed-marker` exists; `--force` overrides.
  - **B.5 Pre-pass** — PUTs 1339 minimal Practitioner / Location / Organization stubs before patient bundles (HAPI v8 strict conditional-reference validation requires referenced resources to exist). 30 s settle after pre-pass.
  - **C. Load** — sequential bundle POSTs; 2 retries (15 s / 45 s waits to survive JVM GC pauses); 300 s timeout for bundles > 5 MB; 45 s cooldown after each large bundle.
  - **D. Sentinel write** — marks HAPI seeded on full success.
  - **E. Summary** — prints resource counts per type.
- **`pnpm run seed:fhir`** — orchestrates `synthea:generate` then `fhir:load`.
- **`@pramana/tools`** workspace package (`tools/`) with its own lint and test targets.
- **NestJS FHIR client module** (`packages/engine/src/modules/fhir/`):
  - `FhirClientService` — axios wrapper with configurable timeout, 2 retries on 5xx, structured logging, minimal inline FHIR R4 interfaces (R3-only `@types/fhir` skipped).
  - `FhirStatsController` — `GET /v1/fhir/stats` returning parallel resource counts for 7 types + FHIR server version.
- **`FhirHealthIndicator`** — Terminus `HealthIndicator` calling `getCapabilityStatement()` (3 s timeout); returns soft-down `{ fhir: { status: "down", ... } }` on failure instead of throwing.
- **Soft-down `/health`** — `HealthController` catches Terminus's `ServiceUnavailableException` and returns HTTP 200 with `status: "error"` in the body so development continues when HAPI isn't running.

### Changed

- `GET /health` response now includes `info.fhir` alongside `info.service`.
- `AppModule` Joi schema extended with `FHIR_SERVER_URL`, `FHIR_REQUEST_TIMEOUT_MS`, `FHIR_HEALTH_CHECK_TIMEOUT_MS` (all have dev-friendly defaults).
- `.gitignore` un-ignores `tools/synthea/` scripts (caught by the broad `synthea/` pattern) while keeping `tools/synthea/output/` and `.cache/synthea/` ignored.
- `commitlint` scope list extended with `tools`.
- README Quick Start updated: Node ≥ 22, two-terminal flow (compose + engine), `seed:fhir` step, updated curl examples.

### Notes

- The HAPI v8.8.0-1 image is fully distroless (only `java` binary — no shell, wget, or curl). Docker `HEALTHCHECK` is not used; readiness is verified by the loader's poll and the engine's FHIR indicator.
- Synthea's `--exporter.years_of_history=10` produces files up to ~60 MB. Large bundles cause HAPI JVM GC pauses; the loader adds adaptive cooldowns to recover cleanly.

---

## [0.1.0-alpha.1] — 2026-05-22

### Added

- **pnpm monorepo** (`packages/engine` + `packages/shared`) as the workspace foundation.
- **`@pramana/engine`** — NestJS 11 / TypeScript 5 HTTP service with:
  - `GET /health` endpoint via `@nestjs/terminus` returning status, version, node runtime, and uptime.
  - `GET /api` — Swagger UI (auto-generated from decorators via `@nestjs/swagger`).
  - `@nestjs/config` startup validation — rejects invalid/missing `NODE_ENV`, `PORT`, `LOG_LEVEL`.
  - `helmet` security headers, CORS locked-down by default (`CORS_ORIGINS` env to open).
  - Request body size enforcement (1 MB cap).
- **`@pramana/shared`** — placeholder package establishing the `@pramana/shared` workspace import pattern for Phase 2+.
- **Husky** + **lint-staged** + **commitlint** (Conventional Commits, `@commitlint/config-conventional`) enforced on every commit.
- **Multi-stage Dockerfile** (Node 20 Alpine; non-root user; target `<200 MB`).
- **Docker Compose** stub — engine service with Phase 2 HAPI FHIR commented out.
- **GitHub Actions CI** — lint → test → build → `docker build` on every push to `main` and on PRs.
- **ESLint 9** (flat config, `typescript-eslint`) per package; strict `no-explicit-any` rule.
- **Prettier** and **EditorConfig** enforced across the monorepo.
- `.gitattributes` to normalize LF line endings in the repo (source runs on Linux in Docker).

### Changed

- **Stack pivot** from the original Python (FastAPI) + .NET 8 (HotChocolate) concept to **TypeScript + NestJS** monorepo. The FHIR domain, CQL execution, and AI/MCP architecture remain as designed; only the implementation language changed. The Node/NestJS ecosystem has stronger FHIR/CQL community support (`cql-exec-fhir`, `@types/fhir`) and aligns better with the MCP SDK TypeScript implementation.
- README updated to reflect NestJS/TS stack, add Quick Start, live CI badge, and updated status.

### Notes

- ESM (`"type": "module"`) was evaluated for the engine package. NestJS 11 uses `module: NodeNext` TypeScript resolution (stricter imports) but compiles to CommonJS output by default. Pure ESM requires additional Jest configuration and has known friction points with NestJS decorators. Deferred to a future phase — noted as technical debt.
- Phase 2 will add FHIR R4 ingest, HAPI FHIR in Docker Compose, and US Core resource type aliases in `@pramana/shared`.

[0.2.0-alpha.1]: https://github.com/pcmedsinge/fhir-dqm-engine/releases/tag/v0.2.0-alpha.1
[0.1.0-alpha.1]: https://github.com/pcmedsinge/fhir-dqm-engine/releases/tag/v0.1.0-alpha.1
