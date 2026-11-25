import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { CompileFlags, QuickJS } from 'quickjs-wasi';
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
const sandboxBundle = (entry, filename, define, plugins = []) => build({
  configFile: false,
  publicDir: false,
  define,
  plugins,
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

const nativeCompilerPath = 'dist/native-compiler.js';
const nativeWorkerPath = 'dist/native-worker.js';
await sandboxBundle('src/native/compiler.ts', 'native-compiler.js', undefined, [{
  name: 'browsercc-classic-worker',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/node_modules\/browsercc\/dist\/(?:index|clang|lld)\.js$/.test(id)) return;
    // The compiler receives the packaged WASM modules through instantiateWasm.
    // Avoid Vite inlining the unused package-relative asset URLs into the worker.
    return code.replaceAll('import.meta.url', 'self.location.href');
  }
}]);
await sandboxBundle('src/native/worker.ts', 'native-worker.js');
await sandboxBundle('src/native/sandbox.ts', 'native-sandbox.js', {
  __WELCOME_BAEK_NATIVE_COMPILER__: JSON.stringify(await readFile(nativeCompilerPath, 'utf8')),
  __WELCOME_BAEK_NATIVE_WORKER__: JSON.stringify(await readFile(nativeWorkerPath, 'utf8'))
});
await Promise.all([rm(nativeCompilerPath), rm(nativeWorkerPath)]);
await mkdir('dist/native', { recursive: true });
await Promise.all(['clang.wasm', 'lld.wasm', 'sysroot.tar'].map(filename => pipeline(
  createReadStream(new URL('../node_modules/browsercc/dist/' + filename, import.meta.url)),
  createGzip(),
  createWriteStream('dist/native/' + filename + '.gz')
)));

const javascriptWorkerPath = 'dist/javascript-worker.js';
const javascriptBootstrapPath = 'dist/javascript-node-compat.js';
const quickjsWasmPath = new URL('../node_modules/quickjs-wasi/quickjs.wasm', import.meta.url);
await sandboxBundle('src/javascript/guest.ts', 'javascript-node-compat.js');
await mkdir('dist/javascript', { recursive: true });
const quickjs = await QuickJS.create({ wasm: await readFile(quickjsWasmPath) });
try {
  const bootstrap = quickjs.compile(await readFile(javascriptBootstrapPath, 'utf8'), 'node-compat.js', undefined, CompileFlags.STRIP_SOURCE);
  await writeFile('dist/javascript/node-compat.qbc', bootstrap);
} finally {
  quickjs.dispose();
}
await copyFile(quickjsWasmPath, 'dist/javascript/quickjs.wasm');
await sandboxBundle('src/javascript/worker.ts', 'javascript-worker.js');
await sandboxBundle('src/javascript/sandbox.ts', 'javascript-sandbox.js', {
  __WELCOME_BAEK_JAVASCRIPT_WORKER__: JSON.stringify(await readFile(javascriptWorkerPath, 'utf8'))
});
await Promise.all([rm(javascriptBootstrapPath), rm(javascriptWorkerPath)]);

const csharpCompilerPath = 'dist/csharp-compiler.js';
const csharpWorkerPath = 'dist/csharp-worker.js';
await sandboxBundle('src/csharp/compiler.ts', 'csharp-compiler.js', undefined, [{
  name: 'dotnet-classic-worker',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/vendor\/csharp-runtime\/browser\/dotnet(?:\.native|\.runtime)?\.js$/.test(id)) return;
    // The worker supplies every boot asset from the extension. Give the SDK's
    // fallback URL resolution a valid base even when the Worker has a blob URL.
    return code.replaceAll('import.meta.url', JSON.stringify('https://welcome-baek.invalid/csharp/'));
  },
}]);
await sandboxBundle('src/csharp/worker.ts', 'csharp-worker.js', undefined, [{
  name: 'jco-classic-worker',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/vendor/csharp-runtime/runner.js')) return;
    // The Worker passes precompiled modules to JCO, so its URL loader is unused.
    return code.replace(/^"use components";\s*/, '').replaceAll('import.meta.url', 'self.location.href');
  },
}]);
await sandboxBundle('src/csharp/sandbox.ts', 'csharp-sandbox.js', {
  __WELCOME_BAEK_CSHARP_COMPILER__: JSON.stringify(await readFile(csharpCompilerPath, 'utf8')),
  __WELCOME_BAEK_CSHARP_WORKER__: JSON.stringify(await readFile(csharpWorkerPath, 'utf8'))
});
await Promise.all([rm(csharpCompilerPath), rm(csharpWorkerPath)]);
