export type ImportObject = Record<string, unknown>;
export function instantiate(
  getCoreModule: (filename: string) => Promise<WebAssembly.Module>,
  imports: ImportObject
): Promise<{ execute(request: string): void }>;
