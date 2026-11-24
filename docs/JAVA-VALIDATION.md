# Java 실행 개선 검증 기록

검증일: 2026-11-24. 브랜치: `feat/compile`. 사용자 Windows 로컬 저장소에서 수행했습니다.

| 검사 | 결과 |
| --- | --- |
| `npm run build` | 성공. dist 갱신 |
| `npm run typecheck` | 성공. 소스 및 테스트 타입 검사 |
| `npm test` | 15개 파일, 111개 테스트 통과 |
| `npm run test:java` | 실제 배포 WASM/JDK로 상태 격리, 내부 클래스, 입력, 시스템 속성, 무한 루프 제한 후 복구, 예외 후 복구, System.exit 후 복구, 컴파일 오류 검사 통과 |
| Rust 패치 재현 | 고정된 원본 소스에 적용 확인. 줄바꿈을 정규화하면 빌드에 사용한 소스와 일치 |
| `git diff --check` | 성공 |
| 브라우저 로컬 미리보기 | 실제 실행기로 3개 케이스 실행 및 재실행 완료. 컴파일 중 전체 대기/편집 잠금, 케이스 1 통과·케이스 2 실행 중·케이스 3 대기 중의 실시간 갱신, 최종 통과/실패/오류와 편집 잠금 해제를 관찰 |

브라우저 검증은 ChatGPT 내장 Chromium 브라우저의 로컬 미리보기에서 수행했습니다. 잘못된 예상 출력과 잘못된 정수 입력을 의도적으로 넣었으므로 최종 실패/오류 카드는 정상적인 검증 결과입니다. 설치된 Chrome 확장 프로그램과 실제 백준 페이지의 전체 흐름은 이번 변경 후 자동으로 검증하지 못했습니다. [수동 검증 절차](JAVA-PERFORMANCE.md#chrome-수동-확인)를 확인하세요.

빌드 시 기존 에디터 번들의 500kB 초과 안내가 남습니다. 빌드 실패는 발생하지 않았습니다. 실제 런타임 출력/상태 기록은 [java-runtime-verification.json](java-runtime-verification.json), 성능 기록은 [java-performance.json](java-performance.json)에 있습니다. 성능 측정과 기능 검증은 별도 실행이며, 당시 부하에 따라 소요 시간이 다릅니다.

주요 변경 파일: `src/java/{client,protocol,sandbox,worker}.ts`, `src/content/problem.ts`, `public/java/runner.core.wasm`, `vendor/ristretto/compile-cache.patch`. 자동 테스트와 재현 명령은 `tests/java-*.test.ts`, `scripts/{java-runtime-harness,verify-java-runtime,benchmark-java}.mjs`, `package.json`에 있습니다. 기존 저장, 언어/테마, 레이아웃과 제출 동작은 기존 자동 테스트로 함께 확인했습니다.

남은 성능 제약: 최초 Java 컴파일과 매 케이스의 새 JVM 초기화 비용. 동일 소스 20개 케이스 측정은 58.87초입니다. 실행 호환성과 제한 시간은 백준 서버와 다를 수 있습니다. 메모리 캐시는 페이지 새로고침이나 실행 환경 연결 오류 시 폐기합니다.
