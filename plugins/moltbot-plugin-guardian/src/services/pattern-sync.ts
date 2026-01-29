/**
 * Pattern Sync Service
 * 
 * 중앙 서버 또는 다른 노드와 패턴을 동기화(Push/Pull)하는 서비스
 */

import { PatternDB } from '../db/pattern-db';
import { PropagationConfig } from '../config';

// ========== Interfaces ==========

export interface SyncResult {
    success: boolean;
    syncedCount: number;
    error?: string;
}

export interface RemotePattern {
    pattern: string;
    category: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    timestamp: string;
    source: string;
}

// ========== PatternSyncService ==========

export class PatternSyncService {
    private db: PatternDB;
    private config: PropagationConfig;
    private syncTimer: NodeJS.Timeout | null = null;
    private lastSyncTime: number = 0;

    constructor(db: PatternDB, config: PropagationConfig) {
        this.db = db;
        this.config = config;
    }

    /**
     * 동기화 서비스 시작
     */
    start(): void {
        if (!this.config.enabled) return;

        // 시작 시 즉시 Pull
        if (this.config.pull.onStartup) {
            this.pullPatterns().catch(err => console.error(`[PatternSync] Startup pull failed: ${err}`));
        }

        // 주기적 Pull 설정
        if (this.config.pull.enabled && this.config.pull.intervalMinutes > 0) {
            this.syncTimer = setInterval(
                () => this.pullPatterns(),
                this.config.pull.intervalMinutes * 60 * 1000
            );
        }
    }

    /**
     * 서비스 중지
     */
    stop(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    /**
     * 패턴 푸시 (새로운 패턴 발견 시)
     */
    async pushPattern(pattern: { category: string; pattern: string; severity: string }): Promise<boolean> {
        if (!this.config.enabled || !this.config.push.enabled) return false;

        // 로컬 모드일 경우 Skip
        if (this.config.mode === 'local') return true;

        try {
            const response = await fetch(`${this.config.apiEndpoint}/push`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    ...pattern,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            console.log(`[PatternSync] Pushed pattern: ${pattern.pattern.substring(0, 30)}...`);
            return true;

        } catch (error) {
            console.error(`[PatternSync] Push failed: ${error}`);
            return false;
        }
    }

    /**
     * 패턴 풀 (주기접 업데이트)
     */
    async pullPatterns(): Promise<SyncResult> {
        if (!this.config.enabled || !this.config.pull.enabled) {
            return { success: false, syncedCount: 0 };
        }

        // 로컬 모드일 경우 Skip
        if (this.config.mode === 'local') return { success: true, syncedCount: 0 };

        try {
            const since = new Date(this.lastSyncTime).toISOString();
            const response = await fetch(`${this.config.apiEndpoint}/pull?since=${since}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            const data = await response.json() as { patterns: RemotePattern[] };

            if (!data.patterns || data.patterns.length === 0) {
                return { success: true, syncedCount: 0 };
            }

            // DB에 추가
            const addResult = await this.db.addPatterns(data.patterns.map(p => ({
                category: p.category,
                pattern: p.pattern,
                severity: p.severity
            })));

            if (addResult.added > 0) {
                await this.db.save();
                console.log(`[PatternSync] Pulled ${addResult.added} new patterns`);
            }

            this.lastSyncTime = Date.now();
            return { success: true, syncedCount: addResult.added };

        } catch (error) {
            console.error(`[PatternSync] Pull failed: ${error}`);
            return { success: false, syncedCount: 0, error: String(error) };
        }
    }
}
