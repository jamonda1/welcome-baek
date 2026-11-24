import { javaAssets, type JavaAssets, type JavaBatchRequest, type JavaPrepared,
  type JavaClasses, type JavaTask, type JavaTaskResult, type JavaBatchMetrics } from './protocol';
declare const __WELCOME_BAEK_JAVA_WORKER__: string;
const COMPILE_LIMIT = 45_000;
const START_LIMIT = 20_000;
const RUN_LIMIT = 5_000;
let prepared: JavaPrepared | undefined;
let compiled: { source: string; classes: JavaClasses } | undefined;
let busy = false;
function task(request: JavaTask): Promise<JavaTaskResult> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(new Blob([__WELCOME_BAEK_JAVA_WORKER__], { type: 'text/javascript' }));
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout>;
    let finished = false;
    const finish = (value: JavaTaskResult) => {
      if (finished) return;
      finished = true; clearTimeout(timeout); worker?.terminate(); URL.revokeObjectURL(url); resolve(value);
    };
    const fail = (error: string) => finish({ result: { output: '', error }, preparationMs: 0, operationMs: 0 });
    try {
      worker = new Worker(url);
      timeout = setTimeout(() => fail(request.action === 'compile'
        ? 'Java 컴파일 시간이 초과되었습니다.' : 'Java 실행 환경 준비 시간이 초과되었습니다.'),
      request.action === 'compile' ? COMPILE_LIMIT : START_LIMIT);
      worker.onmessage = ({ data }) => {
        if (data.phase === 'running') {
          clearTimeout(timeout);
          timeout = setTimeout(() => fail('Java 실행 시간 초과 (5초)'), RUN_LIMIT);
        } else finish(data as JavaTaskResult);
      };
      worker.onerror = () => fail('Java 실행 환경을 시작하지 못했습니다.');
      worker.postMessage(request);
    } catch { fail('Java 실행 환경을 시작하지 못했습니다.'); }
  });
}
window.addEventListener('message', async event => {
  if (event.source !== parent || event.data?.type !== 'welcome-baek-java-batch' || !event.ports[0]) return;
  const port = event.ports[0];
  const { request, assets } = event.data as { request: JavaBatchRequest; assets: JavaAssets };
  if (busy || typeof request?.source !== 'string' || !Array.isArray(request.inputs) ||
    !request.inputs.length || request.inputs.length > 50 || request.inputs.some(input => typeof input !== 'string') ||
    !javaAssets.every(name => assets?.[name] instanceof ArrayBuffer)) { port.close(); return; }
  busy = true;
  const start = performance.now();
  const metrics: JavaBatchMetrics = { preparationMs: 0, compileMs: 0, caseMs: [], totalMs: 0,
    cached: compiled?.source === request.source };
  try {
    if (!metrics.cached) {
      const compilation = await task({ action: 'compile', source: request.source,
        ...(prepared ? { prepared } : { assets }) });
      prepared = compilation.prepared ?? prepared;
      metrics.preparationMs = compilation.preparationMs;
      metrics.compileMs = compilation.operationMs;
      if (compilation.result.error || !compilation.classes) {
        const result = { output: '', error: compilation.result.error ?? '컴파일 결과가 없습니다.' };
        request.inputs.forEach((_input, index) => port.postMessage({ type: 'result', index, result }));
        return;
      }
      compiled = { source: request.source, classes: compilation.classes };
    }
    for (const [index, input] of request.inputs.entries()) {
      port.postMessage({ type: 'start', index });
      const started = performance.now();
      const execution = await task({ action: 'execute', prepared: prepared!, classes: compiled!.classes, input });
      metrics.caseMs.push(performance.now() - started);
      port.postMessage({ type: 'result', index, result: execution.result });
    }
  } finally {
    metrics.totalMs = performance.now() - start;
    port.postMessage({ type: 'done', metrics });
    port.close(); busy = false;
  }
});
