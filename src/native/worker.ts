import { ConsoleStdout, File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import type { ExecuteTask, NativeTaskResult } from './protocol';

const outputLimit = 1024 * 1024;

async function execute({ module, input }: ExecuteTask): Promise<NativeTaskResult> {
  const stdin = new OpenFile(new File(new TextEncoder().encode(input), { readonly: true }));
  const stdoutDecoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();
  let stdout = '';
  let stderr = '';
  let remaining = outputLimit;
  let error: string | undefined;

  function append(bytes: Uint8Array, decoder: TextDecoder, write: (text: string) => void) {
    const accepted = bytes.subarray(0, remaining);
    remaining -= accepted.length;
    if (accepted.length) write(decoder.decode(accepted, { stream: true }));
    if (accepted.length !== bytes.length) throw new Error('C/C++ 출력 제한을 초과했습니다. (1 MiB)');
  }

  // Only stdin, stdout and stderr are available to the guest program.
  const wasi = new WASI(['Main'], [], [
    stdin,
    new ConsoleStdout(bytes => append(bytes, stdoutDecoder, text => { stdout += text; })),
    new ConsoleStdout(bytes => append(bytes, stderrDecoder, text => { stderr += text; })),
  ]);
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
  const { memory, _start } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof _start !== 'function') {
    return { output: '', error: '실행 가능한 C/C++ 프로그램을 생성하지 못했습니다.' };
  }

  self.postMessage({ phase: 'running' });
  try {
    const exitCode = wasi.start({ exports: { memory, _start: () => _start() } });
    if (exitCode !== 0) error = `C/C++ 프로그램이 종료 코드 ${exitCode}을 반환했습니다.`;
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
  }

  stdout += stdoutDecoder.decode();
  stderr += stderrDecoder.decode();
  return { output: stdout, ...(error ? { error: [stderr.trim(), error].filter(Boolean).join('\n') } : {}) };
}

self.addEventListener('message', async ({ data }: MessageEvent<ExecuteTask>) => {
  try {
    self.postMessage(await execute(data));
  } catch (error) {
    self.postMessage({ output: '', error: error instanceof Error ? error.message : String(error) });
  }
}, { once: true });
