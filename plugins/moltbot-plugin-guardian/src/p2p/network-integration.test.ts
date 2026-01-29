
import { describe, it, expect, vi, afterEach } from 'vitest';
import { P2PNetwork } from './network';
import { Blockchain } from './chain';
import { Consensus } from './consensus';
import { DistributedLedgerConfig } from '../config';

describe('P2P Network Integration', () => {
    let nodeA: P2PNetwork;
    let nodeB: P2PNetwork;
    const portA = 16881;
    const portB = 16882;

    const configA: DistributedLedgerConfig = {
        enabled: true,
        network: {
            bootstrapNodes: [],
            listenPort: portA,
            maxPeers: 10
        },
        consensus: {
            minValidators: 1,
            approvalThreshold: 0.51,
            blockInterval: 1000
        }
    };

    const configB: DistributedLedgerConfig = {
        enabled: true,
        network: {
            bootstrapNodes: [`127.0.0.1:${portA}`], // Connect to A
            listenPort: portB,
            maxPeers: 10
        },
        consensus: {
            minValidators: 1,
            approvalThreshold: 0.51,
            blockInterval: 1000
        }
    };

    afterEach(() => {
        nodeA?.stop();
        nodeB?.stop();
    });

    it('should propagate a block from Node A to Node B', async () => {
        // Setup Node A
        const chainA = new Blockchain('node-a');
        const consensusA = new Consensus(chainA);
        nodeA = new P2PNetwork(configA, chainA, consensusA);
        await nodeA.start();

        // Setup Node B
        const chainB = new Blockchain('node-b');
        const consensusB = new Consensus(chainB);
        nodeB = new P2PNetwork(configB, chainB, consensusB);
        await nodeB.start();

        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 500));

        // Create Block on A
        const newBlock = chainA.createBlock([{
            pattern: 'p2p_test_attack',
            category: 'test',
            severity: 'high',
            timestamp: Date.now()
        }], chainA.getLatestBlock().hash);

        chainA.addBlock(newBlock);

        // Spy on Node B's event listener
        const spyB = vi.fn();
        nodeB.on('blockAdded', spyB);

        // Broadcast from A
        nodeA.broadcastNewBlock(newBlock);

        // Wait for propagation
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify Node B received and added the block
        expect(chainB.chain.length).toBe(2);
        expect(chainB.getLatestBlock().hash).toBe(newBlock.hash);
        expect(spyB).toHaveBeenCalledWith(expect.objectContaining({
            index: newBlock.index,
            hash: newBlock.hash
        }));
    });
});
