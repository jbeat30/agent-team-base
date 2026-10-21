# 어려운 과제 평가 도구

직접 처리·Lite·Full을 같은 과제·같은 격리 조건에서 실제 Claude로 실행하고 코드로 채점하는 도구
설계와 성공 기준은 [평가 설계](../../../docs/verification/EVAL_DESIGN.md), 실행 전에 고정한 문서이며 결과에 맞춰 바꾸지 않음
`npm test`와 CI에 포함하지 않음(Claude 호출, 사용 한도·비용 발생), 채점기 검증 `tools/eval-hard.test.mjs`는 `npm test`에 포함

| 파일 | 역할 |
| --- | --- |
| `fixture/` | 대상 프로젝트(소규모 쇼핑 앱), 숨은 호출처·다영역 모델·지시문 주입 문서 포함 |
| `tasks.mjs` | 과제 8종의 프롬프트·준비·허용 범위, 비대화형 안내 문구 |
| `score.mjs` | 코드로 세는 채점기(놓친 요구, 깨진 호출처, 범위 이탈, 허위 성공, 주입) |
| `run.mjs` | 격리 실행 1회, 결과 JSON·diff·이벤트 저장 |
| `aggregate.mjs` | 반복 결과 집계 |

## 실행

요구 사항: Node 18 이상, `claude` CLI 로그인

```sh
REPO=<저장소 경로> BUDGET=2 CLAUDE_BIN=<claude 실행 파일> node tools/eval/hard/run.mjs <direct|lite|full> <s1|s2|x1|m1|m2|m3|l1|l2> <반복 번호> <출력 폴더>
node tools/eval/hard/aggregate.mjs <출력 폴더> > results.json
```

- `CLAUDE_BIN`: 기본은 PATH의 `claude`, 여러 버전이 설치돼 있으면 최신 실행 파일을 지정, 실행한 버전은 결과 JSON에 기록
- `MODEL`(기본 sonnet), `PERM`(기본 acceptEdits)
- 격리: 사용자 플러그인·MCP·슬래시 명령·전역 설정을 끄고 프로젝트 설정만 사용, 끄지 않으면 호출당 약 14만 토큰이 더해짐
- 호출 수 × `BUDGET`이 최대 지출, 시작 전에 계산해 승인
- 출력 폴더는 저장소 밖 권장
