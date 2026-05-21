# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

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

[0.1.0-alpha.1]: https://github.com/pcmedsinge/fhir-dqm-engine/releases/tag/v0.1.0-alpha.1
