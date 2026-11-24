# Java 11 브라우저 런타임

- Ristretto `f172cde58c08d7944f57633649b4af4338ce7764` ([소스](https://github.com/theseus-rs/ristretto/tree/f172cde58c08d7944f57633649b4af4338ce7764), MIT 또는 Apache-2.0). `compile-cache.patch`는 표준 입력 설정과 컴파일/실행 분리를 포함합니다. `compile`은 모든 클래스 바이트코드를 반환하고 `execute`는 제공된 바이트코드로 새 VM을 실행합니다.
- Amazon Corretto `11.0.32.12.1` Linux x64 ([소스](https://github.com/corretto/corretto-11/tree/11.0.32.12.1), GPLv2 with Classpath Exception 및 함께 제공된 고지). 브라우저는 이 배포본에서 Java 클래스와 설정을 읽습니다. 운영체제용 실행 파일을 포함하거나 실행하지 않습니다.
- `public/java/THIRD_PARTY_NOTICES.txt`에 런타임 및 도구체인 고지가 있고, `jdk-11.zip` 안에도 배포본의 `legal/` 파일이 있습니다.

일반 확장 프로그램 빌드에는 생성된 파일을 사용하므로 Node 외에 별도 도구가 필요하지 않습니다. 런타임을 갱신할 때만 아래 단계를 실행합니다.

1. 위 Ristretto 커밋을 체크아웃하고 `git apply <Welcome Baek 경로>/vendor/ristretto/compile-cache.patch`를 실행합니다. 이전 `stdin.patch`도 포함하므로 두 패치를 중복 적용하지 않습니다.
2. Rust 1.100.0의 `wasm32-wasip2` 타깃으로 `RUSTC_BOOTSTRAP=1 CARGO_TARGET_WASM32_WASIP2_RUSTFLAGS='-C link-arg=-zstack-size=8388608' cargo build --locked -p ristretto_playground --lib --target wasm32-wasip2 --release`를 실행합니다.
3. Ristretto의 `web/`에서 `npm ci`로 잠긴 도구를 설치합니다. 원본 `web/scripts/build-runtime.mjs`의 `transpileBytes` 옵션으로 `target/wasm32-wasip2/release/ristretto_playground_engine.wasm`을 변환합니다. `runner.js`의 `fetchCompile` 기본 로더를 제거하고, `getCoreModule` 누락 시 오류를 내도록 바꿉니다. Welcome Baek은 패키지 내부 자산을 전달해 이 로더에 의존하지 않습니다. `runner.js`는 이 폴더에, `runner.core*.wasm`은 `public/java/`에 둡니다.
4. 위 Corretto Linux x64 배포본의 `jmods`로 `jlink --add-modules java.base,java.compiler,jdk.compiler,jdk.zipfs --endian little --disable-plugin compress --strip-debug --no-header-files --no-man-pages`를 사용해 모듈 이미지를 만듭니다. `release`, `lib/modules`, `lib/tzdb.dat`, `conf/`, `legal/`을 `public/java/jdk-11.zip`에 넣습니다. 해당 Corretto Linux 압축 파일 SHA-256은 `826ab4fb0669a8afc25a927264017ba71a62b1f9e701a7b7e1ea6090866c0668`입니다.
5. 원본 Ristretto의 `web/scripts/licenses.mjs`로 고지를 다시 생성하고, Corretto 출처와 관련 고지를 함께 보관합니다.

현재 생성물은 Rust 1.100.0, `@bytecodealliance/jco-transpile` 0.12.1을 사용합니다. 변환 옵션은 `{ name: "runner", instantiation: "async", asyncMode: "sync", wasiShim: false, nodejsCompat: false, base64Cutoff: 0, emitTypescriptDeclarations: true }`입니다. 기본 로더 제거 후 SHA-256 기록은 `SHA256SUMS.txt`를 확인하세요. 일반 빌드는 이 도구를 설치하거나 Java 런타임을 재생성하지 않습니다.
