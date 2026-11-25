import { createSandboxClient, sandboxRunnerAvailable } from '../testing/sandbox-client';
import { javascriptAssets, type JavaScriptAsset, type JavaScriptMetrics } from './protocol';

export const javascriptRunnerAvailable = sandboxRunnerAvailable;
export const runJavaScript = createSandboxClient<JavaScriptAsset, JavaScriptMetrics>({
  label: 'JavaScript',
  assetDirectory: 'javascript',
  assetsToLoad: javascriptAssets,
  sandboxPage: 'javascript-sandbox.html',
  messageType: 'welcome-baek-javascript-batch',
  responseLimit: 30_000,
  keepAssetsInSandbox: true,
});
