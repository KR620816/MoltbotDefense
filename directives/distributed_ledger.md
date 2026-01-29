# Distributed Ledger Directive

## Goal
비트코인처럼 중앙 서버 없이 모든 노드가 동일한 패턴 DB를 공유합니다.

## Inputs
- P2P 네트워크 피어 목록
- 로컬 패턴 체인

## Outputs
- 동기화된 패턴 체인
- 합의된 새 블록

## Process

### 새 패턴 제안 (Propose)
1. 새 패턴 발견 시 제안 생성
2. 서명 추가
3. 모든 피어에게 브로드캐스트

### 패턴 검증 (Validate)
1. 제안 수신
2. 서명 검증
3. 중복 체크
4. AI 위험도 검증
5. 투표 전송

### 합의 (Consensus)
1. 투표 수집
2. 과반수(51%) 이상 동의 확인
3. 블록 생성 및 체인에 추가
4. 모든 노드에 전파

### 체인 동기화 (Sync)
1. 새 노드 참여 시 피어 발견
2. 가장 긴 체인 다운로드
3. 각 블록 해시 검증
4. 로컬 체인 교체

## Edge Cases
- **피어 장애**: 다른 피어에서 동기화
- **포크 발생**: 가장 긴 체인 선택 (Longest Chain Rule)
- **악의적 노드**: 합의 실패 시 제외
- **네트워크 분할**: 다수 네트워크 우선

## Configuration
```json
{
  "distributedLedger": {
    "enabled": true,
    "mode": "p2p",
    "network": {
      "bootstrapNodes": [
        "node1.moltbot.io:6881",
        "node2.moltbot.io:6881"
      ],
      "listenPort": 6881,
      "maxPeers": 50
    },
    "consensus": {
      "minValidators": 3,
      "approvalThreshold": 0.51,
      "blockInterval": 60000
    }
  }
}
```
