import type { RunOutput } from '../testing/sandbox-client';

export const javascriptAssets = ['quickjs.wasm', 'node-compat.qbc'] as const;
export type JavaScriptAsset = typeof javascriptAssets[number];
export type JavaScriptAssets = Record<JavaScriptAsset, ArrayBuffer>;
export interface JavaScriptMetrics { cached: boolean }

export type JavaScriptTask =
  | { action: 'compile'; source: string; wasm: WebAssembly.Module }
  | { action: 'execute'; input: string; bytecode: Uint8Array; bootstrap: Uint8Array; wasm: WebAssembly.Module };
export interface JavaScriptTaskResult extends RunOutput { bytecode?: Uint8Array }
export const javascriptRunLimit = 5_000;
export const javascriptTimeout = 'JavaScript 실행 시간 초과 (5초)';
