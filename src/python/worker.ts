import type { loadPyodide as pyodideLoader } from 'pyodide';
import type { PythonAssets, PythonTask, PythonTaskResult } from './protocol';

declare const loadPyodide: typeof pyodideLoader;

const runtimeBase = 'https://welcome-baek.invalid/python/';
const bytecodeFile = '/tmp/welcome-baek.pyc';
const maxOutputBytes = 1024 * 1024;
const compileSource = [
  'import marshal',
  'with open("/tmp/welcome-baek.pyc", "wb") as bytecode_file:',
  '    marshal.dump(compile(__wb_source, "Main.py", "exec", dont_inherit=True), bytecode_file)',
].join('\n');

const executeBytecode = [
  'import marshal, sys, types',
  'with open("/tmp/welcome-baek.pyc", "rb") as bytecode_file:',
  '    code = marshal.load(bytecode_file)',
  'main = types.ModuleType("__main__")',
  'main.__file__ = "Main.py"',
  'sys.modules["__main__"] = main',
  'sys.argv = ["Main.py"]',
  'stdout, stderr = sys.stdout, sys.stderr',
  'try:',
  '    exec(code, main.__dict__)',
  'except SystemExit as error:',
  '    if error.code not in (0, None):',
  '        raise RuntimeError(f"SystemExit: {error.code}") from None',
  'finally:',
  '    for stream in (stdout, stderr):',
  '        if not stream.closed:',
  '            stream.flush()',
].join('\n');

function serveRuntimeFiles(assets: PythonAssets) {
  // The loader requests two files. Supply both from the extension bytes with network disabled by CSP.
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (url === runtimeBase + 'pyodide.asm.wasm') {
      return new Response(assets['pyodide.asm.wasm'], { headers: { 'Content-Type': 'application/wasm' } });
    }
    if (url === runtimeBase + 'python_stdlib.zip') return new Response(assets['python_stdlib.zip']);
    throw new Error('Python 실행 환경에서는 외부 파일을 불러올 수 없습니다.');
  };
}

async function run(task: PythonTask, assets: PythonAssets): Promise<PythonTaskResult> {
  serveRuntimeFiles(assets);
  const python = await loadPyodide({
    indexURL: runtimeBase,
    lockFileContents: new TextDecoder().decode(assets['pyodide-lock.json']),
    packageBaseUrl: runtimeBase,
    jsglobals: Object.create(null),
    env: { PYTHONHASHSEED: '0' },
    stdout: () => {},
    stderr: () => {},
  });

  if (task.action === 'compile') {
    python.globals.set('__wb_source', task.source);
    python.runPython(compileSource);
    return { output: '', bytecode: python.FS.readFile(bytecodeFile).slice() };
  }

  python.FS.writeFile(bytecodeFile, task.bytecode);
  const input = new TextEncoder().encode(task.input);
  let inputOffset = 0;
  python.setStdin({ read(buffer) {
    const bytes = input.subarray(inputOffset, inputOffset + buffer.length);
    buffer.set(bytes);
    inputOffset += bytes.length;
    return bytes.length;
  } });

  let bytesRemaining = maxOutputBytes;
  let exceededOutputLimit = false;
  const output = new TextDecoder();
  const diagnostics = new TextDecoder();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer = (decoder: TextDecoder, chunks: string[]) => (buffer: Uint8Array) => {
    const bytes = buffer.subarray(0, bytesRemaining);
    bytesRemaining -= bytes.length;
    if (bytes.length < buffer.length) exceededOutputLimit = true;
    if (bytes.length) chunks.push(decoder.decode(bytes, { stream: true }));
    return buffer.length;
  };
  python.setStdout({ write: writer(output, stdout) });
  python.setStderr({ write: writer(diagnostics, stderr) });
  self.postMessage({ phase: 'running' });

  let error: string | undefined;
  try {
    python.runPython(executeBytecode);
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
  }
  stdout.push(output.decode());
  stderr.push(diagnostics.decode());
  if (exceededOutputLimit) error = 'Python 출력 제한을 초과했습니다. (1 MiB)';
  return {
    output: stdout.join(''),
    ...(error ? { error: [stderr.join('').trim(), error].filter(Boolean).join('\n') } : {}),
  };
}

self.addEventListener('message', async (event: MessageEvent<{ task: PythonTask; assets: PythonAssets }>) => {
  try {
    self.postMessage(await run(event.data.task, event.data.assets));
  } catch (error) {
    self.postMessage({ output: '', error: error instanceof Error ? error.message : String(error) });
  }
}, { once: true });
