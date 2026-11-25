import { nativeAssets, type CompileTask, type ExecuteTask, type NativeAssets, type NativeBatchRequest,
  type NativeLanguage, type NativeTaskResult } from './protocol';

declare const __WELCOME_BAEK_NATIVE_COMPILER__: string;
declare const __WELCOME_BAEK_NATIVE_WORKER__: string;

const compileLimit = 45_000;
const prepareLimit = 20_000;
const runLimit = 5_000;
const compiled = new Map<NativeLanguage, { source: string; module: WebAssembly.Module }>();
let assets: NativeAssets | undefined;
let compiler: Worker | undefined;
let busy = false;

function createWorker(source: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return new Worker(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function runTask(task: CompileTask | ExecuteTask, label: string) {
  return new Promise<NativeTaskResult>(resolve => {
    const compiling = task.action === 'compile';
    const needsAssets = compiling && !compiler;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    const finish = (result: NativeTaskResult, discardWorker = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        if (!compiling || discardWorker) {
          worker.terminate();
          if (worker === compiler) compiler = undefined;
        }
      }
      resolve(result);
    };
    const fail = (error: string) => finish({ output: '', error }, true);
    try {
      worker = compiling ? compiler ??= createWorker(__WELCOME_BAEK_NATIVE_COMPILER__)
        : createWorker(__WELCOME_BAEK_NATIVE_WORKER__);
      timer = compiling
        ? setTimeout(() => fail(label + ' 컴파일 시간이 초과되었습니다.'), compileLimit)
        : setTimeout(() => fail(label + ' 실행 환경 준비 시간이 초과되었습니다.'), prepareLimit);
      worker.onmessage = ({ data }: MessageEvent<NativeTaskResult | { phase: 'running' }>) => {
        if ('phase' in data) {
          clearTimeout(timer);
          timer = setTimeout(() => fail(label + ' 실행 시간 초과 (5초)'), runLimit);
        } else finish(data);
      };
      worker.onerror = () => fail(label + ' 실행 환경을 시작하지 못했습니다.');
      worker.postMessage(needsAssets ? { ...task, assets } : task);
    } catch {
      fail(label + ' 실행 환경을 시작하지 못했습니다.');
    }
  });
}

window.addEventListener('message', async event => {
  if (event.source !== parent || event.data?.type !== 'welcome-baek-native-batch' || !event.ports[0]) return;
  const port = event.ports[0];
  const { request, assets: newAssets } = event.data as { request: NativeBatchRequest; assets?: NativeAssets };
  if (busy || (request?.language !== 'c' && request?.language !== 'cpp') ||
      typeof request.source !== 'string' || !Array.isArray(request.inputs) || !request.inputs.length ||
      request.inputs.length > 50 || request.inputs.some(input => typeof input !== 'string')) {
    port.close();
    return;
  }
  if (!assets && newAssets && nativeAssets.every(name => newAssets[name] instanceof ArrayBuffer)) assets = newAssets;
  if (!assets) {
    port.close();
    return;
  }

  busy = true;
  const { language, source, inputs } = request;
  const label = language === 'c' ? 'C' : 'C++';
  const previous = compiled.get(language);
  const cached = previous?.source === source;
  try {
    let module = cached ? previous.module : undefined;
    if (!module) {
      const compilation = await runTask({ action: 'compile', language, source }, label);
      if (!compilation.module || compilation.error) {
        const result = { output: '', error: compilation.error ?? label + ' 컴파일 결과가 없습니다.' };
        inputs.forEach((_input, index) => port.postMessage({ type: 'result', index, result }));
        return;
      }
      module = compilation.module;
      compiled.set(language, { source, module });
    }
    for (const [index, input] of inputs.entries()) {
      port.postMessage({ type: 'start', index });
      const result = await runTask({ action: 'execute', module, input }, label);
      port.postMessage({ type: 'result', index, result });
    }
  } finally {
    port.postMessage({ type: 'done', metrics: { cached } });
    port.close();
    busy = false;
  }
});
