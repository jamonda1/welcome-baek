import type { CodeLanguage } from './catalog';

export const templates: Record<CodeLanguage, string> = {
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Welcome, Baekjoon!");
    }
}`,

  c: `#include <stdio.h>

int main(void) {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}`,

  cpp: `#include <iostream>
using namespace std;

int main() {
    cout << "Welcome, Baekjoon!" << '\\n';
    return 0;
}`,

  csharp: `using System;

public class Program
{
    public static void Main()
    {
        var tokens = Console.In.ReadToEnd().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length >= 2)
        {
            Console.WriteLine(int.Parse(tokens[0]) + int.Parse(tokens[1]));
        }
    }
}`,

  python: `def main():
    print("Welcome, Baekjoon!")

if __name__ == "__main__":
    main()`,

  javascript: `const fs = require('fs');
const tokens = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);

if (tokens.length >= 2) {
    const [a, b] = tokens.map(Number);
    console.log(a + b);
}`
};
