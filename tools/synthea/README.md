# tools/synthea — synthetic patient generator

Generates 250 synthetic FHIR R4 patient bundles using [Synthea](https://github.com/synthetichealth/synthea).

## How it works

1. Pulls `eclipse-temurin:17-jre` from Docker Hub (once).
2. Downloads `synthea-with-dependencies.jar` into `.cache/synthea/` (once, ~60 MB).
3. Runs Synthea for 250 Massachusetts patients with a fixed seed.
4. Writes FHIR R4 transaction bundles to `tools/synthea/output/fhir/`.

## Usage

```bash
# Generate (10–15 min on first run; ~10 min on subsequent runs — JAR is cached)
pnpm run synthea:generate

# Generate + load into HAPI in one shot
pnpm run seed:fhir
```

## Configuration

| Setting       | Value         | Rationale                                              |
| ------------- | ------------- | ------------------------------------------------------ |
| Population    | 250           | Enough denominators for Phase 3 measure testing        |
| State         | Massachusetts | Synthea's most validated module set                    |
| Seed          | 20250523      | Fixed → same 250 patients across fresh clones          |
| FHIR version  | R4            | Matches HAPI server config                             |
| Bundle type   | transaction   | Preserves cross-resource references atomically         |
| History years | 10            | Generates sufficient clinical history for CQL measures |

## Output

- `tools/synthea/output/fhir/*.json` — one FHIR R4 transaction bundle per patient (~300–500 MB total, **gitignored**)
- `.cache/synthea/synthea.jar` — cached JAR (**gitignored**)

## Pinning

Synthea ships a rolling `master-branch-latest` JAR with no versioned releases.
The JAR URL is hardcoded in `generate.ts`. To update Synthea: delete `.cache/synthea/` and re-run.
