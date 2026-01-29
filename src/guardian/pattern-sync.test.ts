/**
 * Pattern Sync Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PatternSyncService } from '../../plugins/moltbot-plugin-guardian/src/services/pattern-sync';
import { PatternDB } from '../../plugins/moltbot-plugin-guardian/src/db/pattern-db';
import { PropagationConfig } from '../../plugins/moltbot-plugin-guardian/src/config';

// Mock Dependencies
const mockPatternDB = {
    addPatterns: vi.fn(),
    save: vi.fn()
} as unknown as PatternDB;

const ENABLED_CONFIG: PropagationConfig = {
    enabled: true,
    mode: 'api',
    apiEndpoint: 'http://test-api',
    apiKey: 'key',
    push: { enabled: true, immediate: true, requireApproval: false },
    pull: { enabled: true, intervalMinutes: 10, onStartup: false }
};

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('PatternSyncService', () => {
    let service: PatternSyncService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new PatternSyncService(mockPatternDB, ENABLED_CONFIG);
    });

    afterEach(() => {
        service.stop();
    });

    describe('pushPattern', () => {
        it('should push pattern to API', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve('OK')
            });

            const result = await service.pushPattern({
                category: 'test',
                pattern: 'p1',
                severity: 'high'
            });

            expect(result).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://test-api/push',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('p1')
                })
            );
        });

        it('should return false on failure', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Error')
            });

            const result = await service.pushPattern({
                category: 'test',
                pattern: 'p1',
                severity: 'high'
            });

            expect(result).toBe(false);
        });

        it('should skip if push disabled', async () => {
            service = new PatternSyncService(mockPatternDB, {
                ...ENABLED_CONFIG,
                push: { ...ENABLED_CONFIG.push, enabled: false }
            });

            const result = await service.pushPattern({
                category: 'test',
                pattern: 'p1',
                severity: 'high'
            });

            expect(result).toBe(false);
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('pullPatterns', () => {
        it('should pull patterns and add to DB', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    patterns: [
                        { category: 'remote', pattern: 'r1', severity: 'high' }
                    ]
                })
            });
            (mockPatternDB.addPatterns as any).mockResolvedValue({ added: 1, duplicates: 0 });

            const result = await service.pullPatterns();

            expect(result.success).toBe(true);
            expect(result.syncedCount).toBe(1);
            expect(mockPatternDB.addPatterns).toHaveBeenCalled();
            expect(mockPatternDB.save).toHaveBeenCalled();
        });

        it('should handle API errors', async () => {
            mockFetch.mockRejectedValue(new Error('Network Error'));

            const result = await service.pullPatterns();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network Error');
        });
    });

    describe('start/stop', () => {
        it('should start pull on startup if enabled', () => {
            service = new PatternSyncService(mockPatternDB, {
                ...ENABLED_CONFIG,
                pull: { ...ENABLED_CONFIG.pull, onStartup: true }
            });

            // Mock pullPatterns method to verify call
            const spy = vi.spyOn(service, 'pullPatterns').mockResolvedValue({ success: true, syncedCount: 0 });

            service.start();

            expect(spy).toHaveBeenCalled();
        });
    });
});
