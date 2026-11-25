using System.Runtime.InteropServices.JavaScript;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

internal static partial class Compiler
{
    private static void Main() {}

    private const string ImplicitUsings = """
        global using System;
        global using System.Collections.Generic;
        global using System.IO;
        global using System.Linq;
        global using System.Net.Http;
        global using System.Threading;
        global using System.Threading.Tasks;
        """;

    [JSExport]
    internal static byte[] Compile(string source)
    {
        var parseOptions = new CSharpParseOptions(
            LanguageVersion.CSharp10, preprocessorSymbols: ["NET", "NET6_0", "NET6_0_OR_GREATER", "NETCOREAPP"]);
        var owner = typeof(Compiler).Assembly;
        var references = new List<MetadataReference>();
        foreach (var name in owner.GetManifestResourceNames())
        {
            if (!name.StartsWith("references/", StringComparison.Ordinal)) continue;
            using var stream = owner.GetManifestResourceStream(name)!;
            references.Add(MetadataReference.CreateFromStream(stream, filePath: name));
        }
        if (references.Count == 0) throw new InvalidOperationException("The .NET 6 reference assemblies are missing.");

        var compilation = CSharpCompilation.Create(
            "Main",
            [CSharpSyntaxTree.ParseText(source, parseOptions, path: "Main.cs"),
             CSharpSyntaxTree.ParseText(ImplicitUsings, parseOptions, path: "ImplicitUsings.cs")],
            references,
            new CSharpCompilationOptions(OutputKind.ConsoleApplication,
                optimizationLevel: OptimizationLevel.Release,
                concurrentBuild: false, nullableContextOptions: NullableContextOptions.Enable, deterministic: true));
        using var program = new MemoryStream();
        var result = compilation.Emit(program);
        if (!result.Success)
            throw new InvalidOperationException(string.Join("\n", result.Diagnostics
                .Where(item => item.Severity == DiagnosticSeverity.Error).Take(20)));
        return program.ToArray();
    }
}
