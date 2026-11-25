using System.Globalization;
using System.Reflection;
using System.Runtime.Loader;

internal static class Program
{
    private const string BeginExecution = "WELCOME_BAEK_CSHARP_BEGIN";
    private const string SubmissionPath = "/submission.dll";

    private static int Main()
    {
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;
        try
        {
            return Execute();
        }
        catch (TargetInvocationException failure) when (failure.InnerException is Exception cause)
        {
            return ReportError(cause.ToString());
        }
        catch (Exception failure)
        {
            return ReportError(failure.ToString());
        }
    }

    private static int Execute()
    {
        using var stream = File.OpenRead(SubmissionPath);
        var assembly = AssemblyLoadContext.Default.LoadFromStream(stream);
        var entry = assembly.EntryPoint ?? throw new InvalidOperationException("C# entry point is missing.");
        object?[]? arguments = entry.GetParameters().Length == 0 ? null : [Array.Empty<string>()];

        Console.Error.WriteLine(BeginExecution);
        Console.Error.Flush();
        var result = entry.Invoke(null, arguments);
        if (result is Task<int> task) return task.GetAwaiter().GetResult();
        if (result is Task completion) completion.GetAwaiter().GetResult();
        return result is int status ? status : Environment.ExitCode;
    }

    private static int ReportError(string error)
    {
        Console.Error.WriteLine(error);
        return 1;
    }
}
