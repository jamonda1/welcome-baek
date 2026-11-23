import { javaAssets, type JavaAssets, type JavaRequest, type JavaWorkerMessage, type JavaResult } from './protocol';

declare const __WELCOME_BAEK_JAVA_WORKER__: string;
const COMPILE_LIMIT = 45_000;
const RUN_LIMIT = 5_000;

window.addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'welcome-baek-java' || !event.ports[0]) return;
  const port = event.ports[0];
  const { request, assets } = event.data as { request: JavaRequest; assets: JavaAssets };
  if (typeof request?.source !== 'string' || typeof request.input !== 'string' ||
    !javaAssets.every(name => assets?.[name] instanceof ArrayBuffer)) {
    port.postMessage({ output: '', error: '잘못된 Java 실행 요청입니다.' });
    port.close();
    return;
  }

  const url = URL.createObjectURL(new Blob([__WELCOME_BAEK_JAVA_WORKER__], { type: 'text/javascript' }));
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const finish = (result: JavaResult) => {
    clearTimeout(timeout);
    worker?.terminate();
    URL.revokeObjectURL(url);
    port.postMessage(result);
    port.close();
  };
  try {
    worker = new Worker(url);
    timeout = setTimeout(() => finish({ output: '', error: 'Java 컴파일 시간이 초과되었습니다.' }), COMPILE_LIMIT);
    worker.onmessage = ({ data }: MessageEvent<JavaWorkerMessage>) => {
      if ('phase' in data) {
        clearTimeout(timeout);
        timeout = setTimeout(() => finish({ output: '', error: 'Java 실행 시간 초과 (5초)' }), RUN_LIMIT);
      } else {
        finish(data);
      }
    };
    worker.onerror = () => finish({ output: '', error: 'Java 실행 환경을 시작하지 못했습니다.' });
    worker.postMessage({ request, assets }, javaAssets.map(name => assets[name]));
  } catch {
    finish({ output: '', error: 'Java 실행 환경을 시작하지 못했습니다.' });
  }
});
