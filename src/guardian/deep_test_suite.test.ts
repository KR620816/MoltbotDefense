
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { PatternDB } from '../../plugins/moltbot-plugin-guardian/src/db/pattern-db';
import { PatternLearningService } from '../../plugins/moltbot-plugin-guardian/src/services/pattern-learning';
import { P2PNetwork } from '../../plugins/moltbot-plugin-guardian/src/p2p/network';
import { Blockchain } from '../../plugins/moltbot-plugin-guardian/src/p2p/chain';
import { Consensus } from '../../plugins/moltbot-plugin-guardian/src/p2p/consensus';
import { DistributedLedgerConfig } from '../../plugins/moltbot-plugin-guardian/src/config';

// === Helper Config ===
const TEST_DIR = path.join(__dirname, '../../test-temp');
if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

const getTestDB = (name: string) => new PatternDB(path.join(TEST_DIR, `deep_test_${name}_${Date.now()}.json`));

// Mock Config
const mockAiProvider = {
    provider: 'openai-compatible' as const,
    model: 'gpt-4',
    apiKey: 'sk-test',
    baseUrl: 'http://localhost',
    maxTokens: 100,
    timeoutMs: 1000,
    temperature: 0.7
};

// Mock OpenAI Helper
const createMockOpenAI = (responsePayload: any) => ({
    chat: {
        completions: {
            create: vi.fn().mockResolvedValue({
                choices: [{
                    message: {
                        content: JSON.stringify(responsePayload)
                    }
                }]
            })
        }
    }
});

// P2P Config Helper
const getP2PConfig = (port: number): DistributedLedgerConfig => ({
    enabled: true,
    mode: 'p2p',
    network: { bootstrapNodes: [], listenPort: port, maxPeers: 10 },
    consensus: { minValidators: 1, approvalThreshold: 0.5, blockInterval: 1000 },
    sync: { onStartup: true, interval: 5000 }
});

describe('Guardian Deep Test Suite (10 Scenarios)', () => {
    let db: PatternDB;
    let learningService: PatternLearningService;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // === Scenarios 1-4: Core Logic ===

    it('Scenario 1: [Core] Detect SQL Injection', async () => {
        db = getTestDB('s1');
        await db.load();
        await db.addPattern('sql_injection', 'UNION SELECT');

        const input = "UNION SELECT * FROM users";
        // Simulate Matcher Logic (Input contains Pattern)
        const allPatterns = db.getAllPatterns();
        const matched = allPatterns.filter(p => input.toLowerCase().includes(p.toLowerCase()));

        expect(matched.length).toBeGreaterThan(0);
        expect(matched[0]).toBe('UNION SELECT');
    });

    it('Scenario 2: [AI] Learn New Attack Pattern', async () => {
        db = getTestDB('s2');

        // Mock OpenAI Response
        const mockOpenAI = createMockOpenAI({
            category: 'sql_injection',
            normalized_pattern: 'UNION SELECT',
            severity: 'high'
        });

        learningService = new PatternLearningService(db, mockAiProvider, mockOpenAI as any);

        const event = {
            id: 'evt-1', type: 'web',
            payload: { ip: '1.2.3.4', rawData: 'uNiOn/**/sElEcT' },
            timestamp: new Date(), severity: 'high' as const,
            source: 'unknown' as const,
            rawInput: 'uNiOn/**/sElEcT',
            metadata: {},
            pattern: 'uNiOn/**/sElEcT'
        };

        const result = await learningService.learnFromEvent(event);

        expect(result.success).toBe(true);
        expect(result.pattern).toBe('UNION SELECT');
        expect(db.isDuplicate('UNION SELECT')).toBe(true);
    });

    it('Scenario 3: [DB] Persistence & Deduplication', async () => {
        const dbPath = path.join(TEST_DIR, `s3_persist_${Date.now()}.json`);
        let db1 = new PatternDB(dbPath);
        await db1.addPattern('xss', '<script>alert(1)</script>');
        await db1.save();

        let db2 = new PatternDB(dbPath);
        await db2.load();
        expect(db2.getTotalCount()).toBe(1);

        const result = await db2.addPattern('xss', '<script>alert(1)</script>');
        expect(result.success).toBe(false);
        expect(result.isDuplicate).toBe(true);
    });

    it('Scenario 4: [Perf] High Concurrency Burst (1000 reqs)', async () => {
        db = getTestDB('s4');

        const mockOpenAI = {
            chat: {
                completions: {
                    create: vi.fn().mockImplementation(async (args) => {
                        const input = args.messages[1].content;
                        return {
                            choices: [{
                                message: {
                                    content: JSON.stringify({
                                        category: 'burst_attack',
                                        normalized_pattern: input,
                                        severity: 'medium'
                                    })
                                }
                            }]
                        };
                    })
                }
            }
        };

        learningService = new PatternLearningService(db, mockAiProvider, mockOpenAI as any);

        const requests = Array(1000).fill(0).map((_, i) => ({
            id: `burst-${i}`, type: 'web', payload: { rawData: `attack_${i}` },
            timestamp: new Date(), severity: 'medium' as const,
            source: 'heuristic' as const,
            rawInput: `attack_${i}`,
            metadata: {},
            pattern: `attack_${i}`
        }));

        const start = Date.now();
        await Promise.all(requests.map(r => learningService.learnFromEvent(r)));
        const duration = Date.now() - start;

        console.log(`[Perf] Processed 1000 requests in ${duration}ms`);
        expect(duration).toBeLessThan(30000);
        expect(db.getTotalCount()).toBe(1000);
    });

    // === Scenarios 5-9: P2P Network ===

    describe('P2P Scenarios', () => {
        let nodeA: P2PNetwork;
        let nodeB: P2PNetwork;
        let chainA: Blockchain;
        let chainB: Blockchain;
        const portA = 7001;
        const portB = 7002;

        beforeEach(async () => {
            chainA = new Blockchain('node-a');
            chainB = new Blockchain('node-b');
            const consA = new Consensus(chainA);
            const consB = new Consensus(chainB);

            nodeA = new P2PNetwork(getP2PConfig(portA), chainA, consA);
            nodeB = new P2PNetwork(getP2PConfig(portB), chainB, consB);

            await nodeA.start();
            await nodeB.start();
        });

        afterEach(() => {
            nodeA.stop();
            nodeB.stop();
        });

        it('Scenario 5: [P2P] Link & Handshake', async () => {
            await nodeA.connect(`127.0.0.1:${portB}`);
            await new Promise(r => setTimeout(r, 200));
            expect((nodeA as any).peers.size).toBe(1);
        });

        it('Scenario 6: [P2P] Block Propagation', async () => {
            await nodeA.connect(`127.0.0.1:${portB}`);
            await new Promise(r => setTimeout(r, 200));

            const block = chainA.createBlock(
                [{ pattern: 'p1', category: 'sql', severity: 'high', timestamp: Date.now() }],
                chainA.getLatestBlock().hash
            );
            chainA.addBlock(block);

            nodeA.broadcastNewBlock(block);
            await new Promise(r => setTimeout(r, 500));

            expect(chainB.chain.length).toBe(2);
            expect(chainB.getLatestBlock().hash).toBe(block.hash);
        });

        it('Scenario 7: [Sec] Invalid Block Rejection', async () => {
            await nodeA.connect(`127.0.0.1:${portB}`);
            await new Promise(r => setTimeout(r, 200));

            const block = chainA.createBlock([], chainA.getLatestBlock().hash);
            block.hash = 'fake_hash';

            nodeA.broadcastNewBlock(block);
            await new Promise(r => setTimeout(r, 500));

            expect(chainB.chain.length).toBe(1);
        });

        it('Scenario 8: [Consensus] Fork Resolution', async () => {
            await nodeA.connect(`127.0.0.1:${portB}`);
            await new Promise(r => setTimeout(r, 200));

            const b1 = chainA.createBlock([], chainA.getLatestBlock().hash);
            chainA.addBlock(b1);
            const b2 = chainA.createBlock([], b1.hash);
            chainA.addBlock(b2);

            const b1_prime = chainB.createBlock([], chainB.getLatestBlock().hash);
            chainB.addBlock(b1_prime);

            nodeB.broadcast({ type: 'REQUEST_CHAIN', payload: null, senderId: 'node-b' });

            await new Promise(r => setTimeout(r, 500));

            expect(chainB.chain.length).toBe(3);
            expect(chainB.getLatestBlock().hash).toBe(b2.hash);
        });

        it('Scenario 9: [Recovery] Sync after Restart', async () => {
            const b1 = chainA.createBlock([], chainA.getLatestBlock().hash);
            chainA.addBlock(b1);

            await nodeB.connect(`127.0.0.1:${portA}`);
            await new Promise(r => setTimeout(r, 500));

            expect(chainB.chain.length).toBe(2);
        });
    });

    it('Scenario 10: [Edge] Fuzzing Input', async () => {
        const server = net.createServer();
        const port = 7010;
        await new Promise<void>(r => server.listen(port, r));

        const config = getP2PConfig(7011);
        const chain = new Blockchain('target');
        const node = new P2PNetwork(config, chain, new Consensus(chain));
        await node.start();

        const socket = new net.Socket();
        socket.connect(7011, '127.0.0.1', () => {
            socket.write('GARBAGE_DATA_NOT_JSON\n');
        });

        await new Promise(r => setTimeout(r, 500));

        const client2 = new net.Socket();
        const connectPromise = new Promise((resolve, reject) => {
            client2.connect(7011, '127.0.0.1', () => resolve(true));
            client2.on('error', reject);
        });

        await expect(connectPromise).resolves.toBe(true);

        node.stop();
        server.close();
        socket.destroy();
        client2.destroy();
    });
});
