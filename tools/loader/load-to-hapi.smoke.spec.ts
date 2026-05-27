/**
 * Smoke tests for load-to-hapi.ts.
 * Tests the pure helper functions (no network, no Docker, no real HAPI needed).
 */

import { parseSentinelBundle, buildSentinelResource } from './load-to-hapi';

describe('parseSentinelBundle', () => {
  it('returns true when total >= 1 (already seeded)', () => {
    expect(parseSentinelBundle(JSON.stringify({ resourceType: 'Bundle', total: 1 }))).toBe(true);
    expect(parseSentinelBundle(JSON.stringify({ resourceType: 'Bundle', total: 5 }))).toBe(true);
  });

  it('returns false when total is 0 (not seeded)', () => {
    expect(parseSentinelBundle(JSON.stringify({ resourceType: 'Bundle', total: 0 }))).toBe(false);
  });

  it('returns false when total is missing', () => {
    expect(parseSentinelBundle(JSON.stringify({ resourceType: 'Bundle' }))).toBe(false);
  });

  it('returns false on malformed JSON', () => {
    expect(parseSentinelBundle('not-json')).toBe(false);
  });
});

describe('buildSentinelResource', () => {
  it('returns a Basic resource with correct structure', () => {
    const resource = buildSentinelResource(250, '20250523') as Record<string, unknown>;

    expect(resource['resourceType']).toBe('Basic');
    expect(resource['id']).toBe('urn-pramana-seed-marker');

    const extensions = resource['extension'] as Array<Record<string, unknown>>;
    const seedExt = extensions.find((e) => e['url'] === 'urn:pramana:synthea-seed');
    expect(seedExt?.['valueString']).toBe('20250523');

    const countExt = extensions.find((e) => e['url'] === 'urn:pramana:seed-bundle-count');
    expect(countExt?.['valueInteger']).toBe(250);
  });
});
