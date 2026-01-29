
import { describe, it, expect, beforeEach } from 'vitest';
import { Consensus } from '../../plugins/moltbot-plugin-guardian/src/p2p/consensus';
import { Blockchain, BlockPattern } from '../../plugins/moltbot-plugin-guardian/src/p2p/chain';

describe('Consensus', () => {
    let blockchain1: Blockchain;
    let blockchain2: Blockchain;
    let consensus: Consensus;

    beforeEach(() => {
        blockchain1 = new Blockchain('node-1');
        blockchain2 = new Blockchain('node-2'); // Should have same genesis
        consensus = new Consensus(blockchain1);
    });

    it('should replace chain with longer valid chain', () => {
        // Add block to chain2
        const p1: BlockPattern[] = [{ pattern: 'p1', category: 'x', severity: 'l', timestamp: 1 }];
        const b1 = blockchain2.createBlock(p1, blockchain2.getLatestBlock().hash);
        blockchain2.addBlock(b1); // chain2 length = 2

        // Determine: chain1 (len 1) vs chain2 (len 2)
        const result = consensus.resolveConflicts([blockchain2.chain]);

        expect(result).toBe(true);
        expect(blockchain1.chain.length).toBe(2);
        expect(blockchain1.chain).toEqual(blockchain2.chain);
    });

    it('should NOT replace chain with shorter or equal chain', () => {
        // chain2 same length
        const result = consensus.resolveConflicts([blockchain2.chain]);
        expect(result).toBe(false);
    });

    it('should NOT replace chain with longer INVALID chain', () => {
        // Add block to chain2
        const p1: BlockPattern[] = [{ pattern: 'p1', category: 'x', severity: 'l', timestamp: 1 }];
        const b1 = blockchain2.createBlock(p1, blockchain2.getLatestBlock().hash);
        blockchain2.addBlock(b1);

        // Tamper chain2
        blockchain2.chain[1].patterns[0].pattern = 'malicious';
        // Now chain2 is invalid (hash mismatch)

        const result = consensus.resolveConflicts([blockchain2.chain]);
        expect(result).toBe(false);
        expect(blockchain1.chain.length).toBe(1);
    });
});
