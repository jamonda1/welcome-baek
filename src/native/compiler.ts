import { Clang, LLD, setUpSysroot } from 'browsercc';
import type { CompileTask, NativeAssets, NativeTaskResult } from './protocol';

interface Tool {
  FS: {
    readFile(path: string): Uint8Array<ArrayBuffer>;
    writeFile(path: string, contents: string | Uint8Array<ArrayBuffer>): void;
  };
  callMain(args: string[]): number;
}

type Toolchain = { compiler: WebAssembly.Module; linker: WebAssembly.Module; sysroot: ArrayBuffer };

const mainObject = '/Main.o';
const mainWasm = '/Main.wasm';
const clangResource = '/lib/clang/20';
const wasiLibraries = '/lib/wasm32-wasi';
const maxDiagnostics = 64 * 1024;
let prepared: Promise<Toolchain> | undefined;
let pendingAssets: NativeAssets | undefined;

function decompress(bytes: ArrayBuffer, type?: string) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream, type ? { headers: { 'Content-Type': type } } : undefined);
}

async function prepare(assets: NativeAssets): Promise<Toolchain> {
  const [compiler, linker, sysroot] = await Promise.all([
    WebAssembly.compileStreaming(decompress(assets['clang.wasm.gz'], 'application/wasm')),
    WebAssembly.compileStreaming(decompress(assets['lld.wasm.gz'], 'application/wasm')),
    decompress(assets['sysroot.tar.gz']).arrayBuffer(),
  ]);
  return { compiler, linker, sysroot };
}

function toolOptions(module: WebAssembly.Module, thisProgram: string, printErr: (text: string) => void) {
  return {
    thisProgram,
    printErr,
    instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void) {
      const instance = new WebAssembly.Instance(module, imports);
      receive(instance, module);
      return instance.exports;
    },
  };
}

async function compile({ language, source, assets }: CompileTask): Promise<NativeTaskResult> {
  if (!prepared) {
    pendingAssets ??= assets;
    if (!pendingAssets) return { output: '', error: 'C/C++ 컴파일러 파일을 불러오지 못했습니다.' };
    prepared = prepare(pendingAssets).then(toolchain => {
      pendingAssets = undefined;
      return toolchain;
    }).catch(error => {
      prepared = undefined;
      throw error;
    });
  }
  const { compiler, linker, sysroot } = await prepared;
  let diagnostics = '';
  const printErr = (line: string) => {
    const remaining = maxDiagnostics - diagnostics.length;
    if (remaining > 0) diagnostics += (line + '\n').slice(0, remaining);
  };

  const cpp = language === 'cpp';
  const mainSource = cpp ? '/Main.cpp' : '/Main.c';
  const clang: Tool = await Clang(toolOptions(compiler, 'clang', printErr));
  setUpSysroot(clang, sysroot);
  clang.FS.writeFile(mainSource, source);

  // Run the frontend and linker separately. The WebAssembly compiler cannot spawn native subprocesses.
  const compileStatus = clang.callMain([
    '-cc1', '-triple', 'wasm32-unknown-wasi', '-emit-obj',
    '-resource-dir', clangResource, '-fvisibility=hidden',
    '-fgnuc-version=4.2.1', '-ferror-limit', '19',
    '-D', 'ONLINE_JUDGE', '-D', 'BOJ',
    ...(cpp ? ['-internal-isystem', '/include/wasm32-wasi/c++/v1', '-internal-isystem', '/include/c++/v1'] : []),
    '-internal-isystem', clangResource + '/include',
    '-internal-isystem', '/include/wasm32-wasi',
    '-internal-isystem', '/include',
    '-O2', cpp ? '-std=gnu++17' : '-std=gnu11',
    '-o', mainObject, mainSource,
  ]);
  if (compileStatus !== 0) return { output: '', error: diagnostics.trim() || 'C/C++ 컴파일에 실패했습니다.' };

  const object = clang.FS.readFile(mainObject);
  const lld: Tool = await LLD(toolOptions(linker, 'wasm-ld', printErr));
  setUpSysroot(lld, sysroot);
  lld.FS.writeFile(mainObject, object);
  const linkStatus = lld.callMain([
    '-m', 'wasm32', '-L' + wasiLibraries,
    wasiLibraries + '/crt1-command.o', mainObject,
    ...(cpp ? ['-lc++', '-lc++abi'] : []), '-lm', '-lc',
    clangResource + '/lib/wasm32-unknown-wasi/libclang_rt.builtins.a',
    '--strip-debug', '--max-memory=536870912', '-o', mainWasm,
  ]);
  if (linkStatus !== 0) return { output: '', error: diagnostics.trim() || 'C/C++ 링크에 실패했습니다.' };

  return { output: '', module: await WebAssembly.compile(lld.FS.readFile(mainWasm)) };
}

self.addEventListener('message', async ({ data }: MessageEvent<CompileTask>) => {
  try {
    self.postMessage(await compile(data));
  } catch (error) {
    self.postMessage({ output: '', error: error instanceof Error ? error.message : String(error) });
  }
});
