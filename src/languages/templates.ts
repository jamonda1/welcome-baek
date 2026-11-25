import type { CodeLanguage } from './catalog';

export const templates: Record<CodeLanguage, string> = {
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Welcome, Baekjoon!");
    }
}`,

  c: `#include <stdio.h>

int main(void) {
    puts("Welcome, Baekjoon!");
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
        Console.WriteLine("Welcome, Baekjoon!");
    }
}`,

  python: `def main():
    print("Welcome, Baekjoon!")

if __name__ == "__main__":
    main()`,

  javascript: `console.log("Welcome, Baekjoon!");`
};
