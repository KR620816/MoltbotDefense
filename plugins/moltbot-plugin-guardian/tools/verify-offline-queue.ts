
import { OfflineQueueService } from '../src/services/offline-queue.js';
import * as path from 'path';
import * as fs from 'fs/promises';

async function main() {
    console.log('🚀 Starting Offline Queue Verification...');

    const testDir = path.join(process.cwd(), 'data_test_offline');
    await fs.mkdir(testDir, { recursive: true });

    // 1. Initialize Service
    const queueService = new OfflineQueueService(testDir);
    await queueService.initialize();
    console.log(`[Test] Initial Queue Length: ${queueService.getQueueLength()}`);

    // 2. Simulate Enqueue (Network Offline)
    console.log('[Test] Simulating broadcast failure...');
    await queueService.enqueue('broadcast_pattern', {
        pattern: 'offline_test_pattern',
        category: 'test'
    });

    // 3. Verify Memory State
    if (queueService.getQueueLength() === 1) {
        console.log('✅ Memory Check: Item added to queue.');
    } else {
        console.error('❌ Memory Check Failed.');
    }

    // 4. Verify Disk Persistence
    const filePath = path.join(testDir, 'offline-queue.json');
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        if (data.length === 1 && data[0].payload.pattern === 'offline_test_pattern') {
            console.log('✅ Disk Check: Item persisted to offline-queue.json');
        } else {
            console.error('❌ Disk Check Failed: Content mismatch OR empty.');
            console.log('   File Content:', fileContent);
        }
    } catch (err) {
        console.error('❌ Disk Check Error: File not found or read error.', err);
    }

    // 5. Simulate Process (Network Online)
    console.log('[Test] Simulating network recovery (Process Queue)...');
    await queueService.process(async (item) => {
        console.log(`   Processing item ${item.id}: ${item.payload.pattern}`);
        return true; // Simulate success
    });

    if (queueService.getQueueLength() === 0) {
        console.log('✅ Processing Check: Queue emptied after success.');
    } else {
        console.error('❌ Processing Check Failed: Queue not empty.');
    }

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
}

main().catch(console.error);
