import { createSandboxClient, sandboxRunnerAvailable } from '../testing/sandbox-client';
import { csharpAsset, type CSharpBatchMetrics } from './protocol';

export const csharpRunnerAvailable = sandboxRunnerAvailable;
export const runCSharp = createSandboxClient<typeof csharpAsset, CSharpBatchMetrics>({
  label: 'C#',
  assetDirectory: 'csharp',
  assetsToLoad: [csharpAsset],
  sandboxPage: 'csharp-sandbox.html',
  messageType: 'welcome-baek-csharp-batch',
  responseLimit: 80_000,
  keepAssetsInSandbox: true,
});
