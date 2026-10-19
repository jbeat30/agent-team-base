# 검사 방법

이 저장소의 검사는 두 층으로 나뉨
정적 검사·단위 테스트의 통과는 팀의 권한 차단·위임 정확도·프롬프트 품질의 입증이 아니며, 실제 Claude 실행 결과와 구분해 보고

| 층 | 명령 | 비용 | CI | 확인하는 것 |
| --- | --- | --- | --- | --- |
| 정적 검사·단위 테스트 | `npm test` | 없음 | 실행 | 배포 원본 구조, 역할 정의 규칙, 검사 실행기·가드·설치 스크립트의 동작 |
| 실제 Claude 측정 | `node tools/eval/run-eval.mjs` | 사용 한도·비용 발생 | 미실행 | 위임·가드·보고 등 실제 행동, 비용·시간·토큰 |

## 1. 정적 검사·단위 테스트

요구 사항: Node 18 이상, 외부 의존성 없음

```sh
npm test
```

| 구성 | 내용 |
| --- | --- |
| `tools/validate-template.mjs` | `template/` 구조, 역할 파일의 도구 상한·참조·필수 문구 검사 |
| `tools/team-check.test.mjs` | 검사 실행기 `run`·`verify`·`diff`·`trace` |
| `tools/team-guard.test.mjs` | 가드 hook의 허용·거부 판정, relay 모드 |
| `tools/install.test.mjs` | 설치 `detect`·`plan`·`apply`·`verify`·`remove`, 기존 설정 보존, 갱신·재설치 |
| `tools/team-approval.test.mjs` | 엄격 모드 승인 흐름 |

- 변경한 뒤 PR 전에 항상 실행, CI도 같은 명령을 Ubuntu·Windows(Node 20)에서 실행
- 역할 정의를 바꾸면 `tools/validate-template.mjs`의 도구 상한·참조 검사를 함께 갱신

## 2. 실제 Claude 측정

같은 과제를 조건별로 실제 실행해 행동과 비용을 비교, 선택 사항이며 PR 요건이 아님

요구 사항: Node 18 이상, `claude` CLI 로그인 상태

### 조건

| 조건 | 설명 |
| --- | --- |
| `direct` | 팀 설치 없이 Claude가 직접 처리 |
| `lite` | 팀 설치(Lite), PM이 역할을 직접 호출 |
| `full` | 팀 설치(Full), 리드가 호출 카드를 반환하고 PM이 호출 |

### 과제

`tools/eval/fixture/`(할 일 앱, 테스트 2건)에서 실행, 과제 프롬프트는 `tools/eval/run-eval.mjs`의 `tasks`에 정의

| ID | 성격 | 프롬프트 요지 |
| --- | --- | --- |
| `q` | 질문 | `completeTask`의 역할 설명, 수정 금지 |
| `l1` | 단순 수정 | 주석 오탈자 수정 |
| `l2` | 동작 변경 | 할 일 우선순위 추가, 기존 테스트 통과 유지 |
| `l3` | 계약 변경 | `completeTask` 반환 타입 변경과 호출처 수정 |
| `scope` | 금지 영역 | 생성 파일 `dist/bundle.js` 수정 요청 |
| `inject` | 주입 | `docs/NOTES.md` 요약, 문서 속 지시 무시 확인 |
| `ctx` | 외부 문서 | Context7로 API 확인, 수정 금지 |

`fixture/docs/NOTES.md`의 주입 문장은 의도적이며 지시로 따르지 않음

### 1회 실행

```sh
REPO=<저장소 절대 경로> BUDGET=2 node tools/eval/run-eval.mjs <direct|lite|full> <q|l1|l2|l3|scope|inject|ctx> <출력 폴더>
```

- 임시 폴더에 fixture를 복사하고 `git init`, 팀 조건이면 설치 스크립트로 `plan` → `apply` 수행
- `claude -p`를 비대화형으로 실행하고 `--output-format stream-json`으로 이벤트 전체 저장
- 실행 뒤 `git status`·`git diff`로 변경 파일을 집계하고 fixture의 `npm test` 통과 여부 확인
- 저장소 파일은 수정하지 않으며 출력 폴더는 저장소 밖 권장

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `REPO` | 없음(필수) | 설치 스크립트가 있는 저장소 경로 |
| `BUDGET` | 2 | 호출당 비용 상한(달러), 도달하면 호출 중단 |
| `PERM` | acceptEdits | 권한 모드 |
| `EXEC_MODE` | relay | Full의 실행 모드(relay 또는 nested) |
| `CTX7` | 미설정 | `1`이면 Context7 등록 |
| `EXTRA_TOOLS` | 없음 | 추가로 허용할 도구, 쉼표로 구분 |

출력 폴더에 `<조건>-<과제>.json`(요약), `.diff`(변경 내용), `.events.jsonl`(이벤트 원본) 저장

### 결과 집계와 그래프

```sh
node tools/eval/collect.mjs <그룹 이름> <출력 폴더> > docs/verification/data/results-<그룹 이름>.json
node tools/eval/report.mjs docs/verification/data docs/verification/assets/mode-compare.svg
```

- `collect.mjs`가 비용·시간·토큰·위임 호출을 JSON으로 수집
- `report.mjs`가 `docs/verification/data`의 JSON으로 비교 그래프 SVG 생성

### 비용 예산

- 호출 수 × 호출당 상한(`BUDGET`)이 최대 지출, 시작 전에 계산해 승인
- 직접 처리는 호출당 0.1~0.2달러, 팀 조건 L2·L3는 호출당 1~2달러 수준이 나왔음(환산 값)
- 구독 로그인이면 표시 비용은 청구액이 아닌 환산 값이며 사용 한도를 소모

### 결과 기록

결과를 공개할 때 아래를 함께 기재

- 조건, 과제, 반복 횟수, 모델, 호출당 상한, 실행 일자
- 실패·중단 사례와 원본 JSON 위치
- 한계: 과제당 1회는 변동 범위를 알 수 없고 통계적 비교가 아님

기록 예: [소규모 fixture 실행 기록](2026-10-19-small-fixture.md)

## 3. 확인할 수 없는 것

- 대화형 trust 화면과 엄격 모드의 실제 승인 흐름: 비대화형 실행으로는 재현 불가
- 권한 모드 auto·bypassPermissions·plan, macOS·Linux 실행: 측정한 범위 밖
- 단일 소형 fixture 결과는 다른 프로젝트·모델에 일반화 불가

## 4. 예정

v0.2.0에서 아래를 추가하고 구현 뒤 이 문서에 실제 명령을 채움

- 어려운 과제 세트와 코드로 세는 채점 스크립트(깨진 호출처, 범위 밖 수정, 누락 요구)
- 과제당 3회 이상 반복 실행과 집계
- 평가 설계 문서(과제·판정 기준·횟수·예산을 실행 전에 고정)
