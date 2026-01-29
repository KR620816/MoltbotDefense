
import { KillSwitchService } from '../src/services/kill-switch.js';
import { AttackTriggerService, AttackEvent } from '../src/services/attack-trigger.js';
import { spawn } from 'child_process';
import * as crypto from 'crypto';

// Helper to run docker commands
function exec(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => stdout += d.toString());
        child.stderr.on('data', d => stderr += d.toString());
        child.on('close', code => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(`Command failed: ${command} ${args.join(' ')}\nStderr: ${stderr}`));
        });
    });
}

// Mock Config
const mockConfig = {
    enabled: true,
    triggers: {} as any,
    thresholds: {} as any,
    autoSave: { enabled: false } as any
};

async function main() {
    console.log('🚀 Starting Kill Switch LIVE Verification...');
    const containerName = `moltbot-live-test-${crypto.randomUUID().substring(0, 8)}`;

    try {
        // 1. Start a Dummy Container
        console.log(`[Setup] Starting dummy container: ${containerName}`);
        // Use 'alpine' if available, otherwise try 'hello-world' (no, need long running).
        // Let's rely on 'docker run --rm -d ... alpine sleep 1000'
        // If alpine is missing it might fail pulling.
        // We will try running 'alpine'.
        await exec('docker', ['run', '--rm', '-d', '--name', containerName, 'alpine', 'sleep', '1000']);
        console.log(`[Setup] Container started: ${containerName}`);

        // 2. Initialize Service
        const triggerService = new AttackTriggerService(mockConfig);
        const killSwitch = new KillSwitchService({ enabled: true, autoAction: 'pause' }, triggerService);
        killSwitch.start();

        // 3. Verify Container Status (Running)
        let status = await exec('docker', ['inspect', '-f', '{{.State.Status}}', containerName]);
        console.log(`[Pre-Check] Container Status: ${status}`);
        if (status !== 'running') throw new Error('Container failed to start properly');

        // 4. Trigger Critical Attack
        console.log(`[Action] Triggering CRITICAL attack event...`);
        const attack: AttackEvent = {
            id: 'live-1',
            timestamp: new Date(),
            source: 'ai',
            pattern: 'live_test_exploit',
            severity: 'critical',
            rawInput: 'die',
            metadata: {
                containerName: containerName
            }
        };

        triggerService.emit('patternDetected', attack, { priority: 10 });

        // Wait for Kill Switch execution
        console.log(`[Wait] Waiting for Kill Switch execution...`);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 5. Verify Container Status (Paused)
        status = await exec('docker', ['inspect', '-f', '{{.State.Status}}', containerName]);
        console.log(`[Post-Check] Container Status: ${status}`);

        if (status === 'paused') {
            console.log('✅ SUCCESS: Container was successfully PAUSED by Kill Switch.');
        } else {
            console.error('❌ FAILED: Container status is not paused.');
            process.exit(1);
        }

    } catch (err: any) {
        console.error('❌ TEST FAILED:', err.message);
        process.exit(1);
    } finally {
        // Cleanup
        try {
            console.log(`[Cleanup] Removing container: ${containerName}`);
            await exec('docker', ['rm', '-f', containerName]);
        } catch (e) {
            // ignore
        }
        process.exit(0);
    }
}

main().catch(console.error);
