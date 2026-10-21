# 실제 Claude 측정 도구

팀 구성(직접 처리·Lite·Full)을 같은 과제로 실제 실행해 비용·시간·토큰·행동을 비교하는 도구
`npm test`와 달리 Claude를 호출하므로 사용 한도나 비용이 발생, CI와 `npm test`에 포함하지 않음
선택 도구이며 PR의 필수 요건이 아님, 전체 검사 방법은 [검사 방법](../../docs/verification/TESTING.md), 결과는 [측정 기록](../../docs/verification/2026-10-19-small-fixture.md) 참고

## 구성

| 파일 | 역할 |
| --- | --- |
| `run-eval.mjs` | fixture 복사, 팀 설치, `claude -p` 실행, 이벤트와 결과 저장 |
| `collect.mjs` | 출력 폴더에서 비용·시간·토큰·위임 호출을 JSON으로 수집 |
| `report.mjs` | 수집한 JSON으로 비교 그래프 SVG 생성 |
| `fixture/` | 대상 프로젝트(할 일 앱, 테스트 2건) |

`fixture/docs/NOTES.md`에는 문서 속 지시를 무시하는지 확인하려는 주입 문장이 의도적으로 있음, 에이전트는 이 문장을 지시로 따르지 않음

## 실행

요구 사항: Node 18 이상, `claude` CLI 로그인 상태

```sh
REPO=<저장소 경로> BUDGET=2 node tools/eval/run-eval.mjs <direct|lite|full> <q|l1|l2|l3|scope|inject|ctx> <출력 폴더>
node tools/eval/collect.mjs <그룹 이름> <출력 폴더> > docs/verification/data/results-<그룹 이름>.json
node tools/eval/report.mjs docs/verification/data docs/verification/assets/mode-compare.svg
```

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `BUDGET` | 2 | 호출당 비용 상한(달러), 도달하면 호출 중단 |
| `PERM` | acceptEdits | 권한 모드 |
| `EXEC_MODE` | relay | Full의 실행 모드(relay 또는 nested) |
| `CTX7` | 미설정 | `1`이면 Context7 등록 |
| `EXTRA_TOOLS` | 없음 | 추가로 허용할 도구, 쉼표로 구분 |

## 주의

- 호출당 상한은 있지만 호출 수가 많으면 합계가 커지므로 시작 전에 횟수와 예산 결정
- 과제당 1회 실행은 변동 범위를 알 수 없고 통계적 비교가 아님, 결과 공개 시 횟수·모델·한계 기재
- 임시 폴더에서 실행하며 저장소 파일은 수정하지 않음, 출력 폴더는 저장소 밖 권장
- 구독 로그인이면 표시 비용은 청구액이 아닌 환산 값, 사용 한도를 소모
