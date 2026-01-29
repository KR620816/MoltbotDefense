/**
 * Pattern Learning Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PatternLearningService } from '../../plugins/moltbot-plugin-guardian/src/services/pattern-learning';
import { PatternDB } from '../../plugins/moltbot-plugin-guardian/src/db/pattern-db';
import { AttackEvent } from '../../plugins/moltbot-plugin-guardian/src/services/attack-trigger';
import { GuardianAiConfig } from '../../plugins/moltbot-plugin-guardian/src/config';

// Mock PatternDB
const mockPatternDB = {
    load: vi.fn(),
    isDuplicate: vi.fn(),
    addPattern: vi.fn(),
    save: vi.fn(),
    getCategories: vi.fn().mockReturnValue(['sql_injection', 'xss']),
} as unknown as PatternDB;

// Mock OpenAI Client
const mockCreateChatCompletion = vi.fn();
const mockAiClient = {
    chat: {
        completions: {
            create: mockCreateChatCompletion
        }
    }
};

const TEST_CONFIG: GuardianAiConfig = {
    provider: 'openai-compatible',
    baseUrl: 'http://test',
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 100,
    timeoutMs: 1000
};

describe('PatternLearningService', () => {
    let service: PatternLearningService;

    beforeEach(() => {
        vi.clearAllMocks();
        // Inject mockAiClient manually
        service = new PatternLearningService(mockPatternDB, TEST_CONFIG, mockAiClient as any);
    });

    it('should learn valid pattern successfully', async () => {
        // Setup
        (mockPatternDB.isDuplicate as any).mockReturnValue(false);
        (mockPatternDB.addPattern as any).mockResolvedValue({ success: true });

        mockCreateChatCompletion.mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        category: 'sql_injection',
                        severity: 'critical',
                        normalized_pattern: "SELECT * FROM users"
                    })
                }
            }]
        });

        const event: AttackEvent = {
            id: 'test-1',
            timestamp: new Date(),
            source: 'ai',
            pattern: "SELECT * FROM users WHERE 1=1",
            rawInput: "SELECT * FROM users WHERE 1=1",
            severity: 'high',
            metadata: {}
        };

        // Execute
        const result = await service.learnFromEvent(event);

        // Verify
        expect(result.success).toBe(true);
        expect(result.category).toBe('sql_injection');
        expect(mockPatternDB.addPattern).toHaveBeenCalledWith(
            'sql_injection',
            "SELECT * FROM users",
            'critical',
            expect.any(String)
        );
        expect(mockPatternDB.save).toHaveBeenCalled();
    });

    it('should handle duplicate patterns', async () => {
        // Setup
        (mockPatternDB.isDuplicate as any).mockReturnValue(true);

        const event: AttackEvent = {
            id: 'test-2',
            timestamp: new Date(),
            source: 'regex',
            pattern: 'known pattern',
            rawInput: 'known pattern',
            severity: 'low',
            metadata: {}
        };

        // Execute
        const result = await service.learnFromEvent(event);

        // Verify
        expect(result.success).toBe(false);
        expect(result.isDuplicate).toBe(true);
        expect(mockPatternDB.addPattern).not.toHaveBeenCalled();
    });

    it('should fallback when AI fails', async () => {
        // Setup
        (mockPatternDB.isDuplicate as any).mockReturnValue(false);
        (mockPatternDB.addPattern as any).mockResolvedValue({ success: true });

        // AI Error
        mockCreateChatCompletion.mockRejectedValue(new Error('AI API Error'));

        const event: AttackEvent = {
            id: 'test-3',
            timestamp: new Date(),
            source: 'heuristic',
            pattern: 'suspicious payload',
            rawInput: 'suspicious payload',
            severity: 'medium',
            metadata: {}
        };

        // Execute
        const result = await service.learnFromEvent(event);

        // Verify - should still save but with default category
        expect(result.success).toBe(true);
        expect(mockPatternDB.addPattern).toHaveBeenCalledWith(
            'uncategorized',
            'suspicious payload',
            'medium',
            undefined
        );
    });

    it('should reject short patterns', async () => {
        const event: AttackEvent = {
            id: 'test-4',
            timestamp: new Date(),
            source: 'ai',
            pattern: 'a',
            rawInput: 'a',
            severity: 'low',
            metadata: {}
        };

        const result = await service.learnFromEvent(event);

        expect(result.success).toBe(false);
        expect(result.error).toContain('short');
    });
});
