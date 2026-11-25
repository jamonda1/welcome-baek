import { createSandboxClient, sandboxRunnerAvailable } from '../testing/sandbox-client';
import { pythonAssets, type PythonAsset, type PythonBatchMetrics } from './protocol';

export const pythonRunnerAvailable = sandboxRunnerAvailable;
export const runPythonBatch = createSandboxClient<PythonAsset, PythonBatchMetrics>({
  label: 'Python',
  assetDirectory: 'python',
  assetsToLoad: pythonAssets,
  sandboxPage: 'python-sandbox.html',
  messageType: 'welcome-baek-python-batch',
  responseLimit: 30_000
});
