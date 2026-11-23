export interface JavaRequest {
  source: string;
  input: string;
}

export interface JavaResult {
  output: string;
  error?: string;
}

export type JavaWorkerMessage = { phase: 'running' } | JavaResult;

export const javaAssets = ['jdk-11.zip', 'runner.core.wasm', 'runner.core2.wasm', 'runner.core3.wasm'] as const;
export type JavaAsset = typeof javaAssets[number];
export type JavaAssets = Record<JavaAsset, ArrayBuffer>;
