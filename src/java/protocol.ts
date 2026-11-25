import type { BatchEvent, BatchRequest, RunOutput } from '../testing/sandbox-client';

export interface JavaRequest {
  source: string;
  input: string;
}

export type JavaResult = RunOutput;
export type JavaWorkerMessage = { phase: 'running' } | JavaResult;
export type JavaBatchRequest = BatchRequest;
export type JavaBatchEvent = BatchEvent;
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
