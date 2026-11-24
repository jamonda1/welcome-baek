# Welcome Baek 배포

## GitHub에서 처음 한 번 설정

1. CI 워크플로를 포함한 PR의 GitHub Actions에서 **Build and test**가 성공하는지 확인한다.
2. 저장소의 **Settings → Rules → Rulesets**에서 `develop`과 `main`에 PR을 통한 변경과 **Build and test** 통과를 요구한다. 기존 `main` 규칙에는 **Release branch** 검사도 유지한다. 체크 출처는 GitHub Actions를 선택한다. [필수 상태 검사 설정](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)
3. 첫 배포 전에 **Settings → Environments**에서 `chrome-web-store` 환경을 만들고 배포 대상을 태그 `v*`로 제한한다.

PR에서 변경된 파일이 전부 마크다운(.md)이면 **Build and test**는 변경 파일만 확인하고 성공으로 끝난다. 다른 파일이 하나라도 포함되면 빌드와 테스트를 실행한다.

## Chrome 웹스토어에서 처음 한 번 설정

1. Google Cloud 프로젝트에서 Chrome Web Store API와 IAM Service Account Credentials API를 활성화한다. 배포용 서비스 계정을 만들고 이메일을 Chrome 웹스토어 개발자 대시보드의 계정 설정에 등록한다. [서비스 계정 등록](https://developer.chrome.com/docs/webstore/service-accounts)
2. [서비스 계정과 Workload Identity Federation 연결](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account) 절차로 GitHub용 OIDC 제공자를 만든다. 아래 속성을 매핑한다.

   - `google.subject=assertion.sub`
   - `attribute.repository_id=assertion.repository_id`
   - `attribute.event_name=assertion.event_name`
   - `attribute.workflow_ref=assertion.workflow_ref`

   제공자 조건에서 `REPOSITORY_ID`를 GitHub 저장소의 숫자 ID로, `OWNER/REPO`를 GitHub에 표시된 저장소 이름으로 바꾼다.

   ```cel
   assertion.repository_id == 'REPOSITORY_ID' &&
   assertion.event_name == 'release' &&
   assertion.sub.endsWith(':environment:chrome-web-store') &&
   assertion.workflow_ref.startsWith('OWNER/REPO/.github/workflows/release.yml@refs/tags/v')
   ```

   서비스 계정의 `roles/iam.workloadIdentityUser` 권한은 `principalSet://iam.googleapis.com/POOL_RESOURCE_NAME/attribute.repository_id/REPOSITORY_ID`에 부여한다. `POOL_RESOURCE_NAME`은 `projects/…/locations/global/workloadIdentityPools/…` 형식이다.
3. GitHub의 `chrome-web-store` 환경에 아래 변수를 등록한다. Actions 실행 시 단기 액세스 토큰을 발급받는다.

| 환경 변수 | 값 |
| --- | --- |
| `GOOGLE_WORKLOAD_IDENTITY_PROVIDER` | `projects/…/locations/global/workloadIdentityPools/…/providers/…` 형식의 OIDC 제공자 이름 |
| `GOOGLE_SERVICE_ACCOUNT` | Chrome 웹스토어에 등록한 서비스 계정 이메일 |
| `CWS_PUBLISHER_ID` | 개발자 대시보드 게시자 설정의 게시자 ID |
| `CWS_ITEM_ID` | Welcome Baek의 웹스토어 항목 ID |

## 새 버전 배포

1. 배포용 PR에 `public/manifest.json`의 새 버전을 반영하고 `release/*` 브랜치에서 `main`으로 PR을 머지한다.
2. 배포할 `main` 커밋에 매니페스트와 일치하는 태그(예시 `v1.1.0`)를 지정하고 GitHub에서 정식 Release를 공개한다.
3. Actions에서 **Chrome Web Store Release** 실행을 확인한다. 태그의 코드로 빌드 및 테스트를 수행한다. `dist`의 내용은 검증 후 ZIP으로 생성되며, Actions 실행 화면의 **Artifacts**에서 받을 수 있다.
4. **Submit to Chrome Web Store**가 성공하면 Chrome 웹스토어 개발자 대시보드에서 심사 상태를 확인한다. 새 버전은 Google의 심사 승인 후 공개된다. [Chrome 웹스토어 API](https://developer.chrome.com/docs/webstore/using-api)
