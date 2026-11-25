import type { RunOutput } from '../testing/sandbox-client';

export const pythonAssets = ['pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'] as const;
export type PythonAsset = typeof pythonAssets[number];
export type PythonAssets = Record<PythonAsset, ArrayBuffer>;

export type PythonTask =
  | { action: 'compile'; source: string }
  | { action: 'execute'; input: string; bytecode: Uint8Array };
export interface PythonTaskResult extends RunOutput { bytecode?: Uint8Array }
export interface PythonBatchMetrics { cached: boolean }
