import { javaAssets, type JavaAssets, type JavaRequest, type JavaResult,
  type JavaBatchRequest, type JavaBatchEvent, type JavaBatchMetrics } from './protocol';

const STARTUP_LIMIT = 20_000;
const RESPONSE_LIMIT = 55_000;
let assetsPromise: Promise<JavaAssets> | undefined;
let framePromise: Promise<HTMLIFrameElement> | undefined;
let frame: HTMLIFrameElement | undefined;
let busy = false;
export function javaRunnerAvailable(): boolean {
  return typeof globalThis.chrome?.runtime?.getURL === 'function' && typeof MessageChannel === 'function';
}
function readAssets(): Promise<JavaAssets> {
  return assetsPromise ??= (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STARTUP_LIMIT);
    try {
      const entries = await Promise.all(javaAssets.map(async name => {
        const response = await fetch(chrome.runtime.getURL(`java/${name}`), { signal: controller.signal });
        if (!response.ok) throw new Error('Java 실행 환경 파일을 불러오지 못했습니다.');
        return [name, await response.arrayBuffer()] as const;
      }));
      return Object.fromEntries(entries) as JavaAssets;
    } catch (error) { assetsPromise = undefined; throw error; }
    finally { clearTimeout(timeout); controller.abort(); }
  })();
}
function invalidate() { frame?.remove(); frame = undefined; framePromise = undefined; }
function getFrame(): Promise<HTMLIFrameElement> {
  if (frame && !frame.isConnected) invalidate();
  return framePromise ??= new Promise((resolve, reject) => {
    const node = frame = document.createElement('iframe');
    node.hidden = true;
    node.sandbox.add('allow-scripts');
    const fail = () => { clearTimeout(timeout); if (frame === node) invalidate(); reject(new Error('Java 실행 환경 연결 실패')); };
    const timeout = setTimeout(fail, STARTUP_LIMIT);
    node.addEventListener('load', () => { clearTimeout(timeout); resolve(node); }, { once: true });
    node.addEventListener('error', fail, { once: true });
    node.src = chrome.runtime.getURL('java-sandbox.html');
    document.documentElement.append(node);
  });
}
/** Prepared assets/classes stay warm; every user's execution still receives its own VM. */
export async function runJavaBatch(request: JavaBatchRequest, onEvent: (event: JavaBatchEvent) => void): Promise<JavaBatchMetrics> {
  if (busy) throw new Error('이미 Java 코드를 실행 중입니다.');
  busy = true;
  try {
    const [assets, sandbox] = await Promise.all([readAssets(), getFrame()]);
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      let finished = false;
      let timeout: ReturnType<typeof setTimeout>;
      const seen = new Set<number>();
      const finish = (error?: Error, metrics?: JavaBatchMetrics) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        channel.port1.close(); channel.port2.close();
        if (error) { invalidate(); reject(error); } else resolve(metrics!);
      };
      const arm = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => finish(new Error('Java 실행 환경이 응답하지 않았습니다.')), RESPONSE_LIMIT);
      };
      channel.port1.onmessage = ({ data }) => {
        if (!data || finished) return;
        if (data.type === 'done') {
          if (seen.size !== request.inputs.length) return finish(new Error('일부 테스트 결과를 받지 못했습니다.'));
          return finish(undefined, data.metrics);
        }
        if (!Number.isInteger(data.index) || data.index < 0 || data.index >= request.inputs.length) return;
        if (data.type === 'result') {
          if (seen.has(data.index) || typeof data.result?.output !== 'string' ||
            (data.result.error !== undefined && typeof data.result.error !== 'string')) return;
          seen.add(data.index);
        } else if (data.type !== 'start') return;
        arm();
        try { onEvent(data as JavaBatchEvent); }
        catch { finish(new Error('실행 결과를 표시하지 못했습니다.')); }
      };
      arm();
      try {
        // Cached buffers must not be detached when sending them to the sandbox.
        sandbox.contentWindow!.postMessage({ type: 'welcome-baek-java-batch', request, assets }, '*', [channel.port2]);
      } catch { finish(new Error('Java 실행 환경에 연결하지 못했습니다.')); }
    });
  } catch (error) { invalidate(); throw error; }
  finally { busy = false; }
}
export async function runJava(request: JavaRequest): Promise<JavaResult> {
  let result: JavaResult = { output: '', error: 'Java 실행 결과가 없습니다.' };
  await runJavaBatch({ source: request.source, inputs: [request.input] }, event => {
    if (event.type === 'result') result = event.result;
  });
  return result;
}
