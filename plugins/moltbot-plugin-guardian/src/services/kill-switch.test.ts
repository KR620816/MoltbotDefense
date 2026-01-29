
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { KillSwitchService, KillSwitchConfig } from './kill-switch';
import { AttackTriggerService } from './attack-trigger';

// Mock child_process
const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
}));

vi.mock('child_process', () => ({
    spawn: mocks.spawn
}));

describe('KillSwitchService', () => {
    let service: KillSwitchService;
    let mockTriggerService: AttackTriggerService;
    let mockChildProcess: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock AttackTriggerService as EventEmitter
        mockTriggerService = new EventEmitter() as any;

        // Mock spawn behavior
        mockChildProcess = {
            on: vi.fn((event, cb) => {
                if (event === 'close') cb(0); // Success
            }),
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() }
        };
        mocks.spawn.mockReturnValue(mockChildProcess);

        const config: KillSwitchConfig = {
            enabled: true,
            autoAction: 'pause'
        };

        service = new KillSwitchService(config, mockTriggerService);
        service.start();
    });

    it('should execute PAUSE command on CRITICAL attack with containerName', async () => {
        const attackEvent = {
            severity: 'critical',
            pattern: 'malicious prompt',
            metadata: {
                containerName: 'target-container'
            }
        };

        mockTriggerService.emit('patternDetected', attackEvent, { priority: 10 });

        // Wait for async handler
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mocks.spawn).toHaveBeenCalledWith('docker', ['pause', 'target-container'], expect.anything());
    });

    it('should derive container name from sessionKey if containerName missing', async () => {
        const attackEvent = {
            severity: 'high',
            pattern: 'malicious prompt',
            metadata: {
                sessionKey: 'user/Session 123'
            }
        };

        mockTriggerService.emit('patternDetected', attackEvent, { priority: 9 });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Derived: moltbot-sandbox-user-session-123
        expect(mocks.spawn).toHaveBeenCalledWith('docker', ['pause', 'moltbot-sandbox-user-session-123'], expect.anything());
    });

    it('should ignore LOW severity attacks', async () => {
        const attackEvent = {
            severity: 'low',
            pattern: 'minor issue',
            metadata: { containerName: 'target' }
        };

        mockTriggerService.emit('patternDetected', attackEvent, { priority: 1 });

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it('should do nothing if disabled', async () => {
        const disabledService = new KillSwitchService({ enabled: false, autoAction: 'pause' }, mockTriggerService);
        disabledService.start();

        const attackEvent = {
            severity: 'critical',
            metadata: { containerName: 'target' }
        };

        mockTriggerService.emit('patternDetected', attackEvent, { priority: 10 });
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mocks.spawn).not.toHaveBeenCalled();
    });
});
