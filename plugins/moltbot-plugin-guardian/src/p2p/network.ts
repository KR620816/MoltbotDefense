/**
 * P2P Network Implementation
 * 
 * Uses Node.js 'net' (TCP) for peer connections.
 * Handles node discovery, connection management, and message broadcasting.
 * Integrates Blockchain and Consensus for distributed pattern sharing.
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { DistributedLedgerConfig } from '../config';
import { Blockchain, Block } from './chain';
import { Consensus } from './consensus';
import { OfflineQueueService } from '../services/offline-queue';

export interface Peer {
    id: string; // ip:port
    socket: net.Socket;
    connected: boolean;
    lastSeen: number;
}

export interface P2PMessage {
    type: 'HANDSHAKE' | 'NEW_BLOCK' | 'NEW_TRANSACTION' | 'REQUEST_CHAIN' | 'RESPONSE_CHAIN';
    payload: any;
    senderId: string;
}

export class P2PNetwork extends EventEmitter {
    private server: net.Server | null = null;
    private peers: Map<string, Peer> = new Map();
    private config: DistributedLedgerConfig;
    private port: number;
    private blockchain: Blockchain;
    private consensus: Consensus;
    private offlineQueue?: OfflineQueueService | null;
    private db?: any; // Avoiding circular dependency for now, passed in optionally or we use an event listener

    constructor(
        config: DistributedLedgerConfig,
        blockchain: Blockchain,
        consensus: Consensus,
        offlineQueue?: OfflineQueueService | null
    ) {
        super();
        this.config = config;
        this.port = config.network.listenPort;
        this.blockchain = blockchain;
        this.consensus = consensus;
        this.offlineQueue = offlineQueue;
    }

    /**
     * Start the P2P server and connect to bootstrap nodes
     */
    async start(): Promise<void> {
        if (!this.config.enabled) return;

        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => this.handleConnection(socket));

            this.server.on('error', (err) => {
                console.error(`[P2P] Server error: ${err}`);
                reject(err);
            });

            this.server.listen(this.port, () => {
                console.log(`[P2P] Server listening on port ${this.port}`);
                this.connectToBootstrapNodes();
                resolve();
            });
        });
    }

    /**
     * Stop the P2P server
     */
    stop(): void {
        this.peers.forEach(peer => peer.socket.destroy());
        this.peers.clear();
        this.server?.close();
        this.server = null;
    }

    /**
     * Handle incoming connection
     */
    private handleConnection(socket: net.Socket, isInitiator: boolean = false): void {
        const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[P2P] New connection from ${remoteAddress}`);

        const peer: Peer = {
            id: remoteAddress,
            socket,
            connected: true,
            lastSeen: Date.now()
        };

        this.peers.set(remoteAddress, peer);

        socket.on('data', (data) => this.handleMessage(peer, data));
        socket.on('close', () => this.handleDisconnect(peer));
        socket.on('error', (err) => console.error(`[P2P] Socket error (${remoteAddress}): ${err.message}`));

        if (isInitiator) {
            this.sendMessage(peer, { type: 'HANDSHAKE', payload: { version: '1.0' }, senderId: 'local' }); // TODO: Real ID
            // Ask for chain
            this.sendMessage(peer, { type: 'REQUEST_CHAIN', payload: null, senderId: 'local' });
        }
    }

    /**
     * Connect to multiple peers
     */
    private connectToBootstrapNodes(): void {
        for (const node of this.config.network.bootstrapNodes) {
            this.connect(node);
        }
    }

    /**
     * Connect to a specific peer
     */
    async connect(address: string): Promise<void> {
        if (this.peers.has(address)) return;

        const [host, portStr] = address.split(':');
        const port = parseInt(portStr) || 6881;

        console.log(`[P2P] Connecting to ${host}:${port}...`);
        const socket = new net.Socket();

        socket.connect(port, host, () => {
            console.log(`[P2P] Connected to ${address}`);
            this.handleConnection(socket, true);
        });

        socket.on('error', (err) => {
            console.warn(`[P2P] Connection failed to ${address}: ${err.message}`);
        });
    }

    /**
     * Broadcast message to all peers
     */
    broadcast(message: P2PMessage): void {
        const data = JSON.stringify(message);
        let sentCount = 0;

        for (const peer of this.peers.values()) {
            if (peer.connected) {
                try {
                    // TODO: Better delimiting
                    peer.socket.write(data + '\n');
                    sentCount++;
                } catch (e) {
                    console.warn(`[P2P] Failed to send to ${peer.id}`);
                }
            }
        }

        // If we couldn't send to anyone (Offline), enqueue it
        if (sentCount === 0 && this.offlineQueue) {
            console.log(`[P2P] Network offline. Enqueuing message type: ${message.type}`);
            this.offlineQueue.enqueue(
                message.type === 'NEW_BLOCK' ? 'broadcast_block' : 'broadcast_pattern' as any, // Simple mapping
                message.payload
            ).catch(err => console.error(`[P2P] Queue error: ${err}`));
        }
    }

    private sendMessage(peer: Peer, message: P2PMessage): void {
        if (peer.connected) {
            peer.socket.write(JSON.stringify(message) + '\n');
        }
    }

    /**
     * Parse and handle incoming messages
     */
    private handleMessage(peer: Peer, data: Buffer): void {
        try {
            const messages = data.toString().split('\n');
            for (const msgStr of messages) {
                if (!msgStr.trim()) continue;

                const message = JSON.parse(msgStr) as P2PMessage;
                peer.lastSeen = Date.now();

                // Generic emit
                this.emit('message', message, peer);

                // Blockchain Logic
                switch (message.type) {
                    case 'REQUEST_CHAIN':
                        this.handleRequestChain(peer);
                        break;
                    case 'RESPONSE_CHAIN':
                        this.handleResponseChain(message.payload);
                        break;
                    case 'NEW_BLOCK':
                        this.handleNewBlock(message.payload);
                        break;
                    case 'NEW_TRANSACTION':
                        // TODO: Add to mempool or auto-mine
                        this.emit('transaction', message.payload);
                        break;
                }
            }
        } catch (error) {
            console.error(`[P2P] Message parse error: ${error}`);
            // peer.socket.destroy(); // Tolerant
        }
    }

    private handleDisconnect(peer: Peer): void {
        console.log(`[P2P] Peer disconnected: ${peer.id}`);
        this.peers.delete(peer.id);
    }

    // ========== Blockchain Handlers ==========

    private handleRequestChain(peer: Peer) {
        console.log(`[P2P] Sending chain to ${peer.id}`);
        this.sendMessage(peer, {
            type: 'RESPONSE_CHAIN',
            payload: this.blockchain.chain,
            senderId: 'local'
        });
    }

    private handleResponseChain(chain: Block[]) {
        console.log(`[P2P] Received chain of length ${chain.length}`);
        const replaced = this.consensus.resolveConflicts([chain]);
        if (replaced) {
            console.log('[P2P] Local chain replaced with longer chain');
        }
    }

    private handleNewBlock(block: Block) {
        console.log(`[P2P] Received new block index: ${block.index}`);
        const success = this.blockchain.addBlock(block);
        if (success) {
            console.log('[P2P] Block added to local chain');
            this.emit('blockAdded', block); // Emit event for external handlers (like DB sync)
            this.broadcastNewBlock(block); // Gossip protocol: re-broadcast valid blocks
        } else {
            console.warn('[P2P] Invalid block received');
        }
    }

    public broadcastNewBlock(block: Block) {
        this.broadcast({
            type: 'NEW_BLOCK',
            payload: block,
            senderId: 'local'
        });
    }
}
