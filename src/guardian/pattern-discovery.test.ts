/**
 * Pattern Discovery Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PatternDiscoveryService } from '../../plugins/moltbot-plugin-guardian/src/services/pattern-discovery';
import { PatternLearningService } from '../../plugins/moltbot-plugin-guardian/src/services/pattern-learning';
import { PatternDB } from '../../plugins/moltbot-plugin-guardian/src/db/pattern-db';
import { AutoDiscoveryConfig, GuardianAiConfig } from '../../plugins/moltbot-plugin-guardian/src/config';

// Mock Dependencies
const mockPatternDB = {
    getCategories: vi.fn().mockReturnValue(['sql_injection']),
    getCategory: vi.fn().mockReturnValue({ patterns: ['ex1', 'ex2'] })
} as unknown as PatternDB;

const mockLearningService = {
    learnFromEvent: vi.fn()
} as unknown as PatternLearningService;

const mockCreateChatCompletion = vi.fn();
const mockAiClient = {
    chat: {
        completions: {
            create: mockCreateChatCompletion
        }
    }
};

const TEST_AI_CONFIG: GuardianAiConfig = {
    provider: 'openai-compatible',
    baseUrl: 'http://test',
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 100,
    timeoutMs: 1000
};

const ENABLED_CONFIG: AutoDiscoveryConfig = {
    enabled: true,
    targetCount: 2, // 테스트를 위해 적게 설정
    timeoutMinutes: 1,
    runOnStartup: true
};

const DISABLED_CONFIG: AutoDiscoveryConfig = {
    ...ENABLED_CONFIG,
    enabled: false
};

describe('PatternDiscoveryService', () => {
    let service: PatternDiscoveryService;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should not start if disabled', async () => {
        service = new PatternDiscoveryService(
            mockPatternDB,
            mockLearningService,
            DISABLED_CONFIG,
            TEST_AI_CONFIG,
            mockAiClient as any
        );
        service.delayLoopMs = 0;

        const result = await service.startDiscovery();

        expect(result.reason).toBe('Disabled');
        expect(result.discovered).toBe(0);
        expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    });

    it('should discover patterns successfully', async () => {
        service = new PatternDiscoveryService(
            mockPatternDB,
            mockLearningService,
            ENABLED_CONFIG,
            TEST_AI_CONFIG,
            mockAiClient as any
        );
        service.delayLoopMs = 0;

        // LearningService Mock
        (mockLearningService.learnFromEvent as any).mockResolvedValue({ success: true });

        // OpenAI Mock
        mockCreateChatCompletion.mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        pattern: "NEW_ATTACK_PAYLOAD",
                        category: "sql_injection",
                        severity: "high"
                    })
                }
            }]
        });

        const result = await service.startDiscovery();

        expect(result.reason).toBe('Completed');
        expect(result.discovered).toBe(2); // targetCount
        expect(mockLearningService.learnFromEvent).toHaveBeenCalledTimes(2);
    });

    it('should handle duplicates and failures', async () => {
        service = new PatternDiscoveryService(
            mockPatternDB,
            mockLearningService,
            ENABLED_CONFIG,
            TEST_AI_CONFIG,
            mockAiClient as any
        );
        service.delayLoopMs = 0;

        // 1. Success
        // 2. Duplicate
        // 3. Success
        let callCount = 0;
        (mockLearningService.learnFromEvent as any).mockImplementation(async () => {
            callCount++;
            if (callCount === 2) return { success: false, isDuplicate: true };
            return { success: true };
        });

        mockCreateChatCompletion.mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({ pattern: "payload" })
                }
            }]
        });

        const result = await service.startDiscovery();

        expect(result.discovered).toBe(2);
        expect(result.duplicates).toBeGreaterThanOrEqual(1);
    });

    it('should timeout if taking too long', async () => {
        const TIMEOUT_CONFIG = { ...ENABLED_CONFIG, timeoutMinutes: 0.001 }; // Very short timeout (60ms)
        service = new PatternDiscoveryService(
            mockPatternDB,
            mockLearningService,
            TIMEOUT_CONFIG,
            TEST_AI_CONFIG,
            mockAiClient as any
        );
        service.delayLoopMs = 0;

        // Slow OpenAI Mock
        mockCreateChatCompletion.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay > 60ms timeout
            return { choices: [{ message: { content: "{}" } }] };
        });

        const result = await service.startDiscovery();

        expect(result.reason).toContain('Stopped: Timeout');
    });

    it('should prevent concurrent runs', async () => {
        service = new PatternDiscoveryService(
            mockPatternDB,
            mockLearningService,
            ENABLED_CONFIG,
            TEST_AI_CONFIG,
            mockAiClient as any
        );
        service.delayLoopMs = 0;

        // 첫 번째 실행 (오래 걸리게)
        mockCreateChatCompletion.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return { choices: [{ message: { content: JSON.stringify({ pattern: "p" }) } }] };
        });
        (mockLearningService.learnFromEvent as any).mockResolvedValue({ success: true });

        const p1 = service.startDiscovery();
        const p2 = service.startDiscovery(); // 즉시 두 번째 호출

        const [r1, r2] = await Promise.all([p1, p2]);

        // 하나는 'Completed', 하나는 'Already running'이어야 함
        const reasons = [r1.reason, r2.reason];
        expect(reasons).toContain('Already running');
    });
});
