export function instantiate(
  getCoreModule: (filename: string) => Promise<WebAssembly.Module>,
  imports: Record<string, unknown>
): Promise<{ run: { run(): void } }>;
