export interface JavaRequest {
  source: string;
  input: string;
}

export interface JavaResult {
  output: string;
  error?: string;
}

export type JavaWorkerMessage = { phase: 'running' } | JavaResult;
export interface JavaBatchRequest { source: string; inputs: string[] }
export type JavaBatchEvent = { type: 'start'; index: number } | { type: 'result'; index: number; result: JavaResult };
export interface JavaBatchMetrics {
  preparationMs: number; compileMs: number; caseMs: number[]; totalMs: number; cached: boolean;
}
export type JavaClasses = Record<string, number[]>;
export interface JavaPrepared { jdk: Record<string, Uint8Array>; modules: Record<JavaAsset, WebAssembly.Module> }
export type JavaTask = { action: 'compile'; source: string; assets?: JavaAssets; prepared?: JavaPrepared } |
  { action: 'execute'; input: string; classes: JavaClasses; prepared: JavaPrepared };
export interface JavaTaskResult { result: JavaResult; prepared?: JavaPrepared; classes?: JavaClasses;
  preparationMs: number; operationMs: number }

export const javaAssets = ['jdk-11.zip', 'runner.core.wasm', 'runner.core2.wasm', 'runner.core3.wasm'] as const;
export type JavaAsset = typeof javaAssets[number];
export type JavaAssets = Record<JavaAsset, ArrayBuffer>;
