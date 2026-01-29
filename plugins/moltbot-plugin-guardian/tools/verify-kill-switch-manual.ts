
import { KillSwitchService } from '../src/services/kill-switch.js';
import { AttackTriggerService, AttackEvent } from '../src/services/attack-trigger.js';
import { EventEmitter } from 'events';

// Mock AttackTriggerService config since we just use it for event emission
const mockConfig = {
    enabled: true,
    triggers: {} as any,
    thresholds: {} as any,
    autoSave: { enabled: false } as any
};

// Create a subclass to intercept execDocker or we just rely on logs
// Since we can't easily override the private function or the module import, 
// we will listen to stdout/stderr in this script or just rely on the console logs we see.

async function main() {
    console.log('🚀 Starting Kill Switch Verification...');

    const triggerService = new AttackTriggerService(mockConfig);
    const killSwitch = new KillSwitchService({ enabled: true, autoAction: 'pause' }, triggerService);

    killSwitch.start();

    // 1. Simulate Critical Attack with Metadata
    console.log('\n--- Test 1: Critical Attack with Container Name ---');
    const attack1: AttackEvent = {
        id: '1',
        timestamp: new Date(),
        source: 'ai',
        pattern: 'critical_cmd_injection',
        rawInput: 'rm -rf /',
        severity: 'critical',
        metadata: {
            containerName: 'moltbot-sandbox-test-1'
        }
    };

    // Emit event
    // triggerResult priority is what matters in logic
    // if priority < 9 it returns. Critical usually implies high priority.
    // We mock the priority in the second arg of emit (triggerResult)
    triggerService.emit('patternDetected', attack1, { priority: 10 });

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Simulate High Attack with Session Key (Derived Name)
    console.log('\n--- Test 2: High Attack with Session Key ---');
    const attack2: AttackEvent = {
        id: '2',
        timestamp: new Date(),
        source: 'heuristic',
        pattern: 'suspicious_pattern',
        rawInput: 'select * from users',
        severity: 'high',
        metadata: {
            sessionKey: 'user/Session #123'
        }
    };

    triggerService.emit('patternDetected', attack2, { priority: 9 });

    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. Simulate Low Attack (Should Ignore)
    console.log('\n--- Test 3: Low Severity Attack (Should Ignore) ---');
    const attack3: AttackEvent = {
        id: '3',
        timestamp: new Date(),
        source: 'rateLimit',
        pattern: 'spam',
        rawInput: 'hello',
        severity: 'low',
        metadata: { containerName: 'ignore-me' }
    };

    triggerService.emit('patternDetected', attack3, { priority: 2 });

    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Disable Test
    console.log('\n--- Test 4: Disabled Kill Switch ---');
    const ksDisabled = new KillSwitchService({ enabled: false, autoAction: 'pause' }, triggerService);
    ksDisabled.start();
    triggerService.emit('patternDetected', attack1, { priority: 10 });

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\n✅ Verification Complete. Check logs above for "Initiating PAUSE sequence" and "Docker command failed" (expected since containers dont exist).');
}

main().catch(console.error);
