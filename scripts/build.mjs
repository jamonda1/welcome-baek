import { readFile, rm } from 'node:fs/promises';
import { build } from 'vite';

await build();
// Compile each content script independently, so no shared ESM import is emitted
// for Chrome's classic-script loader or across the ISOLATED/MAIN world boundary.
for (const name of ['submit', 'submit-bridge']) {
  await build({
    configFile: false,
    publicDir: false,
    plugins: [{
      name: 'strict-classic-output',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk') chunk.code = `"use strict";\n${chunk.code}`;
        }
      }
    }],
    build: {
      outDir: 'dist', emptyOutDir: false, minify: 'oxc',
      lib: { entry: `src/content/${name}.ts`, formats: ['iife'], name: 'WelcomeBaek', fileName: () => `${name}.js` }
    }
  });
}

// The sandbox uses a blob Worker so the Java process has the sandbox's opaque origin.
const javaWorkerPath = 'dist/java-worker.js';
const javaBundle = (entry, filename, define) => build({
  configFile: false,
  publicDir: false,
  define,
  build: {
    outDir: 'dist', emptyOutDir: false, target: 'chrome111', minify: 'oxc',
    lib: { entry, formats: ['iife'], name: 'WelcomeBaekJava', fileName: () => filename }
  }
});
await javaBundle('src/java/worker.ts', 'java-worker.js');
await javaBundle('src/java/sandbox.ts', 'java-sandbox.js', {
  __WELCOME_BAEK_JAVA_WORKER__: JSON.stringify(await readFile(javaWorkerPath, 'utf8'))
});
await rm(javaWorkerPath);
