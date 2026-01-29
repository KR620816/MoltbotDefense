# Auto Pattern Discovery Directive

## Goal
Guardian 모듈 시작 시 자동으로 새로운 공격 패턴을 발견하고 DB에 등록합니다.

## Inputs
- 기존 `attack-patterns.json` 패턴 목록
- AI API 접근 권한

## Outputs
- 새로 발견된 패턴 10개 (DB에 저장됨)
- 로그: 발견된 패턴 정보

## Execution Scripts
- `execution/discover_patterns.py` - AI에게 새 패턴 요청
- `execution/save_pattern.py` - 패턴 DB에 저장

## Process
1. 모듈 시작 시 `PatternDiscoveryService.start()` 호출
2. 10분 타임아웃 설정
3. 기존 패턴 로드
4. AI에게 새 패턴 요청 (반복)
5. 중복 체크
6. 유효성 검증
7. DB에 저장
8. 10개 완료 또는 타임아웃 시 종료

## Edge Cases
- **타임아웃**: 10분 경과 시 현재까지 발견된 패턴만 저장
- **AI 오류**: 3회 재시도 후 스킵
- **중복 패턴**: 무시하고 다음 요청
- **잘못된 형식**: 유효성 검증 실패 시 스킵

## Configuration
```json
{
  "autoDiscovery": {
    "enabled": true,
    "targetCount": 10,
    "timeoutMinutes": 10,
    "runOnStartup": true
  }
}
```
