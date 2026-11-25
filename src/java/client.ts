import { createSandboxClient, sandboxRunnerAvailable } from '../testing/sandbox-client';
import { javaAssets, type JavaRequest, type JavaResult, type JavaAsset, type JavaBatchMetrics } from './protocol';

export const javaRunnerAvailable = sandboxRunnerAvailable;
export const runJavaBatch = createSandboxClient<JavaAsset, JavaBatchMetrics>({
  label: 'Java',
  assetDirectory: 'java',
  assetsToLoad: javaAssets,
  sandboxPage: 'java-sandbox.html',
  messageType: 'welcome-baek-java-batch',
  responseLimit: 55_000
});

export async function runJava(request: JavaRequest): Promise<JavaResult> {
  let result: JavaResult = { output: '', error: 'Java 실행 결과가 없습니다.' };
  await runJavaBatch({ source: request.source, inputs: [request.input] }, event => {
    if (event.type === 'result') result = event.result;
  });
  return result;
}
