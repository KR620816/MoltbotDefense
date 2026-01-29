# 🛡️ Moltbot Guardian Plugin

4단계 보안 검증 파이프라인 + 수동 ON/OFF 토글

## 설치

```bash
cd G:\MyWrok\Moltbot\plugins\moltbot-plugin-guardian
npm install
npm run build
```

## Moltbot 설정

`moltbot.json`에 추가:

```json5
{
  plugins: {
    enabled: true,
    load: {
      paths: ["./plugins/moltbot-plugin-guardian"]
    },
    entries: {
      "guardian": {
        enabled: true,
        config: {
          enabled: true,
          guardianAi: {
            provider: "openai-compatible",
            baseUrl: "http://127.0.0.1:1234/v1",
            model: "local-model",
            apiKey: "lm-studio"
          },
          blockedTools: ["exec", "write", "browser", "send_email"]
        }
      }
    }
  }
}
```

## 사용법

### 슬래시 커맨드

| 명령어 | 설명 |
|--------|------|
| `/guardian on` | Guardian 활성화 |
| `/guardian off` | Guardian 비활성화 |
| `/guardian status` | 상태 조회 |

### HTTP API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/guardian/status` | 현재 상태 |
| POST | `/api/guardian/toggle` | ON/OFF 토글 |
| GET | `/api/guardian/stats` | 통계 조회 |
| POST | `/api/guardian/validate` | 수동 검증 테스트 |

## 파이프라인 구조

```
[입력] → [1.Regex] → [2.PatternDB] → [3.GuardianAI] → [4.JSON] → [통과/차단]
```

1. **Regex Filter**: 알려진 악성 패턴 즉시 차단
2. **Pattern DB**: SQLite 기반 유사도 검색
3. **Guardian AI**: LM Studio 로컬 LLM 검증
4. **JSON Parser**: AI 출력 엄격 검증 (fail-closed)

## 파일 구조

```
moltbot-plugin-guardian/
├── package.json
├── moltbot-plugin.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 진입점
│   ├── config.ts             # 설정 타입
│   ├── guardian-pipe.ts      # 메인 파이프라인
│   ├── stages/
│   │   ├── regex-filter.ts   # Stage 1
│   │   ├── pattern-matcher.ts # Stage 2 (SQLite)
│   │   ├── guardian-ai.ts    # Stage 3 (LM Studio)
│   │   └── json-parser.ts    # Stage 4
│   ├── hooks/
│   │   └── before-tool-call.ts
│   ├── commands/
│   │   └── guardian-cmd.ts
│   └── http-routes/
│       └── index.ts
└── README.md
```

## 요구사항

- LM Studio 실행 중 (`http://127.0.0.1:1234`)
- SQLite3 (better-sqlite3)
