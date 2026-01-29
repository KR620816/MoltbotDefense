#!/usr/bin/env python3
"""
Pattern Save Script

새로운 공격 패턴을 DB에 저장합니다.
사용법: python save_pattern.py --pattern "rm -rf /" --category "command_injection" --severity "critical"
"""

import argparse
import json
import os
import sys
import hashlib
from datetime import datetime
from pathlib import Path

# 환경 변수
PATTERN_DB_PATH = os.getenv("PATTERN_DB_PATH", "data/attack-patterns.json")


def load_db(db_path: str) -> dict:
    """패턴 DB 로드"""
    try:
        with open(db_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            "version": "1.0.0",
            "totalPatterns": 0,
            "lastUpdated": datetime.now().isoformat(),
            "categories": {}
        }


def save_db(db_path: str, db: dict):
    """패턴 DB 저장"""
    db["lastUpdated"] = datetime.now().isoformat()
    
    # 백업 생성
    backup_path = f"{db_path}.backup"
    if os.path.exists(db_path):
        with open(db_path, 'r', encoding='utf-8') as f:
            with open(backup_path, 'w', encoding='utf-8') as bf:
                bf.write(f.read())
    
    # 저장
    with open(db_path, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=2, ensure_ascii=False)


def get_pattern_hash(pattern: str) -> str:
    """패턴 해시 생성"""
    return hashlib.sha256(pattern.lower().encode()).hexdigest()[:16]


def is_duplicate(db: dict, pattern: str) -> bool:
    """중복 체크"""
    for category_data in db.get("categories", {}).values():
        if pattern.lower() in [p.lower() for p in category_data.get("patterns", [])]:
            return True
    return False


def add_pattern(db: dict, category: str, pattern: str, severity: str, description: str = "") -> bool:
    """패턴 추가"""
    if is_duplicate(db, pattern):
        print(f"[SKIP] Duplicate pattern: {pattern[:50]}")
        return False
    
    # 카테고리 없으면 생성
    if category not in db["categories"]:
        db["categories"][category] = {
            "description": f"Auto-created category: {category}",
            "severity": severity,
            "patterns": []
        }
    
    # 패턴 추가
    db["categories"][category]["patterns"].append(pattern)
    db["totalPatterns"] = sum(
        len(cat.get("patterns", [])) 
        for cat in db["categories"].values()
    )
    
    return True


def main():
    parser = argparse.ArgumentParser(description="Save attack pattern to database")
    parser.add_argument("--pattern", type=str, required=True, help="Attack pattern string")
    parser.add_argument("--category", type=str, required=True, help="Pattern category")
    parser.add_argument("--severity", type=str, default="high", 
                        choices=["critical", "high", "medium", "low"],
                        help="Pattern severity")
    parser.add_argument("--description", type=str, default="", help="Pattern description")
    parser.add_argument("--db", type=str, default=PATTERN_DB_PATH, help="Database file path")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without saving")
    args = parser.parse_args()
    
    db = load_db(args.db)
    
    print(f"Pattern: {args.pattern[:50]}...")
    print(f"Category: {args.category}")
    print(f"Severity: {args.severity}")
    print(f"Hash: {get_pattern_hash(args.pattern)}")
    
    if args.dry_run:
        print("[DRY-RUN] Would add pattern to database")
        return 0
    
    if add_pattern(db, args.category, args.pattern, args.severity, args.description):
        save_db(args.db, db)
        print(f"[SUCCESS] Pattern saved. Total: {db['totalPatterns']}")
        return 0
    else:
        print("[FAILED] Could not save pattern")
        return 1


if __name__ == "__main__":
    sys.exit(main())
