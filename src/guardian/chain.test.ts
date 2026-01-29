
import { describe, it, expect, beforeEach } from 'vitest';
import { Blockchain, BlockPattern } from '../../plugins/moltbot-plugin-guardian/src/p2p/chain';

describe('Blockchain', () => {
    let blockchain: Blockchain;
    const nodeId = 'node-test-1';

    beforeEach(() => {
        blockchain = new Blockchain(nodeId);
    });

    it('should start with genesis block', () => {
        expect(blockchain.chain.length).toBe(1);
        const genesis = blockchain.chain[0];
        expect(genesis.index).toBe(0);
        expect(genesis.previousHash).toBe('0');
        expect(genesis.hash).toBe('genesis_hash');
    });

    it('should add a new block', () => {
        const patterns: BlockPattern[] = [
            { pattern: 'test_p1', category: 'sql', severity: 'high', timestamp: Date.now() }
        ];

        const latest = blockchain.getLatestBlock();
        const newBlock = blockchain.createBlock(patterns, latest.hash);
        const result = blockchain.addBlock(newBlock);

        expect(result).toBe(true);
        expect(blockchain.chain.length).toBe(2);
        expect(blockchain.chain[1].patterns).toEqual(patterns);
        expect(blockchain.chain[1].previousHash).toBe(latest.hash);
    });

    it('should reject invalid previous hash', () => {
        const patterns: BlockPattern[] = [];
        const latest = blockchain.getLatestBlock();
        const newBlock = blockchain.createBlock(patterns, 'wrong_hash');

        const result = blockchain.addBlock(newBlock);
        expect(result).toBe(false);
    });

    it('should reject invalid index', () => {
        const patterns: BlockPattern[] = [];
        const latest = blockchain.getLatestBlock();
        const newBlock = blockchain.createBlock(patterns, latest.hash);
        newBlock.index = 100; // Tamper index

        const result = blockchain.addBlock(newBlock);
        expect(result).toBe(false);
    });

    it('should reject tampered data (immutability)', () => {
        const patterns: BlockPattern[] = [
            { pattern: 'valid', category: 'xss', severity: 'low', timestamp: 123 }
        ];
        const latest = blockchain.getLatestBlock();
        const newBlock = blockchain.createBlock(patterns, latest.hash);

        // Tamper patterns after creation
        newBlock.patterns[0].pattern = 'malicious';

        // Hash will not match
        const result = blockchain.addBlock(newBlock);
        expect(result).toBe(false);
    });

    it('should modify chain validity check', () => {
        // Add valid block
        const p1: BlockPattern[] = [{ pattern: 'p1', category: 'x', severity: 'low', timestamp: 1 }];
        const b1 = blockchain.createBlock(p1, blockchain.getLatestBlock().hash);
        blockchain.addBlock(b1);

        expect(blockchain.isChainValid(blockchain.chain)).toBe(true);

        // Tamper with the chain
        blockchain.chain[1].patterns[0].pattern = 'hacked';
        expect(blockchain.isChainValid(blockchain.chain)).toBe(false);
    });
});
