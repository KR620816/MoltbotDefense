/**
 * Attack Trigger Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    AttackTriggerService,
    AttackEvent,
    createAttackTriggerService
} from '../../plugins/moltbot-plugin-guardian/src/services/attack-trigger';
import { AttackTriggerConfig } from '../../plugins/moltbot-plugin-guardian/src/config';

const DEFAULT_CONFIG: AttackTriggerConfig = {
    enabled: true,
    triggers: {
        aiBlock: true,
        highAnomaly: true,
        unknownPattern: true,
        repeatedAttack: true
    },
    thresholds: {
        anomalyScore: 0.8,
        repeatCount: 3,
        repeatWindowMs: 60000
    },
    autoSave: {
        enabled: false, // 테스트에서는 비활성화
        batchSize: 10,
        flushIntervalMs: 30000
    }
};

function createTestEvent(overrides: Partial<AttackEvent> = {}): AttackEvent {
    return {
        id: AttackTriggerService.generateEventId(),
        timestamp: new Date(),
        source: 'ai',
        pattern: 'test attack pattern',
        rawInput: 'some malicious input',
        severity: 'high',
        metadata: {},
        ...overrides
    };
}

describe('AttackTriggerService', () => {
    let service: AttackTriggerService;

    beforeEach(() => {
        service = new AttackTriggerService(DEFAULT_CONFIG);
    });

    afterEach(() => {
        service.stop();
    });

    describe('shouldTrigger', () => {
        it('should trigger on AI block', () => {
            const event = createTestEvent({ source: 'ai' });
            const result = service.shouldTrigger(event);

            expect(result.shouldSave).toBe(true);
            expect(result.reason).toBe('AI_BLOCK');
            expect(result.priority).toBe(10);
        });

        it('should trigger on high anomaly score', () => {
            const event = createTestEvent({
                source: 'heuristic',
                anomalyScore: 0.95
            });
            const result = service.shouldTrigger(event);

            expect(result.shouldSave).toBe(true);
            expect(result.reason).toContain('HIGH_ANOMALY');
        });

        it('should not trigger on low anomaly score', () => {
            const event = createTestEvent({
                source: 'heuristic',
                anomalyScore: 0.5
            });
            const result = service.shouldTrigger(event);

            expect(result.reason).not.toContain('HIGH_ANOMALY');
        });

        it('should trigger on unknown pattern', () => {
            const event = createTestEvent({
                source: 'heuristic',
                matchedRule: 'UNKNOWN'
            });
            const result = service.shouldTrigger(event);

            expect(result.shouldSave).toBe(true);
            expect(result.reason).toBe('UNKNOWN_PATTERN');
        });

        it('should not trigger on regex match (known pattern)', () => {
            const event = createTestEvent({ source: 'regex' });
            const result = service.shouldTrigger(event);

            expect(result.shouldSave).toBe(false);
            expect(result.reason).toBe('KNOWN_PATTERN (regex)');
        });

        it('should trigger on repeated attacks', () => {
            const ip = '192.168.1.100';

            // 3번의 이전 공격 시뮬레이션
            for (let i = 0; i < 3; i++) {
                const event = createTestEvent({
                    source: 'regex',
                    metadata: { ip }
                });
                service.onAttackDetected(event);
            }

            // 4번째 공격
            const event = createTestEvent({
                source: 'unknown',
                metadata: { ip }
            });
            const result = service.shouldTrigger(event);

            expect(result.shouldSave).toBe(true);
            expect(result.reason).toContain('REPEATED_ATTACK');
        });
    });

    describe('onAttackDetected', () => {
        it('should add pattern to pending when trigger conditions met', () => {
            const event = createTestEvent({ source: 'ai' });

            service.onAttackDetected(event);

            expect(service.getPendingCount()).toBe(1);
        });

        it('should not add pattern when trigger conditions not met', () => {
            const event = createTestEvent({ source: 'regex' });

            service.onAttackDetected(event);

            expect(service.getPendingCount()).toBe(0);
        });

        it('should emit patternDetected event', () => {
            const event = createTestEvent({ source: 'ai' });
            const handler = vi.fn();

            service.on('patternDetected', handler);
            service.onAttackDetected(event);

            expect(handler).toHaveBeenCalled();
            expect(handler.mock.calls[0][0]).toEqual(event);
        });

        it('should emit attackDetected event for all attacks', () => {
            const event = createTestEvent({ source: 'regex' });
            const handler = vi.fn();

            service.on('attackDetected', handler);
            service.onAttackDetected(event);

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('flushPatterns', () => {
        it('should return and clear pending patterns', () => {
            const event1 = createTestEvent({ source: 'ai', pattern: 'pattern1' });
            const event2 = createTestEvent({ source: 'ai', pattern: 'pattern2' });

            service.onAttackDetected(event1);
            service.onAttackDetected(event2);

            expect(service.getPendingCount()).toBe(2);

            const flushed = service.flushPatterns();

            expect(flushed.length).toBe(2);
            expect(service.getPendingCount()).toBe(0);
        });

        it('should emit patternsReady event', () => {
            const event = createTestEvent({ source: 'ai' });
            const handler = vi.fn();

            service.on('patternsReady', handler);
            service.onAttackDetected(event);
            service.flushPatterns();

            expect(handler).toHaveBeenCalled();
            expect(handler.mock.calls[0][0].length).toBe(1);
        });
    });

    describe('getAttackCount', () => {
        it('should count attacks from same IP', () => {
            const ip = '10.0.0.1';

            for (let i = 0; i < 5; i++) {
                service.onAttackDetected(createTestEvent({
                    source: 'regex',
                    metadata: { ip }
                }));
            }

            const count = service.getAttackCount(ip, 60000);
            expect(count).toBe(5);
        });

        it('should not count attacks from different IPs', () => {
            service.onAttackDetected(createTestEvent({
                source: 'regex',
                metadata: { ip: '10.0.0.1' }
            }));
            service.onAttackDetected(createTestEvent({
                source: 'regex',
                metadata: { ip: '10.0.0.2' }
            }));

            const count = service.getAttackCount('10.0.0.1', 60000);
            expect(count).toBe(1);
        });
    });

    describe('disabled service', () => {
        it('should not process events when disabled', () => {
            const disabledConfig = { ...DEFAULT_CONFIG, enabled: false };
            const disabledService = new AttackTriggerService(disabledConfig);

            const event = createTestEvent({ source: 'ai' });
            disabledService.onAttackDetected(event);

            expect(disabledService.getPendingCount()).toBe(0);
            disabledService.stop();
        });
    });

    describe('batch processing', () => {
        it('should auto-flush when batch size reached', () => {
            const batchConfig: AttackTriggerConfig = {
                ...DEFAULT_CONFIG,
                autoSave: {
                    enabled: true,
                    batchSize: 3,
                    flushIntervalMs: 30000
                }
            };
            const batchService = new AttackTriggerService(batchConfig);
            const handler = vi.fn();

            batchService.on('patternsReady', handler);

            // 3개 추가 (배치 크기 도달)
            for (let i = 0; i < 3; i++) {
                batchService.onAttackDetected(createTestEvent({
                    source: 'ai',
                    pattern: `pattern${i}`
                }));
            }

            expect(handler).toHaveBeenCalled();
            expect(batchService.getPendingCount()).toBe(0);
            batchService.stop();
        });
    });

    describe('generateEventId', () => {
        it('should generate unique IDs', () => {
            const id1 = AttackTriggerService.generateEventId();
            const id2 = AttackTriggerService.generateEventId();

            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^atk_\d+_[a-z0-9]+$/);
        });
    });
});
