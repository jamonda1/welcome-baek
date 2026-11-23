# Phase 5 — 백준 제출 화면 연동

작업일: 2026-11-23 (한국 시간). 대상: Windows `welcome-baeck`, `develop`의 `2d22f1c` 다음 변경.

## 확인한 실제 사이트 흐름

- 로그인한 실제 Chrome에서 `/problem/1000`의 ‘제출’ 링크가 `/submit/1000`을 가리키는 것을 확인했다.
- 로그아웃한 조사용 브라우저에서 `/login?next=%2Fsubmit%2F1000`으로 이동하는 것을 확인했다.
- 실제 제출 폼은 `form#submit_form`, `select#language[name=language]`, `textarea#source[name=source]`, `button#submit_button`이다.
- 백준의 코드 입력기는 CodeMirror **5.65.0**이고, 언어 메뉴는 Chosen 1.8.7이다. Welcome Baek의 CodeMirror 6과 구분해야 한다.
- 코드 공개 범위에 공개·비공개·맞았을 때만 공개가 있다. 이번 구현은 해당 선택을 변경하지 않는다.
- 당시 계정의 언어 목록에는 Java 11과 C#이 있었다. 사용자가 직접 지정한 언어 설정이라는 설명을 받았다.
- 사용자가 직접 실제 제출 후 이동 경로를 확인했다:
  `https://acmicpc.net/status?user_id=psj9340&problem_id=1000&from_mine=1`
  해당 ‘내 제출’ 화면의 결과에서 정답 여부를 확인한다. 사용자 ID는 구현에 하드코딩하지 않는다.

공식 참고: [백준 언어 정보](https://help.acmicpc.net/language/info),
[Chrome Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
[CodeMirror 5의 textarea 동기화 코드](https://github.com/codemirror/codemirror5/blob/master/src/edit/fromTextArea.js).

## 구현한 동작

1. 문제 페이지의 ‘제출 페이지로 이동’ 버튼을 누르면 그 순간의 문제·언어·코드를 캡처한다.
2. 클릭 이벤트 안에서 새 탭을 먼저 확보하고 현재 초안 저장 성공을 기다린다. 저장이 실패하거나 팝업이 차단되면 안내한다.
3. 임의 UUID마다 별도의 전달 데이터를 `chrome.storage.local`에 저장한 뒤 새 탭에서 `/submit/{문제번호}?welcome_baek_transfer={UUID}`를 연다.
   URL에 코드 내용은 넣지 않는다. 다른 문제·언어·동시 전달의 코드를 섞지 않는다.
4. 제출 화면의 ISOLATED 스크립트가 자기 전달 데이터만 읽고 MAIN 스크립트에 입력 요청을 보낸다.
   MAIN 스크립트는 Chrome Storage에 접근하지 않는다. 요청 문제 번호·허용 언어·메시지 출처를 확인한다.
5. 실제 CodeMirror 5 객체와 원본 textarea를 함께 갱신하고 값이 일치하는지 확인한다.
   언어 change 이벤트와 Chosen 표시 갱신도 수행한다. 입력기 준비는 최대 10초 기다리며 실패 시 재시도할 수 있다.
6. 제출 화면에 다른 코드가 이미 있으면 ‘기존 코드 대신 가져오기’를 눌러야 덮어쓴다.
   지정 언어가 계정 목록에 없으면 안내와 언어 설정 링크를 제공한다. 다른 언어를 임의 선택하거나 계정 설정을 변경하지 않는다.
7. 성공하면 URL의 전달 표시와 해당 임시 데이터를 제거한다. 새로고침으로 기존 전달 코드가 다시 덮이지 않는다.
   일반적인 제출 페이지 방문에는 자동 입력하지 않는다. 데이터는 30분 후 만료하며 다음 전달 때 오래된 전달 데이터만 정리한다.
8. 언어·코드·공개 범위를 확인한 사용자가 백준의 기존 최종 제출 버튼을 누른다.
   이후 이동 및 결과 표시는 백준의 정상 동작에 맡긴다. 확장 프로그램이 제출 요청이나 결과 페이지 이동을 대신 실행하지 않는다.

백준은 로그인으로 이동할 때 `next`의 제출 경로에서 URL 전달 표식을 제거한다.
그래도 제출용 탭의 세션 저장소에 남긴 표식으로 같은 문제의 제출 화면에서 입력을 재개한다. 로그인 화면에서는 코드 입력을 시도하지 않으며, 성공하면 탭의 표식과 임시 전달 기록을 지운다.

기본 연결: Java → Java 11(93), C++ → C++17(84), Python → Python 3(28).
이는 초기 고정 매핑이며 버전·PyPy 선택 UI는 후속 범위이다.

## 변경 파일

| 파일 | 역할 |
| --- | --- |
| `src/content/problem.ts`, `public/layout.css` | 제출 페이지 이동 버튼, 상태·오류 안내 |
| `src/submission/transfer.ts` | 클릭 시점 코드 보관, 만료·문제 검증, 새 탭 열기 |
| `src/content/submit.ts`, `public/submit.css` | 전달된 코드 읽기, 안내·교체 확인·재시도 UI |
| `src/content/submit-bridge.ts`, `src/submission/bridge.ts` | MAIN 환경에서 CodeMirror 5와 실제 제출 입력 동기화 |
| `src/submission/client.ts`, `protocol.ts` | 입력 요청·응답, 지연 로딩 및 중복 요청 처리 |
| `public/manifest.json` | 버전 0.2.0, Chrome 111 이상, 제출 URL의 MAIN/ISOLATED 스크립트 등록. 기존 storage 권한 유지 |
| `scripts/build.mjs`, `package.json` | 각 content script를 독립 일반 스크립트로 빌드. 압축 후 엄격 모드 보장 |
| `tests/transfer.test.ts`, `submit-bridge.test.ts`, `submit-bundle.test.ts`, `submission-fixture.ts` | 전달 데이터·입력·실패 처리·실제 dist 실행 검사 |
| `tests/build.test.ts`, `problem.test.ts` | 산출물과 버튼 클릭 시점의 코드 보존 검사 확장 |

각 스크립트를 따로 빌드하여 Chrome에서 직접 불러올 수 없는 공유 ESM import 파일이 생기지 않도록 했다.

## 자동 검사

- `npm run typecheck`: 소스와 테스트 코드 검사.
- `npm run build`: 문제·제출·MAIN 연결 스크립트 및 dist 생성.
- `npm test`: 기존 Phase 4 포함 **59개 통과**.
- 일반 스크립트 실행으로 `dist/submit.js`, `dist/submit-bridge.js`를 함께 검사했다.
  CodeMirror 5는 textarea 동기화 동작을 재현한 테스트 대역을 사용한다. 실제 Chrome의 두 실행 환경 격리·CSP·입력기는 실기 확인 대상이다.
- 로그: `phase5-typecheck.log`, `phase5-build.log`, `phase5-test.log`.

## Windows Chrome 확인 절차

1. 기존 에디터에서 ‘저장됨’을 확인한 뒤 `chrome://extensions`에서 Welcome Baek 새로고침을 누른다.
   버전 **0.2.0**이 보여야 한다. dist 등록 경로를 바꾸거나 확장 프로그램을 삭제할 필요는 없다.
2. 백준 1000번 문제를 새로고침한다. ‘제출 페이지로 이동’ 버튼과 기존 저장·테마·분할 기능을 확인한다.
3. Java로 작성한 코드를 확인한 뒤 버튼을 누른다. 새 탭의 1000번 제출 페이지에서 Java 11과 동일한 코드가 채워지고
   ‘코드를 가져왔습니다’ 안내가 나와야 한다. 공개 범위는 기존 백준 설정대로여야 한다.
4. 원래 문제 탭과 코드를 비교한다. 클릭 직후 수정하거나 다른 언어로 바꿔도 제출 탭에는 클릭 순간의 코드가 들어가야 한다.
5. 계정에 C++17/Python 3이 선택지로 있다면 각 언어도 검사한다. 없다면 변경 없이 안내가 표시되어야 한다.
6. 전달된 코드를 수정한 뒤 제출 화면을 새로고침한다. 확장 프로그램이 이전 코드를 다시 덮어쓰지 않아야 한다.
7. 기존 코드가 있는 제출 폼에서는 덮어쓰기 확인이 먼저 나오고, 명시적으로 교체를 선택한 후에만 변경되는지 확인한다.
8. 로그인이 만료된 상태에서는 로그인 후 같은 문제 제출 화면으로 돌아와 코드가 채워지는지 확인한다.
   로그인 전에 열렸던 제출용 탭을 그대로 사용하며, 로그인 후 URL에 전달 표식이 없어도 채워져야 한다.
9. 실제 채점까지 확인하려면 사용자가 언어·코드·공개 범위를 확인하고 최종 제출 버튼을 누른다.
   `/status?...user_id=...&problem_id=1000&from_mine=1` 화면의 결과를 확인한다. 쿼리 순서는 달라도 된다.

## 실기 확인 상태 및 제한

자동 조작 도구로 Chrome 확장 프로그램 관리 화면까지 확인했지만 버튼 조작이 실패했다.
관찰한 설치 버전은 **0.1.0**이므로 새 버전을 적용하거나 실제 코드 입력까지 검증했다고 주장하지 않는다.
실제 채점 제출은 하지 않았다. 제출 후 결과 URL은 사용자가 직접 확인해 제공한 정보이다.

새 Chromium 프로필에서 실제 로그인 리디렉션과 탭 표식 유지를 확인했고, 로그인 후 URL과 같은 조건의 제출 폼에서 자동 입력과 표식 제거를 검증했다. 실제 계정 로그인 후 백준 CodeMirror 5 입력 확인은 남아 있다.
소스 코드 공개 설정 변경, 원격 배포, 자동 최종 제출, 결과 자동 추적은 이번 구현 범위에 포함하지 않았다.
