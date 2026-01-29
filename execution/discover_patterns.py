#!/usr/bin/env python3
"""
Pattern Discovery Script

AI를 사용하여 새로운 공격 패턴을 발견합니다.
사용법: python discover_patterns.py --count 10 --timeout 600
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# 환경 변수
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PATTERN_DB_PATH = os.getenv("PATTERN_DB_PATH", "data/attack-patterns.json")


def load_existing_patterns(db_path: str) -> dict:
    """기존 패턴 DB 로드"""
    try:
        with open(db_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"categories": {}, "totalPatterns": 0}


def get_existing_pattern_list(db: dict) -> list:
    """기존 패턴 목록 추출"""
    patterns = []
    for category_data in db.get("categories", {}).values():
        patterns.extend(category_data.get("patterns", []))
    return patterns


def request_pattern_from_ai(existing_patterns: list, categories: list) -> dict | None:
    """AI에게 새 패턴 요청 (구현 필요)"""
    # TODO: OpenAI API 호출 구현
    # 현재는 모킹된 응답 반환
    return None


def validate_pattern(pattern: dict) -> bool:
    """패턴 유효성 검증"""
    required_fields = ["category", "pattern", "severity"]
    return all(field in pattern for field in required_fields)


def is_duplicate(pattern: str, existing: list) -> bool:
    """중복 체크"""
    return pattern.lower() in [p.lower() for p in existing]


def discover_patterns(count: int, timeout: int) -> list:
    """새로운 패턴 발견"""
    start_time = time.time()
    db = load_existing_patterns(PATTERN_DB_PATH)
    existing = get_existing_pattern_list(db)
    categories = list(db.get("categories", {}).keys())
    
    new_patterns = []
    
    while len(new_patterns) < count:
        # 타임아웃 체크
        if time.time() - start_time > timeout:
            print(f"[TIMEOUT] {len(new_patterns)}/{count} patterns found")
            break
        
        # AI에게 패턴 요청
        candidate = request_pattern_from_ai(existing, categories)
        
        if candidate is None:
            print("[ERROR] Failed to get pattern from AI")
            continue
        
        # 유효성 검증
        if not validate_pattern(candidate):
            print("[SKIP] Invalid pattern format")
            continue
        
        # 중복 체크
        if is_duplicate(candidate["pattern"], existing):
            print(f"[SKIP] Duplicate: {candidate['pattern'][:50]}")
            continue
        
        new_patterns.append(candidate)
        existing.append(candidate["pattern"])
        print(f"[FOUND] {len(new_patterns)}/{count}: [{candidate['category']}] {candidate['pattern'][:50]}")
    
    return new_patterns


def main():
    parser = argparse.ArgumentParser(description="Discover new attack patterns using AI")
    parser.add_argument("--count", type=int, default=10, help="Number of patterns to discover")
    parser.add_argument("--timeout", type=int, default=600, help="Timeout in seconds")
    parser.add_argument("--output", type=str, default=None, help="Output JSON file")
    args = parser.parse_args()
    
    print(f"Starting pattern discovery: count={args.count}, timeout={args.timeout}s")
    
    patterns = discover_patterns(args.count, args.timeout)
    
    result = {
        "discovered": len(patterns),
        "patterns": patterns
    }
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Results saved to {args.output}")
    else:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    return 0 if patterns else 1


if __name__ == "__main__":
    sys.exit(main())
