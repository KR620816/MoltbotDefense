#!/usr/bin/env python3
"""
Pattern Sync Script

패턴 DB를 중앙 서버 또는 P2P 네트워크와 동기화합니다.
사용법: python sync_patterns.py --mode push|pull --endpoint https://patterns.moltbot.io/api/v1
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# 환경 변수
PATTERN_DB_PATH = os.getenv("PATTERN_DB_PATH", "data/attack-patterns.json")
PATTERN_API_KEY = os.getenv("PATTERN_API_KEY", "")
PATTERN_API_ENDPOINT = os.getenv("PATTERN_API_ENDPOINT", "https://patterns.moltbot.io/api/v1")
SYNC_STATE_PATH = os.getenv("SYNC_STATE_PATH", "data/.sync-state.json")


def load_db(db_path: str) -> dict:
    """패턴 DB 로드"""
    try:
        with open(db_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"categories": {}, "totalPatterns": 0}


def load_sync_state() -> dict:
    """동기화 상태 로드"""
    try:
        with open(SYNC_STATE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"lastSync": None, "pendingPush": []}


def save_sync_state(state: dict):
    """동기화 상태 저장"""
    os.makedirs(os.path.dirname(SYNC_STATE_PATH), exist_ok=True)
    with open(SYNC_STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2)


def api_request(endpoint: str, method: str = "GET", data: dict = None) -> dict | None:
    """API 요청"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {PATTERN_API_KEY}"
    }
    
    try:
        req = Request(endpoint, headers=headers, method=method)
        if data:
            req.data = json.dumps(data).encode('utf-8')
        
        with urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except (URLError, HTTPError) as e:
        print(f"[ERROR] API request failed: {e}")
        return None


def push_patterns(db: dict, endpoint: str) -> int:
    """패턴 업로드"""
    state = load_sync_state()
    pending = state.get("pendingPush", [])
    
    if not pending:
        print("[INFO] No patterns to push")
        return 0
    
    pushed = 0
    for pattern_data in pending:
        result = api_request(
            f"{endpoint}/patterns",
            method="POST",
            data=pattern_data
        )
        
        if result and result.get("success"):
            pushed += 1
            print(f"[PUSHED] {pattern_data.get('category')}: {pattern_data.get('pattern', '')[:30]}")
        else:
            print(f"[FAILED] {pattern_data.get('pattern', '')[:30]}")
    
    # 성공한 것들 제거
    if pushed > 0:
        state["pendingPush"] = pending[pushed:]
        state["lastSync"] = datetime.now().isoformat()
        save_sync_state(state)
    
    print(f"[SUMMARY] Pushed {pushed}/{len(pending)} patterns")
    return pushed


def pull_patterns(db: dict, endpoint: str) -> int:
    """패턴 다운로드"""
    state = load_sync_state()
    last_sync = state.get("lastSync", "1970-01-01T00:00:00")
    
    result = api_request(f"{endpoint}/patterns?since={last_sync}")
    
    if not result:
        print("[ERROR] Failed to fetch patterns")
        return 0
    
    new_patterns = result.get("patterns", [])
    
    if not new_patterns:
        print("[INFO] No new patterns to pull")
        return 0
    
    pulled = 0
    for pattern_data in new_patterns:
        category = pattern_data.get("category")
        pattern = pattern_data.get("pattern")
        
        if category not in db["categories"]:
            db["categories"][category] = {
                "description": f"Synced from remote",
                "severity": pattern_data.get("severity", "high"),
                "patterns": []
            }
        
        if pattern not in db["categories"][category]["patterns"]:
            db["categories"][category]["patterns"].append(pattern)
            pulled += 1
            print(f"[PULLED] {category}: {pattern[:30]}")
    
    if pulled > 0:
        # DB 저장
        with open(PATTERN_DB_PATH, 'w', encoding='utf-8') as f:
            json.dump(db, f, indent=2, ensure_ascii=False)
        
        state["lastSync"] = datetime.now().isoformat()
        save_sync_state(state)
    
    print(f"[SUMMARY] Pulled {pulled} new patterns")
    return pulled


def main():
    parser = argparse.ArgumentParser(description="Sync patterns with remote server")
    parser.add_argument("--mode", type=str, required=True, 
                        choices=["push", "pull", "both"],
                        help="Sync mode")
    parser.add_argument("--endpoint", type=str, default=PATTERN_API_ENDPOINT,
                        help="API endpoint URL")
    parser.add_argument("--db", type=str, default=PATTERN_DB_PATH,
                        help="Database file path")
    args = parser.parse_args()
    
    db = load_db(args.db)
    
    if args.mode in ["push", "both"]:
        push_patterns(db, args.endpoint)
    
    if args.mode in ["pull", "both"]:
        pull_patterns(db, args.endpoint)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
