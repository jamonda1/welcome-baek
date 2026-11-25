// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { javaAssets } from '../src/java/protocol';
import { nativeAssets } from '../src/native/protocol';
import { pythonAssets } from '../src/python/protocol';

describe('built unpacked extension (run npm run build first)', () => {
  it('ships MV3 storage permission and every manifest asset', () => {
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.content_scripts[0].matches).toContain('https://www.acmicpc.net/problem/*');
    expect(manifest.content_scripts.find((entry: { world?: string }) => entry.world === 'MAIN').js).toEqual(['submit-bridge.js']);
    for (const file of [manifest.action.default_popup, ...manifest.content_scripts.flatMap((entry: { js?: string[]; css?: string[] }) => [...(entry.js ?? []), ...(entry.css ?? [])])]) {
      expect(existsSync(`dist/${file}`)).toBe(true);
    }
  });
  it('includes the Java 11 assets in a network-disabled sandbox', () => {
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
    expect(manifest.sandbox.pages).toContain('java-sandbox.html');
    expect(manifest.content_security_policy.sandbox).toContain("connect-src 'none'");
    expect(manifest.content_security_policy.sandbox).not.toContain('allow-same-origin');
    expect(readFileSync('dist/java-sandbox.html', 'utf8')).toContain('src="java-sandbox.js"');
    expect(() => new Script(readFileSync('dist/java-sandbox.js', 'utf8'))).not.toThrow();
    for (const asset of javaAssets) {
      const header = readFileSync(`dist/java/${asset}`).subarray(0, 4);
      expect(header.toString('hex')).toBe(asset.endsWith('.wasm') ? '0061736d' : '504b0304');
    }
  });
  it('includes the Python runtime files in a network-disabled sandbox', () => {
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
    expect(manifest.sandbox.pages).toContain('python-sandbox.html');
    expect(readFileSync('dist/python-sandbox.html', 'utf8')).toContain("connect-src 'none'");
    expect(() => new Script(readFileSync('dist/python-sandbox.js', 'utf8'))).not.toThrow();
    const resources = manifest.web_accessible_resources.flatMap((entry: { resources: string[] }) => entry.resources);
    for (const asset of pythonAssets) {
      expect(resources).toContain('python/' + asset);
      expect(existsSync('dist/python/' + asset)).toBe(true);
    }
    expect(readFileSync('dist/python/pyodide.asm.wasm').subarray(0, 4).toString('hex')).toBe('0061736d');
  });
  it('packages C/C++ toolchain files separately from its sandbox script', () => {
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
    expect(manifest.sandbox.pages).toContain('native-sandbox.html');
    expect(manifest.web_accessible_resources).toContainEqual({
      resources: ['native-sandbox.html', 'native/*.gz'],
      matches: ['https://www.acmicpc.net/*', 'https://acmicpc.net/*'],
    });
    const html = readFileSync('dist/native-sandbox.html', 'utf8');
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain("'unsafe-eval'");
    const script = readFileSync('dist/native-sandbox.js', 'utf8');
    expect(() => new Script(script)).not.toThrow();
    expect(Buffer.byteLength(script)).toBeLessThan(1024 * 1024);
    for (const asset of nativeAssets) {
      expect(readFileSync('dist/native/' + asset).subarray(0, 2).toString('hex')).toBe('1f8b');
    }
  });
  it('bundles a classic content script with no top-level module dependencies', () => {
    const code = readFileSync('dist/problem.js', 'utf8');
    expect(() => new Script(code)).not.toThrow();
    expect(code).toContain('welcome-baek:v1:code:');
    for (const name of ['submit', 'submit-bridge']) {
      const script = readFileSync(`dist/${name}.js`, 'utf8');
      expect(() => new Script(script)).not.toThrow();
      expect(script.startsWith('"use strict";')).toBe(true);
    }
    expect(readFileSync('dist/submit-bridge.js', 'utf8')).not.toContain('chrome.storage');
  });
});
