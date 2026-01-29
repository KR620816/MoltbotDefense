/**
 * Attack Trigger Service
 * 
 * 공격 감지 시 이벤트를 발생시키고 새로운 패턴을 학습하는 서비스
 */

import { EventEmitter } from 'events';
import { AttackTriggerConfig } from '../config';

// ========== Types ==========

export type AttackSource = 'regex' | 'ai' | 'heuristic' | 'rateLimit' | 'unknown';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface AttackEvent {
    id: string;
    timestamp: Date;
    source: AttackSource;
    pattern: string;
    rawInput: string;
    matchedRule?: string;
    severity: Severity;
    anomalyScore?: number;
    metadata: {
        ip?: string;
        userAgent?: string;
        endpoint?: string;
        requestId?: string;
        sessionKey?: string;
        agentId?: string;
        toolName?: string;
        containerName?: string;
        [key: string]: any;
    };
}

export interface TriggerResult {
    shouldSave: boolean;
    reason: string;
    priority: number;
}

interface AttackRecord {
    ip: string;
    timestamp: number;
}

// ========== AttackTriggerService ==========

export class AttackTriggerService extends EventEmitter {
    private config: AttackTriggerConfig;
    private recentAttacks: AttackRecord[] = [];
    private pendingPatterns: AttackEvent[] = [];
    private flushTimer: NodeJS.Timeout | null = null;

    constructor(config: AttackTriggerConfig) {
        super();
        this.config = config;

        if (config.enabled && config.autoSave.enabled) {
            this.startFlushTimer();
        }
    }

    /**
     * 공격 감지 이벤트 처리
     */
    onAttackDetected(event: AttackEvent): void {
        if (!this.config.enabled) return;

        console.log(`🚨 [Guardian] Attack detected: ${event.source} - ${event.pattern.substring(0, 50)}...`);

        // 트리거 판정
        const triggerResult = this.shouldTrigger(event);

        if (triggerResult.shouldSave) {
            console.log(`📝 [Guardian] Pattern will be saved: ${triggerResult.reason}`);
            this.pendingPatterns.push(event);

            // 이벤트 발생
            this.emit('patternDetected', event, triggerResult);

            // 배치 크기 도달 시 즉시 flush
            if (this.pendingPatterns.length >= this.config.autoSave.batchSize) {
                this.flushPatterns();
            }
        } else {
            console.log(`⏭️ [Guardian] Pattern skipped: ${triggerResult.reason}`);
        }

        // 공격 기록 추가 (반복 공격 감지용)
        if (event.metadata.ip) {
            this.recordAttack(event.metadata.ip);
        }

        // 이벤트 발생
        this.emit('attackDetected', event, triggerResult);
    }

    /**
     * 트리거 조건 판정
     */
    shouldTrigger(event: AttackEvent): TriggerResult {
        const triggers = this.config.triggers;
        const thresholds = this.config.thresholds;

        // 1. AI 차단 (우선순위 높음 - 새로운 패턴 가능성)
        if (triggers.aiBlock && event.source === 'ai') {
            return {
                shouldSave: true,
                reason: 'AI_BLOCK',
                priority: 10
            };
        }

        // 2. 높은 이상 점수
        if (triggers.highAnomaly && event.anomalyScore !== undefined) {
            if (event.anomalyScore >= thresholds.anomalyScore) {
                return {
                    shouldSave: true,
                    reason: `HIGH_ANOMALY (${event.anomalyScore.toFixed(2)})`,
                    priority: 9
                };
            }
        }

        // 3. 알려지지 않은 패턴
        if (triggers.unknownPattern) {
            if (event.source === 'heuristic' || event.matchedRule === 'UNKNOWN') {
                return {
                    shouldSave: true,
                    reason: 'UNKNOWN_PATTERN',
                    priority: 8
                };
            }
        }

        // 4. 반복 공격
        if (triggers.repeatedAttack && event.metadata.ip) {
            const count = this.getAttackCount(event.metadata.ip, thresholds.repeatWindowMs);
            if (count >= thresholds.repeatCount) {
                return {
                    shouldSave: true,
                    reason: `REPEATED_ATTACK (${count} times)`,
                    priority: 7
                };
            }
        }

        // 5. Regex 차단은 이미 알려진 패턴이므로 저장 안함
        if (event.source === 'regex') {
            return {
                shouldSave: false,
                reason: 'KNOWN_PATTERN (regex)',
                priority: 0
            };
        }

        // 기본: 저장하지 않음
        return {
            shouldSave: false,
            reason: 'NO_TRIGGER',
            priority: 0
        };
    }

    /**
     * 공격 기록
     */
    private recordAttack(ip: string): void {
        this.recentAttacks.push({
            ip,
            timestamp: Date.now()
        });

        // 윈도우 밖의 오래된 기록 정리
        this.cleanupOldRecords();
    }

    /**
     * 특정 IP의 공격 횟수 조회
     */
    getAttackCount(ip: string, windowMs: number): number {
        const cutoff = Date.now() - windowMs;
        return this.recentAttacks.filter(
            record => record.ip === ip && record.timestamp >= cutoff
        ).length;
    }

    /**
     * 오래된 기록 정리
     */
    private cleanupOldRecords(): void {
        const cutoff = Date.now() - this.config.thresholds.repeatWindowMs;
        this.recentAttacks = this.recentAttacks.filter(
            record => record.timestamp >= cutoff
        );
    }

    /**
     * 대기 중인 패턴 플러시
     */
    flushPatterns(): AttackEvent[] {
        const patterns = [...this.pendingPatterns];
        this.pendingPatterns = [];

        if (patterns.length > 0) {
            console.log(`💾 [Guardian] Flushing ${patterns.length} patterns`);
            this.emit('patternsReady', patterns);
        }

        return patterns;
    }

    /**
     * 플러시 타이머 시작
     */
    private startFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(() => {
            if (this.pendingPatterns.length > 0) {
                this.flushPatterns();
            }
        }, this.config.autoSave.flushIntervalMs);
    }

    /**
     * 대기 중인 패턴 수
     */
    getPendingCount(): number {
        return this.pendingPatterns.length;
    }

    /**
     * 서비스 중지
     */
    stop(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }

        // 남은 패턴 플러시
        if (this.pendingPatterns.length > 0) {
            this.flushPatterns();
        }
    }

    /**
     * 이벤트 ID 생성
     */
    static generateEventId(): string {
        return `atk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}

// ========== Factory ==========

export function createAttackTriggerService(config: AttackTriggerConfig): AttackTriggerService {
    return new AttackTriggerService(config);
}

export default AttackTriggerService;
