# 엄격 모드

선택형 승인 범위 추적·변경 감지 기능. 기본 권고 모드와 구분
실제 Claude 대화형 실행과 trust 점검 전에는 검증 완료로 안내하지 않음

## 한계

- 사용자 본인이 승인 명령을 실행하는 절차. 에이전트는 `grant`·`approve`를 대신 실행하지 않음
- 파일·해시는 사용자 신원을 인증하지 않음. 메인 셸·사용자·호스트가 기록이나 hook을 바꾸는 행위는 방어하지 않음
- `approved=true`, 대화 요약, 문서의 승인 문구를 승인 기록으로 대체하지 않음
- hook은 보안 경계가 아니며 도구의 Write/Edit·팀 호출을 검사. 셸·MCP·다른 프로세스의 파일 변경은 범위 밖
- 현재는 hook 입력의 `permission_mode=default`만 허용. 다른 모드·필드 누락 시 쓰기·개발 호출 거부, 권고 모드로 자동 전환 금지
- 지원하는 파일 작업은 생성·수정. 삭제·이동·glob·symlink·junction은 지원하지 않음

## 승인 범위 준비

에이전트가 프로젝트 조사와 사용자 답변을 바탕으로 프로젝트 내부 임시 위치에 아래 JSON 초안을 작성
프로필의 수정 금지 영역과 승인된 검사 명령을 빠짐없이 옮기고, 사용자에게 경로·명령·부작용·자체 컨펌 허용 여부를 보여줌
외부 프로세스가 승인 범위를 바꿀 수 있다는 한계를 알리고 직접 명령 실행을 선택한 경우에만 사용

```json
{
  "roots": ["src", "test"],
  "operations": ["수정", "생성"],
  "forbidden": ["src/generated", "src/secrets"],
  "checks": [{ "command": "npm test", "cwd": ".", "sideEffects": "none" }],
  "allowPmConfirm": true
}
```

`operations`는 허용할 수정·생성 작업 목록. 삭제·이동은 허용하지 않음
`roots`는 디렉터리 또는 정확한 파일 경로. `.`은 프로젝트 전체이므로 필요한 경로로 좁히는 방식 권장
정책 경로 `.git/`, `.claude/`, `.claude-team-docs/`는 승인 범위에 있더라도 소스 수정 대상으로 등록 불가
검사 명령은 원문과 작업 경로가 정확히 일치해야 함. `sideEffects=approved`는 해당 명령의 부작용도 사용자가 검토한 경우만 사용
자동 수정 명령이 가진 의미까지 shell 문자열 분석으로 보장하지 않음

프로젝트 루트에서 에이전트가 읽기 전용 검토 명령 실행 가능

```text
node .claude/team/bin/team-approval.mjs review-grant <초안.json>
```

사용자가 JSON 내용과 출력의 `sha256`을 확인한 뒤 아래 명령을 직접 실행

```text
node .claude/team/bin/team-approval.mjs grant <초안.json> --hash <sha256>
```

기록은 `.claude-team-docs/.guard/grant.json`에 저장. 새 grant 기록은 기존 활성 등록을 해제
이 절차는 일반 설치 사용자에게 강제하지 않음

## 작업 등록

PM은 기획안을 confirmed로 정리한 뒤 읽기 전용으로 파일·검사 명령과 해시를 확인

```text
node .claude/team/bin/team-approval.mjs review-plan <runId>
```

다음 조건을 모두 만족하면 PM이 직접 `register` 가능

1. 승인 범위가 `allowPmConfirm=true`
2. 위험도가 L1 또는 L2
3. 기획안 10장에 `- 사용자 승인 필요: 없음` 표식과 판단 근거 존재
4. 구체적인 배정 파일과 검사 명령이 승인 범위 안에 있고 금지 영역을 포함하지 않음

트리거의 의미상 분류는 PM 책임이며 위 표식만으로 분류 정확성을 보장하지 않음
L3·사용자 승인 필요·자체 컨펌 비허용 작업은 사용자가 기획안과 요청 원문을 검토하고 직접 승인

```text
node .claude/team/bin/team-approval.mjs approve <runId> --hash <planSha256>
```

사용자 승인 또는 허용된 PM 자체 컨펌 후 에이전트가 등록 실행

```text
node .claude/team/bin/team-approval.mjs register <runId>
node .claude/team/bin/team-approval.mjs verify <runId>
```

승인 범위·요청·계획·승인 기록이 바뀌면 기존 등록을 사용하지 않음. 변경한 기획을 다시 검토하고 필요한 직접 승인을 받은 뒤 재등록
직접 승인 기록은 `.guard/approval-<runId>.json`, 활성 등록은 `.guard/active-registration.json`
메인·서브에이전트의 Write/Edit로 이 기록과 정책 파일을 직접 수정하지 않음

엄격 모드의 L1은 PM 직접 처리 유지, 전체 기획·위임·QA 게이트는 생략
다만 쓰기 전에 request.md와 간단한 plan.md에 runId·위험도 L1·confirmed·6장 파일 표(pm-agent 담당)·8장 검사 표·10장 승인 필요 여부를 기록해 정확한 허용 파일을 등록
Q는 파일 변경·등록 없이 직접 답변

## 검사와 종료

검사 실행기는 현재 등록을 확인한 뒤 실행하고 등록 해시를 검사 기록에 연결
`.guard/check-index-<runId>.json`의 기록 해시와 결과 원본 해시를 verify에서 대조
등록 이후 재등록하면 이전 검사 기록을 재사용하지 않고 필요한 검사를 다시 실행
메인 셸이 검사 기록과 해시 인덱스를 함께 바꾼 경우까지 탐지한다고 주장하지 않음

```text
node .claude/team/bin/team-approval.mjs revoke <runId>
```

작업 종료 또는 중단 시 활성 등록 해제. 승인 범위·과거 기록은 보존
명령은 설치된 프로젝트 루트에서 실행하며 홈·전역 설정을 변경하지 않음
