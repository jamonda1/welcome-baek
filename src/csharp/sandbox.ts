import type { BatchRequest } from '../testing/sandbox-client';
import { csharpAsset, type CSharpModules, type CSharpTask, type CSharpTaskResult } from './protocol';

declare const __WELCOME_BAEK_CSHARP_COMPILER__: string;
declare const __WELCOME_BAEK_CSHARP_WORKER__: string;
const prepareLimit = 25_000;
const compileLimit = 45_000;
const runLimit = 5_000;
let archive: ArrayBuffer | undefined;
let modules: CSharpModules | undefined;
let compiled: { source: string; assembly: Uint8Array } | undefined;
let busy = false;

function runTask(task: CSharpTask) {
  return new Promise<CSharpTaskResult>(resolve => {
    let url: string | undefined;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    const finish = (result: CSharpTaskResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(result);
    };
    const fail = (error: string) => finish({ output: '', error });
    try {
      const script = task.action === 'compile' ? __WELCOME_BAEK_CSHARP_COMPILER__ : __WELCOME_BAEK_CSHARP_WORKER__;
      url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
      worker = new Worker(url);
      timer = task.action === 'compile'
        ? setTimeout(() => fail('C# 컴파일 시간이 초과되었습니다.'), compileLimit)
        : setTimeout(() => fail('C# 실행 환경 준비 시간이 초과되었습니다.'), prepareLimit);
      worker.onmessage = ({ data }: MessageEvent<CSharpTaskResult | { phase: 'running' }>) => {
        if ('phase' in data) {
          clearTimeout(timer);
          timer = setTimeout(() => fail('C# 실행 시간 초과 (5초)'), runLimit);
        } else finish(data);
      };
      worker.onerror = () => fail('C# 실행 환경을 시작하지 못했습니다.');
      worker.postMessage(task);
    } catch {
      fail('C# 실행 환경을 시작하지 못했습니다.');
    }
  });
}

window.addEventListener('message', async event => {
  if (event.source !== parent || event.data?.type !== 'welcome-baek-csharp-batch' || !event.ports[0]) return;
  const port = event.ports[0];
  const { request, assets } = event.data as { request: BatchRequest; assets?: Record<typeof csharpAsset, ArrayBuffer> };
  if (busy || typeof request?.source !== 'string' || !Array.isArray(request.inputs) ||
      !request.inputs.length || request.inputs.length > 50 || request.inputs.some(input => typeof input !== 'string')) {
    port.close();
    return;
  }
  const incoming = assets?.[csharpAsset];
  if (!archive && incoming instanceof ArrayBuffer) archive = incoming;
  if (!archive) {
    port.close();
    return;
  }

  busy = true;
  const { source, inputs } = request;
  const cached = compiled?.source === source;
  const reportFailure = (error: string) => inputs.forEach((_input, index) =>
    port.postMessage({ type: 'result', index, result: { output: '', error } }));
  try {
    if (!modules) {
      const preparation = await runTask({ action: 'prepare', archive });
      if (!preparation.modules || preparation.error) {
        reportFailure(preparation.error ?? 'C# 실행 환경을 준비하지 못했습니다.');
        return;
      }
      modules = preparation.modules;
    }
    let assembly = cached ? compiled?.assembly : undefined;
    if (!assembly) {
      const compilation = await runTask({ action: 'compile', source, archive });
      if (!compilation.assembly || compilation.error) {
        reportFailure(compilation.error ?? 'C# 컴파일 결과가 없습니다.');
        return;
      }
      assembly = compilation.assembly;
      compiled = { source, assembly };
    }
    for (const [index, input] of inputs.entries()) {
      port.postMessage({ type: 'start', index });
      const result = await runTask({ action: 'execute', input, assembly, modules });
      port.postMessage({ type: 'result', index, result });
    }
  } finally {
    port.postMessage({ type: 'done', metrics: { cached } });
    port.close();
    busy = false;
  }
});
