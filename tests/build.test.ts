// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('built unpacked extension (run npm run build first)', () => {
  it('ships MV3 storage permission and every manifest asset', () => {
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.content_scripts[0].matches).toContain('https://www.acmicpc.net/problem/*');
    for (const file of [manifest.action.default_popup, ...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css]) {
      expect(existsSync(`dist/${file}`)).toBe(true);
    }
  });
  it('bundles a classic content script with no top-level module dependencies', () => {
    const code = readFileSync('dist/problem.js', 'utf8');
    expect(() => new Script(code)).not.toThrow();
    expect(code).toContain('welcome-baek:v1:code:');
  });
});
