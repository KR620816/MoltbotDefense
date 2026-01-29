
import { AttackTriggerService, AttackEvent } from '../src/services/attack-trigger.js';
import { PatternLearningService } from '../src/services/pattern-learning.js';
import { PatternDB } from '../src/db/pattern-db.js';
import { P2PNetwork } from '../src/p2p/network.js';
import { Blockchain } from '../src/p2p/chain.js';
import { Consensus } from '../src/p2p/consensus.js';
import { DistributedLedgerConfig, GuardianAiConfig } from '../src/config.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock OpenAI Client for Learning Service
const mockOpenAI = {
    chat: {
        completions: {
            create: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            category: 'integration_test_attack',
                            severity: 'high',
                            normalized_pattern: 'integration_test_pattern'
                        })
                    }
                }]
            })
        }
    }
} as any;

async function main() {
    console.log('🚀 Starting Attack-Share Integration Test...');

    // Setup Temporary DBs
    const dbPathA = path.join(__dirname, '..', 'data', 'test-db-a.json');
    const dbPathB = path.join(__dirname, '..', 'data', 'test-db-b.json');

    // Clean start
    if (fs.existsSync(dbPathA)) fs.unlinkSync(dbPathA);
    if (fs.existsSync(dbPathB)) fs.unlinkSync(dbPathB);

    const dbA = new PatternDB(dbPathA);
    const dbB = new PatternDB(dbPathB);

    // Setup Node A Services
    const chainA = new Blockchain('node-a');
    const nodeA = new P2PNetwork({
        enabled: true,
        network: { bootstrapNodes: [], listenPort: 16885, maxPeers: 10 },
        consensus: { minValidators: 1, approvalThreshold: 0.51, blockInterval: 60000 }
    } as DistributedLedgerConfig, chainA, new Consensus(chainA));

    const triggerServiceA = new AttackTriggerService({
        enabled: true,
        triggers: { aiBlock: true, highAnomaly: true, unknownPattern: true, repeatedAttack: true },
        thresholds: { anomalyScore: 0.8, repeatCount: 3, repeatWindowMs: 60000 },
        autoSave: { enabled: true, batchSize: 1, flushIntervalMs: 500 } // Auto flush quickly
    });

    const learningServiceA = new PatternLearningService(dbA, { model: 'gpt-mock', baseUrl: '', apiKey: '' } as GuardianAiConfig, mockOpenAI);

    // Setup Node B Services
    const chainB = new Blockchain('node-b');
    const nodeB = new P2PNetwork({
        enabled: true,
        network: { bootstrapNodes: ['127.0.0.1:16885'], listenPort: 16886, maxPeers: 10 },
        consensus: { minValidators: 1, approvalThreshold: 0.51, blockInterval: 60000 }
    } as DistributedLedgerConfig, chainB, new Consensus(chainB));

    // Node B only needs DB and Network to receive
    const dbB_Adapter = {
        addPatterns: async (patterns: any[]) => {
            console.log(`[Node B] Adapter received ${patterns.length} patterns to save.`);
            return await dbB.addPatterns(patterns);
        },
        save: async () => await dbB.save()
    };

    // Wire up Node B P2P to DB (Simulating index.ts logic)
    nodeB.on('blockAdded', async (block) => {
        console.log(`[Node B] Block received! Index: ${block.index}`);
        const patterns = block.patterns.map((p: any) => ({
            category: p.category, pattern: p.pattern, severity: p.severity
        }));
        await dbB_Adapter.addPatterns(patterns);
        await dbB_Adapter.save();
    });

    // Wire up Node A: Trigger -> Learning -> P2P (Simulating index.ts logic)
    triggerServiceA.on('patternsReady', async (patterns) => {
        console.log(`[Node A] Trigger fired for ${patterns.length} patterns.`);
        for (const p of patterns) {
            const result = await learningServiceA.learnFromEvent(p);
            if (result.success && result.pattern) {
                console.log(`[Node A] Learned: ${result.pattern}`);
                // Create Block
                const block = chainA.createBlock([{
                    pattern: result.pattern,
                    category: result.category!,
                    severity: 'high',
                    timestamp: Date.now()
                }], chainA.getLatestBlock().hash);

                if (chainA.addBlock(block)) {
                    console.log(`[Node A] Block mined. Broadcasting...`);
                    nodeA.broadcastNewBlock(block);
                }
            }
        }
    });

    try {
        // Start Networks
        await nodeA.start();
        await nodeB.start();
        console.log('✅ Networks started.');

        // Wait for P2P connection
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Simulate Attack on Node A
        const attackEvent: AttackEvent = {
            id: 'test-attack-1',
            timestamp: new Date(),
            source: 'ai', // Trigger type
            pattern: 'initial_attack_input',
            rawInput: 'initial_attack_input',
            severity: 'high',
            metadata: { ip: '1.2.3.4' }
        };

        console.log('🔥 Simulating Attack on Node A...');
        triggerServiceA.onAttackDetected(attackEvent);

        // Wait for processing and propagation (flushTimer is 500ms)
        console.log('⏳ Waiting for processing and propagation...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify Node B DB
        await dbB.load();
        const cats = dbB.getCategories();
        console.log('[Node B] Categories:', cats);

        if (cats.includes('integration_test_attack')) {
            const count = dbB.getCategoryCount('integration_test_attack');
            console.log(`[Node B] 'integration_test_attack' has ${count} patterns.`);
            if (count > 0) {
                console.log('✅ SUCCESS: Attack pattern detected on A, learned, and propagated to B!');
            } else {
                throw new Error('Pattern count is 0 on Node B');
            }
        } else {
            console.log('[Node B] DB Dump:', JSON.stringify(dbB.getInfo(), null, 2));
            throw new Error('Category not found on Node B');
        }

    } catch (err) {
        console.error('❌ FAILED:', err);
        process.exit(1);
    } finally {
        nodeA.stop();
        nodeB.stop();
        triggerServiceA.stop();
        // Cleanup
        if (fs.existsSync(dbPathA)) fs.unlinkSync(dbPathA);
        if (fs.existsSync(dbPathB)) fs.unlinkSync(dbPathB);
        process.exit(0);
    }
}

main().catch(console.error);
