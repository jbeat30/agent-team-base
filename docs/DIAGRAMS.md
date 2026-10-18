# README 이미지

단일 생성기: tools/images/render_readme.py
한영 공통 레이아웃, 요청한 문구·색상·역할 기준
PNG는 설계 크기의 2배 해상도, SVG는 같은 레이아웃의 수정 가능한 원본
그림 자체는 실행 검증·성능·보안 보장을 의미하지 않으며 근거·한계는 README 본문에서 관리

| 파일 접두사 | 설계 크기 | PNG 해상도 |
| --- | --- | --- |
| hero | 2400 × 500 | 4800 × 1000 |
| agent-team | 2000 × 1100 | 4000 × 2200 |
| task-workflow | 2000 × 900 | 4000 × 1800 |
| install-flow | 2000 × 700 | 4000 × 1400 |

hero는 claude-team-base 타이틀만 표시하는 장식용 배너, 한영 공통 디자인
개발 중 안내는 이미지 밖 README 최상단에 배치

파일: docs/assets/<접두사>.{ko,en}.{png,svg}
Lite의 실무 7종은 같은 호출 깊이, 카드 줄바꿈·세로 배치는 중간 계층이 아님
Full은 기획·개발 리더 하위 역할과 PM 직속 QA, plan 모드 QA 호출 상세는 역할 정의 참고
역할 파일 10종은 두 모드 모두 설치, 그림의 중복 역할 카드는 동일 역할의 모드별 표시

색: 배경 #F5F7FB, PM·글자 #1A2744, 조율·분석·검증 #3B6FD8, 수정 역할 #15996B, 선 #D5DBE6, 확인 지점 #E8A33D
글꼴: 한국어 Noto Sans KR, 영어 Inter, 영어 요청문 Consolas
Pillow·Windows Noto Sans KR·Consolas 필요, Inter는 로컬 글꼴 파일을 인자로 전달
Inter 원본: https://github.com/google/fonts/tree/main/ofl/inter
글꼴 파일은 저장소에 복사하지 않음

```sh
python tools/images/render_readme.py --font-en /path/to/Inter.ttf --out docs/assets
```

생성 후 한영 글자·연결선·QA 우회·사용자 확인·설치 순서를 시각 확인
변경 시 프롬프트 문구와 구현 역할 정의를 함께 대조
