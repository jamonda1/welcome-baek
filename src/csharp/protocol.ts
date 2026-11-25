import type { RunOutput } from '../testing/sandbox-client';

export const csharpAsset = 'runner.zip';
export interface CSharpBatchMetrics { cached: boolean }
export type CSharpModules = Record<string, WebAssembly.Module>;
export type CSharpCompileTask = { action: 'compile'; source: string; archive: ArrayBuffer };
export type CSharpExecutionTask =
  | { action: 'prepare'; archive: ArrayBuffer }
  | { action: 'execute'; input: string; assembly: Uint8Array; modules: CSharpModules };
export type CSharpTask = CSharpCompileTask | CSharpExecutionTask;
export interface CSharpTaskResult extends RunOutput {
  modules?: CSharpModules;
  assembly?: Uint8Array;
}
