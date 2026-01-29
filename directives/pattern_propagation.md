# Pattern Propagation Directive

## Goal
새로운 패턴이 DB에 저장되면 자동으로 다른 사용자들에게 전파합니다.

## Inputs
- 새로 저장된 패턴
- API 엔드포인트 및 인증 정보

## Outputs
- 중앙 서버에 패턴 업로드
- 다른 노드에서 패턴 다운로드

## Execution Scripts
- `execution/sync_patterns.py` - Push/Pull 동기화

## Process

### Push (업로드)
1. 새 패턴 저장 이벤트 수신
2. 패턴 직렬화
3. 중앙 서버 API 호출
4. 성공/실패 로그

### Pull (다운로드)
1. 주기적 또는 시작 시 실행
2. 마지막 동기화 시간 확인
3. 서버에서 새 패턴 조회
4. 로컬 DB에 병합

## Edge Cases
- **네트워크 장애**: 오프라인 큐에 저장, 나중에 재시도
- **서버 오류**: 3회 재시도 후 스킵
- **패턴 충돌**: 타임스탬프 기준 최신 우선
- **악성 패턴**: 서버에서 검증 후 승인

## Configuration
```json
{
  "propagation": {
    "enabled": true,
    "mode": "api",
    "apiEndpoint": "https://patterns.moltbot.io/api/v1",
    "apiKey": "${PATTERN_API_KEY}",
    "push": {
      "enabled": true,
      "immediate": true
    },
    "pull": {
      "enabled": true,
      "intervalMinutes": 30,
      "onStartup": true
    }
  }
}
```
