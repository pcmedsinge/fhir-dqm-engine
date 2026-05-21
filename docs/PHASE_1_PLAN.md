# Phase 1 — Scaffolding

**Project:** `fhir-dqm-engine` (codename **Pramana**)
**Phase:** P1 of 7 — Foundation
**Estimated effort:** 5–8 hours of focused work, ~1 calendar week for an evening builder
**Definition of P1 success:** A working NestJS skeleton with CI green and a Docker image that runs. Nothing FHIR or CQL yet — that's Phase 2 onward.

---

## 1. Goal

Stand up a credible TypeScript + NestJS foundation that future phases will build on. By the end of P1, a stranger should be able to clone the repo, run two commands, and have the service responding on `localhost:3000/health`. That's the bar.

This phase is deliberately boring. The goal is **clean infrastructure**, not features. If we get the scaffolding right, Phases 2–7 are mostly about adding modules to it.

---

## 2. Stack (locked in)

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.x | Strict mode on |
| Runtime | Node.js 20 LTS | Specify via `engines` in `package.json` |
| Framework | NestJS (latest stable) | Decorator-based, DI, ASP.NET-flavored |
| Package manager | pnpm | Lockfile committed |
| Module system | ESM | `"type": "module"` in package.json |
| Web server | NestJS default (Express adapter) | Migrate to Fastify later if needed |
| Test framework | Jest | NestJS default |
| Linter | ESLint | Standard Nest preset + strict rules |
| Formatter | Prettier | Default config |
| CI | GitHub Actions | Lint + test + build + Docker build |
| Container | Docker | Multi-stage build |
| API docs | Swagger via `@nestjs/swagger` | Auto-generated from decorators |
| Health checks | `@nestjs/terminus` | Pluggable for future dependencies |
| Config | `@nestjs/config` with validation | Joi or class-validator |
| Logging | NestJS built-in Logger | Migrate to Pino in a later phase if needed |
| License | Apache-2.0 (already in repo) | Match repo license file |

---

## 3. Definition of done — the P1 checklist

A reviewer can verify P1 is complete by running these commands successfully:

```bash
git clone https://github.com/pcmedsinge/fhir-dqm-engine.git
cd fhir-dqm-engine
pnpm install                      # all dependencies install cleanly
pnpm run lint                     # passes with no errors
pnpm test                         # all tests pass (at minimum one health-check test)
pnpm run build                    # compiles TypeScript to dist/
pnpm run start:dev                # server starts, logs ready on port 3000
curl http://localhost:3000/health # returns 200 with version info JSON
curl http://localhost:3000/api    # serves Swagger UI
docker build -t pramana:dev .     # Docker image builds
docker run -p 3000:3000 pramana:dev # container starts, /health returns 200
```

Plus, on GitHub:

- ✅ GitHub Actions workflow runs on push to main and on PRs
- ✅ Status badge in README reflects build state
- ✅ All commits since P1 start are linear (no merge clutter)
- ✅ `docs/` folder contains this plan + an updated CHANGELOG entry for v0.1.0-alpha.1

---

## 4. Folder structure (target)

```
fhir-dqm-engine/
├── .github/
│   └── workflows/
│       └── ci.yml                    # lint + test + build + docker
├── docs/
│   ├── architecture.svg              # (exists)
│   ├── PHM_strategic_recommendation.md  # (exists)
│   ├── PHM_knowledge_base.md         # (exists, paste in)
│   └── PHASE_1_PLAN.md               # this file
├── src/
│   ├── main.ts                       # NestFactory bootstrap
│   ├── app.module.ts                 # root module
│   ├── common/
│   │   ├── constants.ts
│   │   └── interfaces/
│   └── modules/
│       └── health/
│           ├── health.module.ts
│           ├── health.controller.ts  # GET /health
│           └── health.controller.spec.ts
├── test/
│   └── app.e2e-spec.ts
├── .dockerignore
├── .editorconfig
├── .env.example
├── .eslintrc.cjs
├── .gitignore                        # (exists)
├── .prettierrc
├── Dockerfile                        # multi-stage
├── LICENSE                           # (exists)
├── README.md                         # (exists, will be updated)
├── docker-compose.yml                # placeholder for P2 (HAPI FHIR will join)
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.build.json
└── CHANGELOG.md
```

### Module placeholders to anticipate future phases

The `src/modules/` folder should be structured to accommodate (but not yet contain) these future modules:

- `modules/measure-engine/` — Phase 3 (CQL execution)
- `modules/care-gap/` — Phase 4
- `modules/ai-extraction/` — Phase 5
- `modules/mcp-server/` — Phase 6
- `modules/stars-projection/` — Phase 7

For P1, only `modules/health/` actually exists.

---

## 5. Specifics that matter

### The `/health` endpoint

Use `@nestjs/terminus`. The endpoint should return:

```json
{
  "status": "ok",
  "info": {
    "service": { "status": "up" }
  },
  "version": "0.1.0-alpha.1",
  "node": "v20.x.x",
  "uptime": 12.34
}
```

In future phases we'll add dependency health checks (HAPI FHIR connection in P2, etc.). For now, just the service itself.

### Configuration

Use `@nestjs/config` with schema validation at startup. The `.env.example` file should be committed to the repo with placeholder values; the real `.env` should be gitignored (already covered).

Required env vars for P1:

- `NODE_ENV` (one of: development, test, production)
- `PORT` (default 3000)
- `LOG_LEVEL` (default info)

Validation should reject startup if any required var is missing or invalid.

### Logging

Use NestJS's built-in Logger. Structured JSON output in production, pretty-print in development. Log level configurable via `LOG_LEVEL` env var.

### Security baseline

Even at P1, set up:

- `helmet` middleware for security headers
- CORS configured (locked down by default; document how to open it)
- Request body size limit
- Health endpoint exempt from auth (auth doesn't exist yet anyway)

### Dockerfile (multi-stage)

```
Stage 1: builder
  - Node 20 alpine
  - Install pnpm
  - Copy package.json + pnpm-lock.yaml
  - pnpm install --frozen-lockfile
  - Copy src/
  - pnpm run build

Stage 2: runner
  - Node 20 alpine
  - Install pnpm
  - Copy package.json + pnpm-lock.yaml
  - pnpm install --prod --frozen-lockfile
  - Copy dist/ from builder
  - Run as non-root user
  - EXPOSE 3000
  - CMD ["node", "dist/main.js"]
```

Target image size: under 200 MB.

### GitHub Actions workflow

`.github/workflows/ci.yml` should:

1. Trigger on push to `main` and on all PRs
2. Run on `ubuntu-latest`
3. Use Node 20
4. Install pnpm with caching
5. Run `pnpm install --frozen-lockfile`
6. Run `pnpm run lint`
7. Run `pnpm test`
8. Run `pnpm run build`
9. Run `docker build` (no push, just verify the build)

Add a status badge to the README replacing the current static `status: pre-alpha` badge:

```markdown
![CI](https://github.com/pcmedsinge/fhir-dqm-engine/actions/workflows/ci.yml/badge.svg)
```

### Tests at P1

Minimum:

- One e2e test that boots the Nest app and asserts `/health` returns 200
- One unit test for the health controller

This isn't TDD heaven — it's "the test infrastructure is wired up so future phases can add tests without setup friction."

### README updates

After P1 is done:

- Replace `![status](https://img.shields.io/badge/status-pre--alpha-orange?style=flat)` with the live CI badge
- Add a "Quick start" section showing the `pnpm install` / `pnpm run start:dev` flow
- Update the "Status" section from "currently scaffolding" to "v0.1.0-alpha.1 — scaffolding complete, working on data ingest"

---

## 6. What's explicitly OUT of scope for P1

Resist all temptation to add these in Phase 1:

- ❌ FHIR libraries (`@types/fhir`, `fhir.js`, etc.) — Phase 2
- ❌ `cql-execution` or `cql-exec-fhir` — Phase 3
- ❌ HAPI FHIR server in docker-compose — Phase 2
- ❌ Database / persistence (Postgres, MongoDB, Redis) — needed in Phase 3+
- ❌ Authentication / authorization — Phase 6 at earliest
- ❌ LLM / AI dependencies — Phase 5
- ❌ MCP server libraries — Phase 6
- ❌ Frontend / React / dashboard — Phase 7
- ❌ Kubernetes manifests, Helm charts, Terraform — premature optimization
- ❌ Synthea integration — Phase 2
- ❌ Sample CQL or measure files — Phase 3

If during P1 you feel pulled toward any of these, that's a signal to *stop* and revisit P1 scope. **Discipline in P1 is what makes P2–P7 possible.**

---

## 7. Open questions for Claude Code's plan mode

These are tactical decisions I'd suggest Claude Code address in plan mode before writing code:

1. **NestJS scaffolding approach** — use `nest new` CLI command (creates a known-good baseline, then we customize) or set up manually from scratch? Recommendation: use the CLI for speed, then audit/adjust.
2. **Husky / commit hooks** — set up pre-commit linting now or defer? Recommendation: set up now (`husky` + `lint-staged`), since adding later is annoying.
3. **Conventional Commits** — adopt the convention now? Recommendation: yes, with `commitlint` enforced via Husky. Makes future changelog generation automatic.
4. **Multi-package monorepo** (pnpm workspaces) vs single package? Recommendation: single package for P1; revisit if Phase 5 (AI extraction) or Phase 7 (dashboard) need their own packages.
5. **Container registry** — push images to GHCR (GitHub Container Registry) at end of CI, or just verify build? Recommendation: verify build only at P1; push only on tagged releases later.

Claude Code: please confirm these recommendations or propose alternatives before executing.

---

## 8. How to start the Phase 1 build (after this plan is committed)

1. Open terminal in `fhir-dqm-engine/` directory
2. Make sure you have Node 20 and pnpm installed:
   ```bash
   node --version    # should show v20.x.x
   pnpm --version    # if missing: npm install -g pnpm
   ```
3. Make sure `gh` (GitHub CLI) is installed and authenticated — Claude Code uses it for some operations
4. Start a Claude Code session:
   ```bash
   claude
   ```
5. First message to Claude Code:
   > Read `docs/PHASE_1_PLAN.md` carefully. Then propose a plan-mode breakdown of how you'll execute Phase 1, ask me about the five open questions in §7, and don't write any code until I approve the plan.

6. Work through plan-mode together, then let Claude Code execute.

7. After each meaningful step (project init, CI added, Docker added, etc.), review and commit. Don't let one giant commit appear at the end.

---

## 9. Exit criteria — Phase 1 closes when

- All checklist items in §3 pass
- The repo has a green CI run on `main`
- A CHANGELOG entry for `v0.1.0-alpha.1` is committed with a summary of what was scaffolded
- A `v0.1.0-alpha.1` git tag is pushed
- (Optional) A short retrospective note added to `docs/PHASE_1_RETRO.md` capturing what surprised you, what to do differently in Phase 2

When all of the above are true, you're done with P1. Come back to claude.ai for the Phase 2 plan.

---

*Plan authored: May 21, 2026. Executor: Claude Code in plan mode. Reviewer: Parag Medsinge.*
