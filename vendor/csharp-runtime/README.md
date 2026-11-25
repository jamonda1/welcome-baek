# C# 런타임

Roslyn은 .NET 브라우저용 WebAssembly에서 C# 10 소스를 .NET 6 참조 어셈블리에 대해 컴파일합니다. 실행 Worker는 WASI용 .NET에서 컴파일한 어셈블리를 실행합니다. WASI 표준 입력은 `Console.ReadLine()`과 `Console.OpenStandardInput()`에 같은 테스트 케이스 입력을 제공합니다.

## 런타임 번들 다시 만들기

일반 확장 빌드는 저장소에 포함된 런타임을 사용합니다. 아래 단계는 런타임을 갱신할 때 실행합니다.

`global.json`에 지정된 .NET SDK, WASI SDK 25.0, Node.js를 사용합니다. `WASI_SDK_PATH`를 WASI SDK 설치 디렉터리로 설정한 뒤, 저장소 루트에서 실행합니다.

```sh
(cd vendor/csharp-runtime && dotnet workload install wasi-experimental)
(cd vendor/csharp-runtime/compiler && dotnet publish -c Release -p:MSBuildEnableWorkloadResolver=false -p:RestoreLockedMode=true)
(cd vendor/csharp-runtime/executor && dotnet publish -c Release -p:RestoreLockedMode=true)

npx --yes @bytecodealliance/jco@1.42.0 transpile \
  vendor/csharp-runtime/executor/bin/Release/net10.0/wasi-wasm/AppBundle/WelcomeBaekCSharp.wasm \
  --name runner --instantiation async --no-wasi-shim --no-nodejs-compat --no-typescript --minify -q \
  -o ./vendor/csharp-runtime/executor/obj/jco

npm ci
node scripts/package-csharp-runtime.mjs \
  vendor/csharp-runtime/compiler/bin/Release/net10.0 \
  vendor/csharp-runtime/executor/obj/jco
npm run build
npm test
```

스크립트는 브라우저용 .NET 로더와 JCO 실행 모듈을 이 디렉터리에 복사하고, 컴파일러와 실행기의 WebAssembly 및 관리 코드 파일을 `public/csharp/runner.zip`에 묶습니다. 버전을 갱신하면 같은 디렉터리의 서드파티 고지도 함께 갱신합니다.
