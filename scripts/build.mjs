import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
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

// The sandbox uses a blob Worker so user code has the sandbox's opaque origin.
const javaWorkerPath = 'dist/java-worker.js';
const sandboxBundle = (entry, filename, define) => build({
  configFile: false,
  publicDir: false,
  define,
  build: {
    outDir: 'dist', emptyOutDir: false, target: 'chrome111', minify: 'oxc',
    lib: { entry, formats: ['iife'], name: 'WelcomeBaekSandbox', fileName: () => filename }
  }
});
await sandboxBundle('src/java/worker.ts', 'java-worker.js');
await sandboxBundle('src/java/sandbox.ts', 'java-sandbox.js', {
  __WELCOME_BAEK_JAVA_WORKER__: JSON.stringify(await readFile(javaWorkerPath, 'utf8'))
});
await rm(javaWorkerPath);

const pyodidePath = filename => new URL('../node_modules/pyodide/' + filename, import.meta.url);
const pythonWorkerPath = 'dist/python-worker.js';
await sandboxBundle('src/python/worker.ts', 'python-worker.js');
const pythonWorker = await Promise.all([
  readFile(pyodidePath('pyodide.asm.js'), 'utf8'),
  readFile(pyodidePath('pyodide.js'), 'utf8'),
  readFile(pythonWorkerPath, 'utf8')
]);
await sandboxBundle('src/python/sandbox.ts', 'python-sandbox.js', {
  __WELCOME_BAEK_PYTHON_WORKER__: JSON.stringify(pythonWorker.join('\n'))
});
await rm(pythonWorkerPath);
await mkdir('dist/python', { recursive: true });
for (const filename of ['pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  await copyFile(pyodidePath(filename), 'dist/python/' + filename);
}
