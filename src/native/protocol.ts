import type { BatchRequest, RunOutput } from '../testing/sandbox-client';

export const nativeAssets = ['clang.wasm.gz', 'lld.wasm.gz', 'sysroot.tar.gz'] as const;
export type NativeAsset = typeof nativeAssets[number];
export type NativeAssets = Record<NativeAsset, ArrayBuffer>;
export type NativeLanguage = 'c' | 'cpp';
export interface NativeBatchRequest extends BatchRequest { language: NativeLanguage }
export interface NativeBatchMetrics { cached: boolean }

export interface CompileTask {
  action: 'compile';
  language: NativeLanguage;
  source: string;
  assets?: NativeAssets;
}

export interface ExecuteTask {
  action: 'execute';
  module: WebAssembly.Module;
  input: string;
}

export interface NativeTaskResult extends RunOutput { module?: WebAssembly.Module }
