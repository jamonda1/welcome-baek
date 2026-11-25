import { cli, filesystem } from '@bytecodealliance/preview2-shim';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { unzipSync } from 'fflate';
import { instantiate } from '../../vendor/csharp-runtime/runner.js';
import type { CSharpExecutionTask, CSharpTaskResult } from './protocol';

const beginExecution = 'WELCOME_BAEK_CSHARP_BEGIN\n';
const executorDirectory = 'executor/';
const maxOutput = 1024 * 1024;
const maxDiagnostics = 64 * 1024;

async function run(task: CSharpExecutionTask): Promise<CSharpTaskResult> {
  if (task.action === 'prepare') {
    const files = Object.entries(unzipSync(new Uint8Array(task.archive), {
      filter: file => file.name.startsWith(executorDirectory),
    }));
    const modules = Object.fromEntries(await Promise.all(files.map(async ([filename, bytes]) =>
      [filename.slice(executorDirectory.length), await WebAssembly.compile(bytes)] as const)));
    return { output: '', modules };
  }

  const root = { dir: { 'submission.dll': { source: task.assembly } } };
  filesystem._setFileData(root);
  filesystem._setPreopens({ '/': root });
  cli._setCwd('/');
  cli._setEnv({});
  cli._setArgs(['WelcomeBaekCSharp']);

  const input = new TextEncoder().encode(task.input);
  let offset = 0;
  cli._setStdin({ blockingRead(length) {
    if (offset >= input.length) throw { tag: 'closed' };
    const end = Math.min(offset + Number(length), input.length);
    const chunk = input.slice(offset, end);
    offset = end;
    return chunk;
  } });

  const stdoutDecoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();
  let output = '';
  let diagnostics = '';
  let outputBytes = 0;
  let diagnosticBytes = 0;
  let started = false;
  let failure: string | undefined;

  cli._setStdout({ write(bytes) {
    const chunk = bytes.subarray(0, maxOutput - outputBytes);
    outputBytes += chunk.length;
    output += stdoutDecoder.decode(chunk, { stream: true });
    if (chunk.length < bytes.length) {
      failure = 'C# 출력 제한을 초과했습니다. (1 MiB)';
      throw new Error(failure);
    }
  } });
  cli._setStderr({ write(bytes) {
    const chunk = bytes.subarray(0, maxDiagnostics - diagnosticBytes);
    diagnosticBytes += chunk.length;
    diagnostics += stderrDecoder.decode(chunk, { stream: true });
    if (!started) {
      const marker = diagnostics.indexOf(beginExecution);
      if (marker !== -1) {
        diagnostics = diagnostics.slice(0, marker) + diagnostics.slice(marker + beginExecution.length);
        started = true;
        self.postMessage({ phase: 'running' });
      }
    }
  } });

  const shim = new WASIShim({ sandbox: { enableNetwork: false } });
  const denyNetwork = () => { throw 'access-denied'; };
  const imports = {
    ...shim.getImportObject(),
    'wasi:sockets/instance-network': { instanceNetwork: denyNetwork },
    'wasi:sockets/ip-name-lookup': { ResolveAddressStream: class {}, resolveAddresses: denyNetwork },
    'wasi:sockets/network': { Network: class {} },
    'wasi:sockets/tcp': { TcpSocket: class {} },
    'wasi:sockets/tcp-create-socket': { createTcpSocket: denyNetwork },
    'wasi:sockets/udp': { UdpSocket: class {}, IncomingDatagramStream: class {}, OutgoingDatagramStream: class {} },
    'wasi:sockets/udp-create-socket': { createUdpSocket: denyNetwork },
    'wasi:http/outgoing-handler': { handle() { throw { tag: 'destination-ip-prohibited' }; } },
  };
  const runner = await instantiate(async name => {
    const module = task.modules[name];
    if (!module) throw new Error('필요한 C# 실행 환경 파일이 없습니다. (' + name + ')');
    return module;
  }, imports);

  try {
    runner.run.run();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'exitError' in error && 'code' in error) {
      if (Number(error.code) !== 0) failure ??= 'C# 프로그램이 종료 코드 ' + error.code + '로 종료되었습니다.';
    } else {
      failure ??= error instanceof Error ? error.message : String(error);
    }
  }
  output += stdoutDecoder.decode();
  diagnostics += stderrDecoder.decode();
  if (failure || !started) {
    return { output, error: [diagnostics.trim(), failure].filter(Boolean).join('\n') || 'C# 실행 결과가 없습니다.' };
  }
  return { output };
}

self.addEventListener('message', async ({ data }: MessageEvent<CSharpExecutionTask>) => {
  try {
    self.postMessage(await run(data));
  } catch (error) {
    self.postMessage({ output: '', error: error instanceof Error ? error.message : String(error) });
  }
}, { once: true });
