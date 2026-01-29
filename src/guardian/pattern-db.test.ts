/**
 * Pattern DB Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PatternDB } from '../../plugins/moltbot-plugin-guardian/src/db/pattern-db';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PatternDB', () => {
    let db: PatternDB;
    let testDbPath: string;

    beforeEach(() => {
        // 임시 파일 경로 생성
        testDbPath = path.join(os.tmpdir(), `test-patterns-${Date.now()}.json`);
        db = new PatternDB(testDbPath);
    });

    afterEach(() => {
        // 테스트 파일 정리
        try {
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
            if (fs.existsSync(testDbPath + '.backup')) {
                fs.unlinkSync(testDbPath + '.backup');
            }
        } catch (e) {
            // ignore
        }
    });

    describe('load', () => {
        it('should create empty DB if file does not exist', async () => {
            const data = await db.load();
            expect(data).toBeDefined();
            expect(data.categories).toEqual({});
            expect(data.totalPatterns).toBe(0);
        });

        it('should load existing DB file', async () => {
            const testData = {
                version: '1.0.0',
                totalPatterns: 1,
                lastUpdated: new Date().toISOString(),
                source: 'test',
                categories: {
                    test_category: {
                        description: 'Test',
                        severity: 'high',
                        patterns: ['test pattern']
                    }
                }
            };
            fs.writeFileSync(testDbPath, JSON.stringify(testData));

            const data = await db.load();
            expect(data.categories.test_category).toBeDefined();
            expect(data.categories.test_category.patterns).toContain('test pattern');
        });
    });

    describe('addPattern', () => {
        it('should add new pattern', async () => {
            const result = await db.addPattern('command_injection', 'rm -rf /', 'critical');
            expect(result.success).toBe(true);
            expect(result.hash).toBeDefined();
        });

        it('should create category if not exists', async () => {
            await db.addPattern('new_category', 'pattern1', 'high');
            const category = db.getCategory('new_category');
            expect(category).toBeDefined();
            expect(category?.patterns).toContain('pattern1');
        });

        it('should detect duplicates', async () => {
            await db.addPattern('test', 'duplicate pattern', 'high');
            const result = await db.addPattern('test', 'duplicate pattern', 'high');
            expect(result.success).toBe(false);
            expect(result.isDuplicate).toBe(true);
        });

        it('should detect case-insensitive duplicates', async () => {
            await db.addPattern('test', 'UPPERCASE PATTERN', 'high');
            const result = await db.addPattern('test', 'uppercase pattern', 'high');
            expect(result.isDuplicate).toBe(true);
        });
    });

    describe('removePattern', () => {
        it('should remove existing pattern', async () => {
            await db.addPattern('test', 'pattern to remove', 'high');
            const removed = await db.removePattern('test', 'pattern to remove');
            expect(removed).toBe(true);

            const category = db.getCategory('test');
            expect(category?.patterns).not.toContain('pattern to remove');
        });

        it('should return false for non-existent pattern', async () => {
            await db.load();
            const removed = await db.removePattern('test', 'non-existent');
            expect(removed).toBe(false);
        });
    });

    describe('isDuplicate', () => {
        it('should detect duplicate patterns', async () => {
            await db.addPattern('test', 'check duplicate', 'high');
            expect(db.isDuplicate('check duplicate')).toBe(true);
            expect(db.isDuplicate('not duplicate')).toBe(false);
        });
    });

    describe('getTotalCount', () => {
        it('should count all patterns', async () => {
            await db.addPattern('cat1', 'pattern1', 'high');
            await db.addPattern('cat1', 'pattern2', 'high');
            await db.addPattern('cat2', 'pattern3', 'high');

            expect(db.getTotalCount()).toBe(3);
        });
    });

    describe('addPatterns (batch)', () => {
        it('should add multiple patterns', async () => {
            const patterns = [
                { category: 'test', pattern: 'batch1' },
                { category: 'test', pattern: 'batch2' },
                { category: 'test', pattern: 'batch3' }
            ];

            const result = await db.addPatterns(patterns);
            expect(result.added).toBe(3);
            expect(result.duplicates).toBe(0);
        });

        it('should count duplicates in batch', async () => {
            await db.addPattern('test', 'existing', 'high');

            const patterns = [
                { category: 'test', pattern: 'existing' },
                { category: 'test', pattern: 'new' }
            ];

            const result = await db.addPatterns(patterns);
            expect(result.added).toBe(1);
            expect(result.duplicates).toBe(1);
        });
    });

    describe('save', () => {
        it('should save DB to file', async () => {
            await db.addPattern('test', 'save test', 'high');
            await db.save();

            expect(fs.existsSync(testDbPath)).toBe(true);

            const content = JSON.parse(fs.readFileSync(testDbPath, 'utf-8'));
            expect(content.categories.test.patterns).toContain('save test');
        });

        it('should create backup on save', async () => {
            await db.addPattern('test', 'first', 'high');
            await db.save();
            await db.addPattern('test', 'second', 'high');
            await db.save();

            expect(fs.existsSync(testDbPath + '.backup')).toBe(true);
        });

        it('should increment version on save', async () => {
            await db.load();
            await db.save();
            const info1 = db.getInfo();

            await db.save();
            const info2 = db.getInfo();

            expect(info2?.version).not.toBe(info1?.version);
        });
    });

    describe('searchPatterns', () => {
        it('should find patterns by query', async () => {
            await db.addPattern('cmd', 'rm -rf /', 'critical');
            await db.addPattern('cmd', 'rm -f /tmp/*', 'high');
            await db.addPattern('xss', '<script>alert(1)</script>', 'high');

            const results = db.searchPatterns('rm');
            expect(results.length).toBe(2);
            expect(results.every(r => r.pattern.includes('rm'))).toBe(true);
        });
    });

    describe('getDBHash', () => {
        it('should return consistent hash for same content', async () => {
            await db.addPattern('test', 'pattern1', 'high');
            await db.addPattern('test', 'pattern2', 'high');

            const hash1 = db.getDBHash();
            const hash2 = db.getDBHash();

            expect(hash1).toBe(hash2);
        });

        it('should return different hash for different content', async () => {
            await db.addPattern('test', 'pattern1', 'high');
            const hash1 = db.getDBHash();

            await db.addPattern('test', 'pattern2', 'high');
            const hash2 = db.getDBHash();

            expect(hash1).not.toBe(hash2);
        });
    });
});
