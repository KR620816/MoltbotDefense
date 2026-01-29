# Attack Trigger Directive

## Goal
공격이 감지되면 이벤트를 발생시키고, 새로운 공격 패턴을 자동으로 DB에 저장합니다.

## Inputs
- 차단된 요청 정보 (pattern, source, severity)
- 기존 패턴 DB

## Outputs
- 새로운 공격 패턴 (DB에 저장됨)
- 이벤트 로그

## Execution Scripts
- `execution/save_pattern.py` - 패턴 DB에 저장

## Trigger Conditions
| 조건 | 설명 | 우선순위 |
|------|------|----------|
| `AI_BLOCK` | AI가 위험으로 판단해 차단 | 높음 |
| `HIGH_ANOMALY` | anomaly_score > 0.8 | 높음 |
| `UNKNOWN_PATTERN` | 알려지지 않은 패턴 | 중간 |
| `REPEATED_ATTACK` | 같은 IP에서 3회 이상 | 중간 |

## Process
1. 요청 차단 시 `AttackTriggerService.onAttackDetected()` 호출
2. 트리거 조건 확인
3. 조건 충족 시 → 패턴 추출
4. 패턴 정규화
5. 중복 체크
6. AI로 카테고리 분류
7. DB에 저장
8. 전파 서비스로 전송

## Edge Cases
- **Regex 차단**: 이미 DB에 있으므로 무시
- **중복 패턴**: 저장하지 않음
- **민감정보 포함**: 패턴만 추출, 원본 요청 미저장

## Configuration
```json
{
  "attackTrigger": {
    "enabled": true,
    "triggers": {
      "aiBlock": true,
      "highAnomaly": true,
      "unknownPattern": true,
      "repeatedAttack": true
    },
    "thresholds": {
      "anomalyScore": 0.8,
      "repeatCount": 3,
      "repeatWindowMs": 60000
    }
  }
}
```
