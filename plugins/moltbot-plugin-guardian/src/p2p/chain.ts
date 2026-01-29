/**
 * Blockchain Implementation for Pattern Sharing
 */

import * as crypto from 'crypto';
// import { Pattern } from '../db/pattern-db';

export interface BlockPattern {
    pattern: string;
    category: string;
    severity: string;
    timestamp: number;
}

export interface Block {
    index: number;
    timestamp: number;
    patterns: BlockPattern[];
    previousHash: string;
    hash: string;
    validator: string; // Node ID
    signature: string;
}

export class Blockchain {
    public chain: Block[];
    private nodeId: string;

    constructor(nodeId: string) {
        this.nodeId = nodeId;
        this.chain = [this.createGenesisBlock()];
    }

    private createGenesisBlock(): Block {
        return {
            index: 0,
            timestamp: 1704067200000, // 2024-01-01
            patterns: [],
            previousHash: "0",
            hash: "genesis_hash",
            validator: "system",
            signature: ""
        };
    }

    public getLatestBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    public createBlock(patterns: BlockPattern[], previousHash: string): Block {
        const index = this.chain.length;
        const timestamp = Date.now();
        const hash = this.calculateHash(index, previousHash, timestamp, patterns);

        return {
            index,
            timestamp,
            patterns,
            previousHash,
            hash,
            validator: this.nodeId,
            signature: "" // TODO: Sign hash
        };
    }

    public addBlock(newBlock: Block): boolean {
        if (this.isValidNewBlock(newBlock, this.getLatestBlock())) {
            this.chain.push(newBlock);
            return true;
        }
        return false;
    }

    public calculateHash(index: number, previousHash: string, timestamp: number, patterns: BlockPattern[]): string {
        const data = index + previousHash + timestamp + JSON.stringify(patterns);
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    public isValidNewBlock(newBlock: Block, previousBlock: Block): boolean {
        if (previousBlock.index + 1 !== newBlock.index) {
            console.error('[Chain] Invalid index');
            return false;
        }
        if (previousBlock.hash !== newBlock.previousHash) {
            console.error('[Chain] Invalid previousHash');
            return false;
        }
        if (this.calculateHash(newBlock.index, newBlock.previousHash, newBlock.timestamp, newBlock.patterns) !== newBlock.hash) {
            console.error('[Chain] Invalid hash');
            return false;
        }
        return true;
    }

    public isChainValid(chain: Block[]): boolean {
        // Validate Genesis
        const genesis = chain[0];
        const properGenesis = this.createGenesisBlock();
        if (JSON.stringify(genesis) !== JSON.stringify(properGenesis)) {
            return false;
        }

        // Validate Links
        for (let i = 1; i < chain.length; i++) {
            if (!this.isValidNewBlock(chain[i], chain[i - 1])) {
                return false;
            }
        }
        return true;
    }
}
