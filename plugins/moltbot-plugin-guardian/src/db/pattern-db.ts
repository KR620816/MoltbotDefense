/**
 * Pattern Database Utility
 * 
 * 공격 패턴 DB의 CRUD, 중복체크, 버전관리 기능 제공
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ========== Types ==========

export interface Pattern {
    pattern: string;
    description?: string;
    addedAt?: string;
    source?: string;
}

export interface CategoryData {
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    patterns: string[];
}

export interface PatternDatabase {
    version: string;
    totalPatterns: number;
    lastUpdated: string;
    source: string;
    categories: Record<string, CategoryData>;
}

export interface AddPatternResult {
    success: boolean;
    message: string;
    hash?: string;
    isDuplicate?: boolean;
}

// ========== Constants ==========

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'attack-patterns.json');
const BACKUP_SUFFIX = '.backup';

// ========== PatternDB Class ==========

export class PatternDB {
    private dbPath: string;
    private db: PatternDatabase | null = null;
    private patternHashes: Set<string> = new Set();

    constructor(dbPath: string = DEFAULT_DB_PATH) {
        this.dbPath = dbPath;
    }

    /**
     * 패턴 해시 생성 (중복 체크용)
     */
    private getPatternHash(pattern: string): string {
        return crypto.createHash('sha256')
            .update(pattern.toLowerCase().trim())
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * DB 로드
     */
    async load(): Promise<PatternDatabase> {
        if (this.db) return this.db;

        try {
            const content = fs.readFileSync(this.dbPath, 'utf-8');
            this.db = JSON.parse(content);

            // 해시 인덱스 구축
            this.buildHashIndex();

            return this.db!;
        } catch (error) {
            // 새 DB 생성
            this.db = {
                version: '1.0.0',
                totalPatterns: 0,
                lastUpdated: new Date().toISOString(),
                source: 'PatternDB',
                categories: {}
            };
            return this.db;
        }
    }

    /**
     * 해시 인덱스 구축
     */
    private buildHashIndex(): void {
        this.patternHashes.clear();
        if (!this.db) return;

        for (const categoryData of Object.values(this.db.categories)) {
            for (const pattern of categoryData.patterns) {
                this.patternHashes.add(this.getPatternHash(pattern));
            }
        }
    }

    /**
     * DB 저장
     */
    async save(): Promise<void> {
        if (!this.db) return;

        // 백업 생성
        if (fs.existsSync(this.dbPath)) {
            fs.copyFileSync(this.dbPath, this.dbPath + BACKUP_SUFFIX);
        }

        // 메타데이터 업데이트
        this.db.lastUpdated = new Date().toISOString();
        this.db.totalPatterns = this.getTotalCount();

        // 버전 증가
        const parts = this.db.version.split('.').map(Number);
        parts[2] = (parts[2] || 0) + 1;
        this.db.version = parts.join('.');

        // 디렉토리 생성
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 저장
        fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2), 'utf-8');
    }

    /**
     * 중복 체크
     */
    isDuplicate(pattern: string): boolean {
        const hash = this.getPatternHash(pattern);
        return this.patternHashes.has(hash);
    }

    /**
     * 패턴 추가
     */
    async addPattern(
        category: string,
        pattern: string,
        severity: 'critical' | 'high' | 'medium' | 'low' = 'high',
        description?: string
    ): Promise<AddPatternResult> {
        await this.load();

        // 중복 체크
        if (this.isDuplicate(pattern)) {
            return {
                success: false,
                message: 'Pattern already exists',
                isDuplicate: true,
                hash: this.getPatternHash(pattern)
            };
        }

        // 카테고리 없으면 생성
        if (!this.db!.categories[category]) {
            this.db!.categories[category] = {
                description: description || `Auto-created: ${category}`,
                severity,
                patterns: []
            };
        }

        // 패턴 추가
        this.db!.categories[category].patterns.push(pattern);

        // 해시 인덱스 업데이트
        const hash = this.getPatternHash(pattern);
        this.patternHashes.add(hash);

        return {
            success: true,
            message: `Pattern added to ${category}`,
            hash
        };
    }

    /**
     * 패턴 삭제
     */
    async removePattern(category: string, pattern: string): Promise<boolean> {
        await this.load();

        if (!this.db!.categories[category]) {
            return false;
        }

        const index = this.db!.categories[category].patterns.indexOf(pattern);
        if (index === -1) {
            return false;
        }

        this.db!.categories[category].patterns.splice(index, 1);
        this.patternHashes.delete(this.getPatternHash(pattern));

        return true;
    }

    /**
     * 카테고리 조회
     */
    getCategory(category: string): CategoryData | undefined {
        if (!this.db) return undefined;
        return this.db.categories[category];
    }

    /**
     * 모든 카테고리 목록
     */
    getCategories(): string[] {
        if (!this.db) return [];
        return Object.keys(this.db.categories);
    }

    /**
     * 전체 패턴 수
     */
    getTotalCount(): number {
        if (!this.db) return 0;
        return Object.values(this.db.categories)
            .reduce((sum, cat) => sum + cat.patterns.length, 0);
    }

    /**
     * 카테고리별 패턴 수
     */
    getCategoryCount(category: string): number {
        if (!this.db || !this.db.categories[category]) return 0;
        return this.db.categories[category].patterns.length;
    }

    /**
     * 모든 패턴 조회
     */
    getAllPatterns(): string[] {
        if (!this.db) return [];
        const patterns: string[] = [];
        for (const cat of Object.values(this.db.categories)) {
            patterns.push(...cat.patterns);
        }
        return patterns;
    }

    /**
     * 패턴 검색
     */
    searchPatterns(query: string): Array<{ category: string; pattern: string }> {
        if (!this.db) return [];

        const results: Array<{ category: string; pattern: string }> = [];
        const lowerQuery = query.toLowerCase();

        for (const [category, data] of Object.entries(this.db.categories)) {
            for (const pattern of data.patterns) {
                if (pattern.toLowerCase().includes(lowerQuery)) {
                    results.push({ category, pattern });
                }
            }
        }

        return results;
    }

    /**
     * DB 정보
     */
    getInfo(): { version: string; totalPatterns: number; categories: number; lastUpdated: string } | null {
        if (!this.db) return null;
        return {
            version: this.db.version,
            totalPatterns: this.getTotalCount(),
            categories: Object.keys(this.db.categories).length,
            lastUpdated: this.db.lastUpdated
        };
    }

    /**
     * 여러 패턴 일괄 추가
     */
    async addPatterns(
        patterns: Array<{ category: string; pattern: string; severity?: 'critical' | 'high' | 'medium' | 'low' }>
    ): Promise<{ added: number; duplicates: number }> {
        await this.load();

        let added = 0;
        let duplicates = 0;

        for (const { category, pattern, severity } of patterns) {
            const result = await this.addPattern(category, pattern, severity || 'high');
            if (result.success) {
                added++;
            } else if (result.isDuplicate) {
                duplicates++;
            }
        }

        return { added, duplicates };
    }

    /**
     * DB 해시 (무결성 검증용)
     */
    getDBHash(): string {
        if (!this.db) return '';
        const allPatterns = this.getAllPatterns().sort().join('|');
        return crypto.createHash('sha256').update(allPatterns).digest('hex');
    }
}

// ========== Singleton Instance ==========

let defaultInstance: PatternDB | null = null;

export function getPatternDB(dbPath?: string): PatternDB {
    if (!defaultInstance || dbPath) {
        defaultInstance = new PatternDB(dbPath);
    }
    return defaultInstance;
}

export default PatternDB;
