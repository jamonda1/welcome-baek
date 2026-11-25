# Welcome Baek

**백준 문제를 보면서 같은 화면에서 코드를 작성하세요.**

Welcome Baek은 백준 온라인 저지의 복귀를 기념해 만든 비공식 Chrome 확장 프로그램입니다. 문제 설명과 예제를 보면서 풀이를 작성할 수 있도록 백준 문제 페이지에 코드 에디터를 추가합니다.

![백준 1000번 A+B 문제와 Java 코드 에디터가 한 화면에 나란히 배치된 모습](docs/store-screenshots/01-editor.png)

## 주요 기능

- **한 화면에서 문제 풀이** — 문제와 에디터를 나란히 보고, 두 영역의 너비와 위치를 바꿀 수 있습니다.
- **편집과 자동 저장** — Java, C, C++, C#, Python, JavaScript의 문법 강조를 지원합니다. 작성한 코드를 문제와 언어별로 브라우저에 저장해 다시 열면 이어서 편집할 수 있습니다.
- **테스트 케이스 실행** — 백준 예제를 사용하거나 입력과 예상 출력을 직접 작성할 수 있습니다. 등록된 모든 케이스를 순서대로 실행하며, 결과 패널에 대기 중·실행 중 상태와 완료된 케이스의 결과를 즉시 표시합니다. 케이스별 예상 출력과 실제 출력을 비교할 수 있습니다.
- **백준 제출 화면 연동** — **코드 제출**을 누르면 백준 공식 제출 화면에 작성한 코드와 언어가 채워집니다. 언어와 공개 범위를 확인한 뒤 직접 제출합니다.

> **실행 지원 범위** · Java 11, C11, C++17, C# 10, Python 3, JavaScript를 브라우저에서 실행할 수 있습니다. 별도 설치 없이 등록된 테스트 케이스 전체를 순차 실행합니다. 소스는 한 번 컴파일해 전체 케이스에서 재사용하며, 케이스마다 독립된 실행 환경을 사용합니다.

C/C++ 로컬 실행은 Clang과 WebAssembly/WASI를 사용합니다. `bits/stdc++.h` 호환 헤더를 포함하며, 32비트 환경이라 `long`과 포인터의 크기가 백준의 64비트 환경과 다를 수 있습니다. C++ 예외 처리와 GCC 전용 라이브러리인 PBDS는 지원 범위에 포함되지 않습니다.

JavaScript 로컬 실행은 QuickJS와 CommonJS를 사용합니다. 백준 풀이에서 쓰는 `fs.readFileSync(0)`, `fs.readFileSync("/dev/stdin", "utf8")`, `readline`, `process.stdin`, `process.stdout.write`, `console.log`, `Buffer`를 지원합니다. 로컬 실행의 Node.js 호환 범위는 표준 입출력 중심이며, 일반 파일이나 네트워크 접근이 필요한 코드는 별도 Node.js 환경에서 확인할 수 있습니다.

C# 로컬 실행은 Roslyn과 .NET WebAssembly를 사용합니다. 백준 제출 환경에 맞춰 C# 10 문법과 .NET 6 표준 라이브러리를 기준으로 컴파일하며, `Console.ReadLine()`과 `Console.OpenStandardInput()`을 통해 테스트 케이스 입력을 읽을 수 있습니다. 케이스별 실행 시간은 최대 5초입니다.

## 백준 1000번으로 살펴보기

| 테스트 케이스 편집 | Java 실행 결과 |
| --- | --- |
| ![테스트 케이스 패널에 입력 1 2와 예상 출력 3이 표시된 모습](docs/store-screenshots/02-test-cases.png) | ![예상 출력과 실제 출력이 모두 3이어서 케이스 1이 통과한 모습](docs/store-screenshots/04-passed.png) |

- [실행 실패 시 예상 출력과 실제 출력 비교](docs/store-screenshots/03-failed.png)
- [백준 제출 화면에 Java 11 코드 자동 입력](docs/store-screenshots/05-submit.png)

## 로컬 설치

1. 저장소를 내려받은 뒤, Node.js 24 LTS(24.15.0 이상) 환경에서 아래 명령을 실행합니다.

   ```bash
   npm ci
   npm run build
   ```

2. Chrome 주소창에서 `chrome://extensions`를 열고 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**를 누르고 빌드된 `dist` 폴더를 선택합니다.
4. [백준 1000번 A+B](https://acmicpc.net/problem/1000)를 열면 문제 옆에 에디터가 표시됩니다.

## 개발 및 지원

- [Java 실행 성능과 검증 방법](docs/JAVA-PERFORMANCE.md)
- [개발 로드맵과 기술 스택](docs/ROADMAP.md)
- [개인정보처리방침](blob/main/PRIVACY.md)
- [버그 제보 및 기능 제안](https://github.com/jamonda1/welcome-baek/issues)
