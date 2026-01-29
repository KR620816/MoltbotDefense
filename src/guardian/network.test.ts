
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'net';
import { P2PNetwork } from '../../plugins/moltbot-plugin-guardian/src/p2p/network';
import { Blockchain } from '../../plugins/moltbot-plugin-guardian/src/p2p/chain';
import { Consensus } from '../../plugins/moltbot-plugin-guardian/src/p2p/consensus';
import { DistributedLedgerConfig } from '../../plugins/moltbot-plugin-guardian/src/config';

// Mock Config
const MOCK_CONFIG: DistributedLedgerConfig = {
    enabled: true,
    mode: 'p2p',
    network: {
        bootstrapNodes: [],
        listenPort: 6881,
        maxPeers: 10
    },
    consensus: {
        minValidators: 1,
        approvalThreshold: 0.5,
        blockInterval: 1000
    },
    sync: {
        onStartup: false,
        interval: 10000
    }
};

describe('P2PNetwork', () => {
    let node1: P2PNetwork;
    let node2: P2PNetwork;
    let mockBlockchain1: Blockchain;
    let mockBlockchain2: Blockchain;
    let mockConsensus1: Consensus;
    let mockConsensus2: Consensus;

    beforeEach(() => {
        // Mock Blockchain/Consensus
        mockBlockchain1 = {
            addBlock: vi.fn().mockReturnValue(true),
            createBlock: vi.fn(),
            getLatestBlock: vi.fn().mockReturnValue({ hash: 'genesis' }),
            chain: []
        } as any;

        mockConsensus1 = {
            resolveConflicts: vi.fn().mockReturnValue(false)
        } as any;

        mockBlockchain2 = { ...mockBlockchain1 } as any;
        mockConsensus2 = { ...mockConsensus1 } as any;

        const config1 = JSON.parse(JSON.stringify(MOCK_CONFIG));
        const config2 = JSON.parse(JSON.stringify(MOCK_CONFIG));
        config2.network.listenPort = 6882; // Different port

        node1 = new P2PNetwork(config1, mockBlockchain1, mockConsensus1);
        node2 = new P2PNetwork(config2, mockBlockchain2, mockConsensus2);
    });

    afterEach(() => {
        node1.stop();
        node2.stop();
    });

    it('should start server', async () => {
        await expect(node1.start()).resolves.not.toThrow();
    });

    it('should connect two nodes', async () => {
        await node1.start();
        await node2.start();

        await node1.connect('127.0.0.1:6882');

        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check peers (private property access for test)
        expect((node1 as any).peers.size).toBe(1);
        expect((node2 as any).peers.size).toBe(1);
    });

    it('should exchange NEW_BLOCK messages', async () => {
        await node1.start();
        await node2.start();
        await node1.connect('127.0.0.1:6882');
        await new Promise(resolve => setTimeout(resolve, 100));

        const promise = new Promise<void>(resolve => {
            node2.on('message', (msg) => {
                if (msg.type === 'NEW_BLOCK') {
                    // Check if blockchain.addBlock was called
                    // In handleMessage -> handleNewBlock -> blockchain.addBlock
                    expect(mockBlockchain2.addBlock).toHaveBeenCalled();
                    resolve();
                }
            });
        });

        // Broadcast a mock block
        node1.broadcastNewBlock({ index: 1, hash: 'abc' } as any);

        await expect(promise).resolves.not.toThrow();
    });
});
