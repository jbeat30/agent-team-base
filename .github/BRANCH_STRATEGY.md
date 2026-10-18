# 브랜치 전략

## 기준

https://jbeat.tistory.com/51 의 작업 → feature → release → main 흐름 유지
develop에서 자유 개발·확인 후 버전별 기능을 옮겨 통합하고, main 반영 후 develop 초기화
브랜치 계보: main → release/vX.Y.Z → feature/vX.Y.Z → 작업 브랜치

## 역할

| 브랜치 | 역할 | 직접 push |
| --- | --- | --- |
| main | 공개 기준 | 최초 커밋 이후 금지 |
| develop | 자유 개발·실험·확인 | 소유자 허용 |
| release/vX.Y.Z | 공개 전 검증, 최신 main에서 생성 | 금지 |
| feature/vX.Y.Z | 버전별 기능 통합, 해당 release에서 생성 | 금지 |
| 작업 브랜치 | 검토할 기능·커밋 누적, feature에서 생성 | 허용 |
| hotfix/... | 긴급 패치 | 허용 |

## 진행

1. develop에서 작업·수정·실험·검증
2. 반영할 버전 release/vX.Y.Z를 최신 main에서 생성
3. 같은 버전 feature/vX.Y.Z를 release에서 생성
4. 작업 브랜치를 해당 feature에서 생성
5. develop의 관련 변경을 옮겨 커밋·검증, 필요 시 cherry-pick -x 사용
6. 작업 PR을 feature에 Squash로 통합
7. 같은 버전 feature → release → main을 Merge commit으로 반영
8. 미보존 작업·원격 상태 확인 후 develop을 최신 main으로 초기화

작업 브랜치 이름: 커밋 타입 접두사와 설명, 예: feat/role-definitions, fix/guard-path-check
기능별 이동 중 커밋 의존성과 누락 확인, 필요한 검사 재실행
소유자의 로컬 전용 문서(.git/info/exclude 대상)는 feature·release·main 커밋에 포함하지 않는 기준
develop 전체를 main·release에 직접 합치지 않는 기준

## PR 방향

| 경로 | 방식 |
| --- | --- |
| 작업 브랜치 → feature/vX.Y.Z | Squash |
| 같은 버전 feature → release | Merge commit |
| hotfix → 해당 패치 release | Merge commit |
| release → main | Merge commit |
| main → 진행 중인 release·feature | Merge commit |

## develop 초기화

main 반영 완료 후 실행, 지금 즉시 실행할 절차가 아님

- 원격 main과 대상 버전 반영 확인
- 미커밋·미추적·미반영 작업과 원격 develop의 동시 변경 확인
- 보존할 작업은 다른 브랜치로 옮기거나 폐기 의사 확인
- Squash로 SHA가 달라질 수 있으므로 파일 차이와 PR 반영도 확인
- develop이 추적 중인 로컬 전용 문서는 reset --hard로 작업 트리에서 삭제되므로 초기화 전에 추적 해제(git rm --cached) 커밋 또는 저장소 밖 백업 수행
- 공유 작업 중이면 초기화 중단

```sh
git fetch origin
git switch develop
git status --short
git diff --stat origin/main develop
# 작업 보존과 원격 변경 확인 후 초기화
git reset --hard origin/main
git push --force-with-lease origin develop
```

force-with-lease 실패 시 원격 변경 재확인, 무조건 --force로 재시도 금지
git clean으로 미추적·ignored 파일을 삭제하는 작업은 초기화에 포함하지 않는 기준

## 커밋·PR

- 형식: <type>: <한국어 명사형 설명>, scope는 사용하지 않음(필요한 경우만 <type>(<scope>) 허용)
- 타입: feat, fix, refactor, perf, style, docs, test, chore, ci, build, revert, release
- 관련 커밋을 쌓아 기능별 PR 구성, 커밋마다 PR 생성 금지
- 본문: 개요 / 변경 사항 / 검증 / 참고
- AI 생성 문구·공동 작성자 서명 금지
- 소유자 검토 후 머지, QA 통과와 머지·배포 승인 구분

## 보호

- main·release/v*: PR 필수, force push·삭제 금지
- feature/v*: PR 필수, force push 금지, 통합 완료 후 삭제 허용
- feature 삭제 전 PR 머지와 작업 보존 확인
- develop: 직접 push·main 기준 초기화를 위한 force-with-lease 허용, 브랜치 삭제 금지
- develop 강제 갱신 허용은 사용자 명시 승인 후 원격 반영 완료
- 필수 타인 승인 0명, 외부 쓰기 권한 부여 금지
- 기여는 이슈·포크 PR, 룰셋 원본은 .github/rulesets/
- PR 경로·제목·머지 방식 자동 검사는 후속 CI에서 구현
