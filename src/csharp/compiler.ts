import { unzipSync } from 'fflate';
import { dotnet } from '../../vendor/csharp-runtime/browser/dotnet.js';
import * as native from '../../vendor/csharp-runtime/browser/dotnet.native.js';
import * as runtime from '../../vendor/csharp-runtime/browser/dotnet.runtime.js';
import type { CSharpCompileTask, CSharpTaskResult } from './protocol';

const compilerDirectory = 'compiler/';
const compilerAssembly = 'CSharpCompiler.dll';
const maxAssemblySize = 8 * 1024 * 1024;

async function compileCSharp(source: string, archive: ArrayBuffer): Promise<CSharpTaskResult> {
  const files = unzipSync(new Uint8Array(archive), { filter: file => file.name.startsWith(compilerDirectory) });
  const assemblies = Object.keys(files).filter(name => name.endsWith('.dll')).map(path => ({
    name: path.slice(compilerDirectory.length), behavior: 'assembly', isCore: true,
  }));
  const host = await dotnet.withConfig({
    mainAssemblyName: compilerAssembly,
    globalizationMode: 'invariant',
    cacheBootResources: false,
    assets: [
      { name: 'dotnet.native.js', behavior: 'js-module-native', moduleExports: native },
      { name: 'dotnet.runtime.js', behavior: 'js-module-runtime', moduleExports: runtime },
      { name: 'dotnet.native.wasm', behavior: 'dotnetwasm' },
      ...assemblies,
    ],
  }).withResourceLoader((type, name) => {
    if (type === 'dotnetjs') return undefined;
    const bytes = files[compilerDirectory + name];
    if (!bytes) throw new Error('필요한 C# 컴파일러 파일이 없습니다. (' + name + ')');
    const contentType = name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    return Promise.resolve(new Response(new Uint8Array(bytes), { headers: { 'Content-Type': contentType } }));
  }).create();

  const { Compiler } = await host.getAssemblyExports(compilerAssembly);
  const assembly = Compiler.Compile(source);
  if (assembly.length > maxAssemblySize) return { output: '', error: 'C# 컴파일 결과 크기를 초과했습니다. (8 MiB)' };
  return { output: '', assembly };
}

self.addEventListener('message', async ({ data }: MessageEvent<CSharpCompileTask>) => {
  try {
    const result = await compileCSharp(data.source, data.archive);
    self.postMessage(result);
  } catch (error) {
    self.postMessage({ output: '', error: error instanceof Error ? error.message : String(error) });
  }
}, { once: true });
