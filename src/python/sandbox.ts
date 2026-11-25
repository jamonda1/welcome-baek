import { pythonAssets, type PythonAssets, type PythonTask, type PythonTaskResult } from './protocol';
import type { BatchRequest } from '../testing/sandbox-client';

declare const __WELCOME_BAEK_PYTHON_WORKER__: string;
const prepareLimit = 20_000;
const runLimit = 5_000;
let compiled: { source: string; bytecode: Uint8Array } | undefined;
let busy = false;

function runTask(task: PythonTask, assets: PythonAssets) {
  return new Promise<PythonTaskResult>(resolve => {
    const url = URL.createObjectURL(new Blob([__WELCOME_BAEK_PYTHON_WORKER__], { type: 'text/javascript' }));
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    const finish = (result: PythonTaskResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker?.terminate();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const fail = (error: string) => finish({ output: '', error });
    try {
      worker = new Worker(url);
      timer = setTimeout(() => fail('Python 실행 환경 준비 시간이 초과되었습니다.'), prepareLimit);
      worker.onmessage = ({ data }: MessageEvent<PythonTaskResult | { phase: 'running' }>) => {
        if ('phase' in data) {
          clearTimeout(timer);
          timer = setTimeout(() => fail('Python 실행 시간 초과 (5초)'), runLimit);
        } else finish(data);
      };
      worker.onerror = () => fail('Python 실행 환경을 시작하지 못했습니다.');
      worker.postMessage({ task, assets });
    } catch {
      fail('Python 실행 환경을 시작하지 못했습니다.');
    }
  });
}

window.addEventListener('message', async event => {
  if (event.source !== parent || event.data?.type !== 'welcome-baek-python-batch' || !event.ports[0]) return;
  const port = event.ports[0];
  const { request, assets } = event.data as { request: BatchRequest; assets: PythonAssets };
  if (busy || typeof request?.source !== 'string' || !Array.isArray(request.inputs) ||
      !request.inputs.length || request.inputs.length > 50 || request.inputs.some(input => typeof input !== 'string') ||
      !pythonAssets.every(name => assets?.[name] instanceof ArrayBuffer)) {
    port.close();
    return;
  }

  busy = true;
  const cached = compiled?.source === request.source;
  try {
    let bytecode = cached ? compiled?.bytecode : undefined;
    if (!bytecode) {
      const compilation = await runTask({ action: 'compile', source: request.source }, assets);
      if (!compilation.bytecode || compilation.error) {
        const result = { output: '', error: compilation.error ?? 'Python 컴파일 결과가 없습니다.' };
        request.inputs.forEach((_input, index) => port.postMessage({ type: 'result', index, result }));
        return;
      }
      bytecode = compilation.bytecode;
      compiled = { source: request.source, bytecode };
    }
    for (const [index, input] of request.inputs.entries()) {
      port.postMessage({ type: 'start', index });
      const result = await runTask({ action: 'execute', input, bytecode }, assets);
      port.postMessage({ type: 'result', index, result });
    }
  } finally {
    port.postMessage({ type: 'done', metrics: { cached } });
    port.close();
    busy = false;
  }
});
