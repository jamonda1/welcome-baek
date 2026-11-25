interface CompilerHostBuilder {
  withConfig(config: {
    mainAssemblyName: string;
    globalizationMode: 'invariant';
    cacheBootResources: boolean;
    assets: Array<{ name: string; behavior: string; isCore?: boolean; moduleExports?: object }>;
  }): CompilerHostBuilder;
  withResourceLoader(loader: (type: string, name: string) => Promise<Response> | undefined): CompilerHostBuilder;
  create(): Promise<{
    getAssemblyExports(name: string): Promise<{ Compiler: { Compile(source: string): Uint8Array } }>;
  }>;
}

export const dotnet: CompilerHostBuilder;
