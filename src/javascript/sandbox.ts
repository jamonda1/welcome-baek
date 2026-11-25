import type { BatchRequest } from '../testing/sandbox-client';
import { javascriptAssets, javascriptRunLimit, javascriptTimeout,
  type JavaScriptAssets, type JavaScriptTask, type JavaScriptTaskResult } from './protocol';

declare const __WELCOME_BAEK_JAVASCRIPT_WORKER__: string;
const prepareLimit = 20_000;
let runtime: Promise<{ wasm: WebAssembly.Module; bootstrap: Uint8Array }> | undefined;
let assets: JavaScriptAssets | undefined;
let compiled: { source: string; bytecode: Uint8Array } | undefined;
let busy = false;

function runTask(task: JavaScriptTask) {
  return new Promise<JavaScriptTaskResult>(resolve => {
    let url: string | undefined;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    const finish = (result: JavaScriptTaskResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve(result);
    };
    const fail = (error: string) => finish({ output: '', error });
    try {
      url = URL.createObjectURL(new Blob([__WELCOME_BAEK_JAVASCRIPT_WORKER__], { type: 'text/javascript' }));
      worker = new Worker(url);
      timer = setTimeout(() => fail('JavaScript 실행 환경 준비 시간이 초과되었습니다.'), prepareLimit);
      worker.onmessage = ({ data }: MessageEvent<JavaScriptTaskResult | { phase: 'running' }>) => {
        if ('phase' in data) {
          clearTimeout(timer);
          timer = setTimeout(() => fail(javascriptTimeout), javascriptRunLimit);
        } else finish(data);
      };
      worker.onerror = () => fail('JavaScript 실행 환경을 시작하지 못했습니다.');
      worker.postMessage(task);
    } catch {
      fail('JavaScript 실행 환경을 시작하지 못했습니다.');
    }
  });
}

window.addEventListener('message', async event => {
  if (event.source !== parent || event.data?.type !== 'welcome-baek-javascript-batch' || !event.ports[0]) return;
  const port = event.ports[0];
  const { request, assets: incoming } = event.data as { request: BatchRequest; assets?: JavaScriptAssets };
  if (busy || typeof request?.source !== 'string' || !Array.isArray(request.inputs) ||
      !request.inputs.length || request.inputs.length > 50 || request.inputs.some(input => typeof input !== 'string')) {
    port.close();
    return;
  }
  if (!assets && incoming && javascriptAssets.every(name => incoming[name] instanceof ArrayBuffer)) assets = incoming;
  if (!assets) {
    port.close();
    return;
  }

  busy = true;
  const { source, inputs } = request;
  const cached = compiled?.source === source;
  try {
    const runtimeAssets = assets;
    const { wasm, bootstrap } = await (runtime ??= WebAssembly.compile(runtimeAssets['quickjs.wasm'])
      .then(wasm => ({ wasm, bootstrap: new Uint8Array(runtimeAssets['node-compat.qbc']) }))
      .catch(error => { runtime = undefined; throw error; }));
    let bytecode = cached ? compiled?.bytecode : undefined;
    if (!bytecode) {
      const compilation = await runTask({ action: 'compile', source, wasm });
      if (!compilation.bytecode || compilation.error) {
        const result = { output: '', error: compilation.error ?? 'JavaScript 컴파일 결과가 없습니다.' };
        inputs.forEach((_input, index) => port.postMessage({ type: 'result', index, result }));
        return;
      }
      bytecode = compilation.bytecode;
      compiled = { source, bytecode };
    }
    for (const [index, input] of inputs.entries()) {
      port.postMessage({ type: 'start', index });
      const result = await runTask({ action: 'execute', input, bytecode, wasm, bootstrap });
      port.postMessage({ type: 'result', index, result });
    }
  } catch (error) {
    const result = { output: '', error: error instanceof Error ? error.message : 'JavaScript 실행 환경 준비에 실패했습니다.' };
    inputs.forEach((_input, index) => port.postMessage({ type: 'result', index, result }));
  } finally {
    port.postMessage({ type: 'done', metrics: { cached } });
    port.close();
    busy = false;
  }
});
