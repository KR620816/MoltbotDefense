
import { P2PNetwork } from '../src/p2p/network.js';
import { Blockchain } from '../src/p2p/chain.js';
import { Consensus } from '../src/p2p/consensus.js';
import { DistributedLedgerConfig } from '../src/config.js';

async function main() {
    console.log('Starting P2P Verification...');

    const portA = 16881;
    const portB = 16882;

    // Node A Config
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

    // Node B Config
    const configB: DistributedLedgerConfig = {
        enabled: true,
        network: {
            bootstrapNodes: [`127.0.0.1:${portA}`],
            listenPort: portB,
            maxPeers: 10
        },
        consensus: {
            minValidators: 1,
            approvalThreshold: 0.51,
            blockInterval: 1000
        }
    };

    // Setup Node A
    const chainA = new Blockchain('node-a');
    const consensusA = new Consensus(chainA);
    const nodeA = new P2PNetwork(configA, chainA, consensusA);

    // Setup Node B
    const chainB = new Blockchain('node-b');
    const consensusB = new Consensus(chainB);
    const nodeB = new P2PNetwork(configB, chainB, consensusB);

    try {
        await nodeA.start();
        console.log('Node A started.');

        await nodeB.start();
        console.log('Node B started.');

        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create Block on A
        console.log('Creating block on Node A...');
        const newBlock = chainA.createBlock([{
            pattern: 'p2p_test_attack',
            category: 'test',
            severity: 'high',
            timestamp: Date.now()
        }], chainA.getLatestBlock().hash);

        chainA.addBlock(newBlock);
        console.log(`Block created with hash: ${newBlock.hash}`);

        // Spy logic: Wait for B to receive
        const receivedPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for block')), 5000);
            nodeB.on('message', (msg) => {
                if (msg.type === 'NEW_BLOCK') {
                    console.log('Node B received NEW_BLOCK message');
                }
            });
            // We listen to the internal event logic or just check chain periodically
            // Since I added 'blockAdded' event in the code earlier, I can use it!
            nodeB.on('blockAdded', (block) => {
                console.log(`Node B added block: ${block.hash}`);
                if (block.hash === newBlock.hash) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        // Broadcast
        console.log('Broadcasting block from Node A...');
        nodeA.broadcastNewBlock(newBlock);

        await receivedPromise;
        console.log('✅ SUCCESS: Node B received and added the block.');

    } catch (err) {
        console.error('❌ FAILED:', err);
        process.exit(1);
    } finally {
        nodeA.stop();
        nodeB.stop();
        process.exit(0);
    }
}

main().catch(console.error);
