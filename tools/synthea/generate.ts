/**
 * Synthea FHIR R4 patient generator.
 *
 * Runs Synthea inside an eclipse-temurin:17-jre Docker container.
 * The JAR is cached in .cache/synthea/ so the 60 MB download only
 * happens once. Output lands in tools/synthea/output/fhir/ (gitignored).
 *
 * Usage:
 *   pnpm run synthea:generate
 *
 * Config (change the constants below to adjust for future phases):
 *   POPULATION  250 living patients
 *   STATE       Massachusetts (Synthea's most validated module set)
 *   SEED        20250523 — fixed so same seed == same patients across runs
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const SYNTHEA_JAR_URL =
  'https://github.com/synthetichealth/synthea/releases/download/master-branch-latest/synthea-with-dependencies.jar';

const POPULATION = '250';
const STATE = 'Massachusetts';
const SEED = '20250523';

const ROOT = resolve(process.cwd());
const CACHE_DIR = join(ROOT, '.cache', 'synthea');
const OUTPUT_DIR = join(ROOT, 'tools', 'synthea', 'output');

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

const cachedJar = join(CACHE_DIR, 'synthea.jar');
const jarExists = existsSync(cachedJar);

console.log('═══════════════════════════════════════════════════════');
console.log(' Pramana — Synthea FHIR R4 patient generator');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Population : ${POPULATION} patients`);
console.log(`  State      : ${STATE}`);
console.log(`  Seed       : ${SEED}`);
console.log(`  Output     : ${OUTPUT_DIR}/fhir/`);
console.log(`  JAR cache  : ${jarExists ? 'hit (skipping download)' : 'miss (downloading ~60 MB)'}`);
console.log('');

if (!jarExists) {
  console.log('First run: downloading Synthea JAR into .cache/synthea/ ...');
  console.log('Subsequent runs skip this step.');
  console.log('');
}

console.log('Starting Docker container (eclipse-temurin:17-jre)...');
console.log('This takes ~10–15 minutes. Logs stream below:');
console.log('───────────────────────────────────────────────────────');

// Docker volume mounts: cache (ro after first run) + output (rw)
// Docker Desktop on Windows handles Windows path translation automatically.
const downloadCmd = jarExists
  ? ''
  : `curl -fsSL "${SYNTHEA_JAR_URL}" -o /cache/synthea.jar && echo "JAR downloaded." && `;

const syntheaCmd = [
  'java',
  '-jar /cache/synthea.jar',
  `-p ${POPULATION}`,
  `-s ${SEED}`,
  '-d /output',
  '--exporter.fhir.transaction_bundle=true',
  '--exporter.years_of_history=10',
  '--exporter.fhir.export=true',
  '--exporter.hospital.fhir.export=false',
  '--exporter.practitioner.fhir.export=false',
  STATE,
].join(' ');

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${CACHE_DIR}:/cache`,
    '-v',
    `${OUTPUT_DIR}:/output`,
    'eclipse-temurin:17-jre',
    'sh',
    '-c',
    `${downloadCmd}${syntheaCmd}`,
  ],
  { stdio: 'inherit', shell: false },
);

console.log('───────────────────────────────────────────────────────');

if (result.status !== 0) {
  console.error(`\nSynthea generation failed (exit ${result.status?.toString() ?? '?'}).`);
  console.error('Common causes:');
  console.error('  - Docker is not running');
  console.error('  - Network error during JAR download (delete .cache/synthea/ and retry)');
  process.exit(result.status ?? 1);
}

// Write a .gitkeep so the output dir stays in git even when empty
writeFileSync(join(OUTPUT_DIR, '.gitkeep'), '');

console.log(`\nDone! FHIR R4 bundles written to:`);
console.log(`  ${OUTPUT_DIR}/fhir/`);
console.log('');
console.log('Next step: pnpm run fhir:load');
