/**
 * Consensus Mechanism
 * 
 * Implements Longest Chain Rule for conflict resolution.
 */

import { Blockchain, Block } from './chain';

export class Consensus {
    private blockchain: Blockchain;

    constructor(blockchain: Blockchain) {
        this.blockchain = blockchain;
    }

    /**
     * Resolve conflicts by choosing the longest valid chain from neighbors
     * @param inputChains Array of chains received from peers
     * @returns true if local chain was replaced, false otherwise
     */
    public resolveConflicts(inputChains: Block[][]): boolean {
        let newChain: Block[] | null = null;
        let maxLength = this.blockchain.chain.length;

        for (const chain of inputChains) {
            // Check if chain is longer
            if (chain.length > maxLength) {
                // Check if chain is valid
                if (this.blockchain.isChainValid(chain)) {
                    maxLength = chain.length;
                    newChain = chain;
                }
            }
        }

        if (newChain) {
            console.log('[Consensus] Replaced local chain with longer valid chain');
            this.blockchain.chain = newChain;
            return true;
        }

        return false;
    }
}
