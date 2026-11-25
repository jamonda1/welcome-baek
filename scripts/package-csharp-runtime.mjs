import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';

const [compiler, executor] = process.argv.slice(2);
if (!compiler || !executor) {
  throw new Error('Usage: node scripts/package-csharp-runtime.mjs <compiler-output> <jco-output>');
}

const vendor = new URL('../vendor/csharp-runtime/', import.meta.url);
const browser = new URL('browser/', vendor);
await mkdir(browser, { recursive: true });
const compilerFiles = (await readdir(compiler)).filter(name => name.endsWith('.dll') || name === 'dotnet.native.wasm');
const executorFiles = (await readdir(executor)).filter(name => /^runner\.core\d*\.wasm$/.test(name));
if (!compilerFiles.includes('CSharpCompiler.dll') || !compilerFiles.includes('dotnet.native.wasm') ||
    !executorFiles.includes('runner.core.wasm')) {
  throw new Error('The compiler or executor output is incomplete.');
}
const entries = await Promise.all([
  ...compilerFiles.map(async name => ['compiler/' + name, await readFile(join(compiler, name))]),
  ...executorFiles.map(async name => ['executor/' + name, await readFile(join(executor, name))]),
]);
await Promise.all([
  ...['dotnet.js', 'dotnet.native.js', 'dotnet.runtime.js'].map(name =>
    copyFile(join(compiler, name), new URL(name, browser))),
  copyFile(join(executor, 'runner.js'), new URL('runner.js', vendor)),
  writeFile(new URL('../public/csharp/runner.zip', import.meta.url), zipSync(Object.fromEntries(entries), { level: 6 })),
]);
