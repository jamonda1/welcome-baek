import { createSandboxClient, sandboxRunnerAvailable, type BatchEvent, type BatchRequest } from '../testing/sandbox-client';
import { nativeAssets, type NativeAsset, type NativeBatchMetrics, type NativeBatchRequest } from './protocol';

export const nativeRunnerAvailable = sandboxRunnerAvailable;

const runNativeBatch = createSandboxClient<NativeAsset, NativeBatchMetrics, NativeBatchRequest>({
  label: 'C/C++',
  assetDirectory: 'native',
  assetsToLoad: nativeAssets,
  sandboxPage: 'native-sandbox.html',
  messageType: 'welcome-baek-native-batch',
  responseLimit: 55_000,
  keepAssetsInSandbox: true,
});

export const runC = (request: BatchRequest, onEvent: (event: BatchEvent) => void) =>
  runNativeBatch({ ...request, language: 'c' }, onEvent);

export const runCpp = (request: BatchRequest, onEvent: (event: BatchEvent) => void) =>
  runNativeBatch({ ...request, language: 'cpp' }, onEvent);
