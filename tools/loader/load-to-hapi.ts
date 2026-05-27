/**
 * Pramana bulk loader — posts Synthea FHIR R4 transaction bundles to HAPI.
 *
 * Phases:
 *   A. Readiness   — poll /metadata until HAPI is up (up to 60 s)
 *   B. Sentinel    — skip if already seeded (unless --force)
 *   C. Load        — POST each bundle as a FHIR transaction
 *   D. Sentinel    — write success marker to HAPI
 *   E. Summary     — print resource counts
 *
 * Usage:
 *   pnpm run fhir:load
 *   pnpm run fhir:load -- --force          # ignore sentinel, reload
 *   pnpm run fhir:load -- --fhir-url http://other-host:8080/fhir
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ---------------------------------------------------------------------------
// CLI args (hand-rolled: no yargs dep needed for these 3 flags)
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const force = args.includes('--force');
const fhirUrlArg = args.find((a) => a.startsWith('--fhir-url='))?.split('=')[1];
const bundlesDirArg = args.find((a) => a.startsWith('--bundles-dir='))?.split('=')[1];

const FHIR_URL = fhirUrlArg ?? process.env['FHIR_SERVER_URL'] ?? 'http://localhost:8080/fhir';
const BUNDLES_DIR =
  bundlesDirArg ??
  resolve(process.cwd(), 'tools', 'synthea', 'output', 'fhir');

const SENTINEL_ID = 'urn-pramana-seed-marker';
const SENTINEL_IDENTIFIER_SYSTEM = 'urn:pramana';
const SENTINEL_IDENTIFIER_VALUE = 'seed-marker-v1';
const PROGRESS_EVERY = 25;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Tiny HTTP helper (no axios — this is a dev tool, keep deps minimal)
// ---------------------------------------------------------------------------
interface FhirResponse {
  status: number;
  body: string;
}

function request(
  method: string,
  url: string,
  body?: string,
  timeoutMs = 30_000,
): Promise<FhirResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const headers: Record<string, string> = {
      Accept: 'application/fhir+json',
    };
    if (body) {
      headers['Content-Type'] = 'application/fhir+json';
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
        );
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs.toString()}ms: ${url}`));
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestWithRetry(
  method: string,
  url: string,
  body?: string,
  timeoutMs = 30_000,
): Promise<FhirResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await request(method, url, body, timeoutMs);
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        // Long waits: HAPI may be in JVM GC after a large bundle — 1s/4s are not enough.
        const wait = attempt === 0 ? 15_000 : 45_000;
        console.warn(`  5xx (${res.status.toString()}) on attempt ${(attempt + 1).toString()}, retrying in ${(wait / 1000).toString()}s...`);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        const wait = attempt === 0 ? 15_000 : 45_000;
        console.warn(`  Error on attempt ${(attempt + 1).toString()}, retrying in ${(wait / 1000).toString()}s... (${String(e)})`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Phase A — wait for HAPI to be ready (up to 60 s)
// ---------------------------------------------------------------------------
async function waitForHapi(): Promise<void> {
  const metadataUrl = `${FHIR_URL}/metadata`;
  const deadline = Date.now() + 180_000;
  let attempt = 0;

  console.log(`Waiting for HAPI at ${FHIR_URL} ...`);

  while (Date.now() < deadline) {
    try {
      const res = await request('GET', metadataUrl, undefined, 3_000);
      if (res.status === 200) {
        console.log('  HAPI is ready.\n');
        return;
      }
    } catch {
      // not up yet
    }

    attempt++;
    const jitter = Math.random() * 500;
    const wait = Math.min(2000 + attempt * 500 + jitter, 8000);
    process.stdout.write('.');
    await sleep(wait);
  }

  process.stdout.write('\n');
  console.error(
    '\nHAPI did not become ready within 180 s.\n' +
      'Make sure the stack is running:  docker compose up -d hapi-postgres hapi-fhir',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Phase B — sentinel check
// ---------------------------------------------------------------------------
async function checkSentinel(): Promise<boolean> {
  const url = `${FHIR_URL}/Basic?identifier=${SENTINEL_IDENTIFIER_SYSTEM}|${SENTINEL_IDENTIFIER_VALUE}`;
  try {
    const res = await request('GET', url, undefined, 5_000);
    if (res.status === 200) {
      const bundle = JSON.parse(res.body) as { total?: number };
      return (bundle.total ?? 0) > 0;
    }
  } catch {
    // treat as "not seeded"
  }
  return false;
}

// ---------------------------------------------------------------------------
// Phase B.5 — pre-load Practitioner stubs
//
// Synthea bundles reference Practitioners via conditional URLs
// (e.g. "Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|9999963694").
// HAPI v8 requires those resources to exist in the DB before the transaction
// can resolve the reference. We scan all bundles, collect unique NPIs, and
// PUT minimal Practitioner stubs before the main load.
// ---------------------------------------------------------------------------
const STUB_RESOURCE_TYPES = ['Practitioner', 'Location', 'Organization'] as const;
type StubResourceType = (typeof STUB_RESOURCE_TYPES)[number];

async function preloadSharedResources(files: string[]): Promise<void> {
  // Collect unique conditional references per resource type
  const refs = new Map<StubResourceType, Set<string>>();
  for (const rt of STUB_RESOURCE_TYPES) refs.set(rt, new Set());

  const condRefPattern = /(Practitioner|Location|Organization)\?identifier=([^"\\]+)\|([^"\\]+)/g;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(condRefPattern)) {
      const rt = match[1] as StubResourceType;
      refs.get(rt)?.add(`${match[2]}|${match[3]}`);
    }
  }

  const total = [...refs.values()].reduce((s, v) => s + v.size, 0);
  if (total === 0) return;

  console.log(`Pre-loading ${total.toString()} shared resource stubs (Practitioner/Location/Organization)...`);

  let count = 0;
  for (const [resourceType, identifiers] of refs) {
    for (const identRef of identifiers) {
      const [system, value] = identRef.split('|');
      const resource = {
        resourceType,
        identifier: [{ system, value }],
      };
      const res = await requestWithRetry(
        'PUT',
        `${FHIR_URL}/${resourceType}?identifier=${encodeURIComponent(system ?? '')}|${encodeURIComponent(value ?? '')}`,
        JSON.stringify(resource),
        15_000,
      );
      if (res.status >= 400) {
        console.warn(
          `  Warning: could not pre-load ${resourceType} identifier=${value ?? '?'} (HTTP ${res.status.toString()})`,
        );
      } else {
        count++;
      }
    }
  }

  console.log(`  Pre-loaded ${count.toString()} stubs.`);
  // Pause so HAPI JPA/Lucene can flush and index the stubs before transaction bundles begin
  console.log('  Waiting 30s for HAPI to settle after stub inserts...\n');
  await sleep(30_000);
}

// ---------------------------------------------------------------------------
// Phase C — load bundles
// ---------------------------------------------------------------------------
async function loadBundles(): Promise<number> {
  let files: string[];
  try {
    files = readdirSync(BUNDLES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(BUNDLES_DIR, f));
  } catch {
    console.error(
      `\nBundle directory not found: ${BUNDLES_DIR}\n` +
        'Run  pnpm run synthea:generate  first.',
    );
    process.exit(1);
  }

  if (files.length === 0) {
    console.error(
      `\nNo .json files found in ${BUNDLES_DIR}\n` +
        'Run  pnpm run synthea:generate  first.',
    );
    process.exit(1);
  }

  console.log(`Loading ${files.length.toString()} bundles from ${BUNDLES_DIR}`);
  console.log(`Posting to ${FHIR_URL} (sequential, ${MAX_RETRIES.toString()} retries on 5xx)\n`);

  const LARGE_BUNDLE_BYTES = 5_000_000; // 5 MB
  const LARGE_BUNDLE_COOLDOWN_MS = 45_000; // give HAPI time to GC after big transactions

  let loaded = 0;
  for (const file of files) {
    const fileSize = statSync(file).size;
    const isLarge = fileSize > LARGE_BUNDLE_BYTES;
    const body = readFileSync(file, 'utf8');
    // Large bundles get 5 min; normal bundles get 2 min
    const timeoutMs = isLarge ? 300_000 : 120_000;
    const res = await requestWithRetry('POST', `${FHIR_URL}/`, body, timeoutMs);

    if (res.status >= 400) {
      console.error(`\nFailed to load ${file} — HTTP ${res.status.toString()}`);
      console.error('Response:', res.body.slice(0, 500));
      console.error('\nLoad aborted. Fix the error and re-run (partially loaded data is safe to re-POST).');
      process.exit(1);
    }

    loaded++;
    if (loaded % PROGRESS_EVERY === 0 || loaded === files.length) {
      console.log(`  Loaded ${loaded.toString()} / ${files.length.toString()} bundles`);
    }

    if (isLarge) {
      const sizeMb = (fileSize / 1_048_576).toFixed(1);
      console.log(`  (Large bundle ${sizeMb}MB — waiting ${(LARGE_BUNDLE_COOLDOWN_MS / 1000).toString()}s for HAPI GC to settle...)`);
      await sleep(LARGE_BUNDLE_COOLDOWN_MS);
    }
  }

  return loaded;
}

// ---------------------------------------------------------------------------
// Phase D — write sentinel
// ---------------------------------------------------------------------------
async function writeSentinel(bundleCount: number): Promise<void> {
  const resource = {
    resourceType: 'Basic',
    id: SENTINEL_ID,
    identifier: [
      {
        system: SENTINEL_IDENTIFIER_SYSTEM,
        value: SENTINEL_IDENTIFIER_VALUE,
      },
    ],
    code: {
      coding: [{ system: 'urn:pramana', code: 'seed-marker' }],
    },
    extension: [
      {
        url: 'urn:pramana:seed-timestamp',
        valueDateTime: new Date().toISOString(),
      },
      {
        url: 'urn:pramana:seed-bundle-count',
        valueInteger: bundleCount,
      },
      {
        url: 'urn:pramana:synthea-seed',
        valueString: '20250523',
      },
    ],
  };

  const res = await requestWithRetry(
    'PUT',
    `${FHIR_URL}/Basic/${SENTINEL_ID}`,
    JSON.stringify(resource),
    10_000,
  );

  if (res.status >= 400) {
    console.warn(`Warning: could not write sentinel (HTTP ${res.status.toString()}) — data is loaded but re-run will reload.`);
  }
}

// ---------------------------------------------------------------------------
// Phase E — summary
// ---------------------------------------------------------------------------
async function printSummary(): Promise<void> {
  const types = ['Patient', 'Encounter', 'Observation', 'Condition', 'Procedure', 'MedicationRequest', 'DiagnosticReport'];
  console.log('\nResource counts in HAPI:');
  console.log('─────────────────────────────');

  for (const type of types) {
    try {
      const res = await request('GET', `${FHIR_URL}/${type}?_summary=count`, undefined, 10_000);
      const bundle = JSON.parse(res.body) as { total?: number };
      const count = bundle.total ?? '?';
      console.log(`  ${type.padEnd(20)} ${count.toString()}`);
    } catch {
      console.log(`  ${type.padEnd(20)} (error)`);
    }
  }

  console.log('─────────────────────────────\n');
}

// ---------------------------------------------------------------------------
// Exported helpers (used by unit tests)
// ---------------------------------------------------------------------------

/** Returns true if the FHIR Bundle JSON indicates the sentinel exists. */
export function parseSentinelBundle(json: string): boolean {
  try {
    const bundle = JSON.parse(json) as { total?: number };
    return (bundle.total ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Returns the sentinel Basic resource payload. */
export function buildSentinelResource(bundleCount: number, seed: string): object {
  return {
    resourceType: 'Basic',
    id: SENTINEL_ID,
    identifier: [{ system: SENTINEL_IDENTIFIER_SYSTEM, value: SENTINEL_IDENTIFIER_VALUE }],
    code: { coding: [{ system: 'urn:pramana', code: 'seed-marker' }] },
    extension: [
      { url: 'urn:pramana:seed-timestamp', valueDateTime: new Date().toISOString() },
      { url: 'urn:pramana:seed-bundle-count', valueInteger: bundleCount },
      { url: 'urn:pramana:synthea-seed', valueString: seed },
    ],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Pramana — HAPI FHIR bulk loader');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  FHIR server  : ${FHIR_URL}`);
  console.log(`  Bundles dir  : ${BUNDLES_DIR}`);
  console.log(`  Force reload : ${force ? 'yes' : 'no'}`);
  console.log('');

  // A
  await waitForHapi();

  // B
  const alreadySeeded = await checkSentinel();
  if (alreadySeeded && !force) {
    console.log('Already seeded — skipping load.');
    console.log('Use  pnpm run fhir:load -- --force  to reload.\n');
    await printSummary();
    process.exit(0);
  }

  if (alreadySeeded && force) {
    console.log('--force flag set — ignoring sentinel, reloading.\n');
  }

  // B.5 — pre-load Practitioner stubs (resolves HAPI v8 conditional reference validation)
  let bundleFiles: string[] = [];
  try {
    bundleFiles = readdirSync(BUNDLES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(BUNDLES_DIR, f));
  } catch { /* handled again in loadBundles */ }

  if (bundleFiles.length > 0) {
    await preloadSharedResources(bundleFiles);
  }

  // C
  const count = await loadBundles();
  console.log(`\nAll ${count.toString()} bundles loaded successfully.`);

  // D
  console.log('Writing sentinel to HAPI...');
  await writeSentinel(count);
  console.log('Sentinel written.\n');

  // E
  await printSummary();

  console.log('Seeding complete. Run:');
  console.log('  pnpm --filter @pramana/engine start:dev');
  console.log('  curl http://localhost:3000/v1/fhir/stats');
}

// Run only when executed directly, not when imported by tests (CJS: require.main === module)
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
