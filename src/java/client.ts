import { javaAssets, type JavaAssets, type JavaRequest, type JavaResult } from './protocol';

const STARTUP_LIMIT = 20_000;
const RESPONSE_LIMIT = 55_000;

export function javaRunnerAvailable(): boolean {
  return typeof globalThis.chrome?.runtime?.getURL === 'function' && typeof MessageChannel === 'function';
}

export async function runJava(request: JavaRequest): Promise<JavaResult> {
  const controller = new AbortController();
  const downloadTimeout = setTimeout(() => controller.abort(), STARTUP_LIMIT);
  let assets: JavaAssets;
  try {
    const entries = await Promise.all(javaAssets.map(async name => {
      const response = await fetch(chrome.runtime.getURL(`java/${name}`), { signal: controller.signal });
      if (!response.ok) throw new Error('Java 실행 환경 파일을 불러오지 못했습니다.');
      return [name, await response.arrayBuffer()] as const;
    }));
    assets = Object.fromEntries(entries) as JavaAssets;
  } finally {
    clearTimeout(downloadTimeout);
    controller.abort();
  }

  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.sandbox.add('allow-scripts');
    const channel = new MessageChannel();
    let transferred = false;
    const finish = (result: JavaResult) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (!transferred) channel.port2.close();
      iframe.remove();
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ output: '', error: 'Java 실행 환경이 응답하지 않았습니다.' }), RESPONSE_LIMIT);
    channel.port1.onmessage = ({ data }) => {
      if (typeof data?.output === 'string' && (data.error === undefined || typeof data.error === 'string')) finish(data);
    };
    iframe.addEventListener('load', () => {
      try {
        iframe.contentWindow!.postMessage({ type: 'welcome-baek-java', request, assets }, '*',
          [channel.port2, ...javaAssets.map(name => assets[name])]);
        transferred = true;
      } catch {
        finish({ output: '', error: 'Java 실행 환경에 연결하지 못했습니다.' });
      }
    }, { once: true });
    iframe.src = chrome.runtime.getURL('java-sandbox.html');
    document.documentElement.append(iframe);
  });
}
