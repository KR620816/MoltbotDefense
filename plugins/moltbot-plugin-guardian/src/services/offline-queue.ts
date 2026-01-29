
import * as fs from 'fs/promises';
import * as path from 'path';

export interface QueueItem {
    id: string;
    type: 'broadcast_block' | 'broadcast_pattern';
    payload: any;
    timestamp: number;
    retryCount: number;
}

export class OfflineQueueService {
    private queue: QueueItem[] = [];
    private filePath: string;
    private isProcessing: boolean = false;
    private maxRetries: number = 50; // Keep trying for a long time

    constructor(dataDir: string) {
        this.filePath = path.join(dataDir, 'offline-queue.json');
    }

    /**
     * Initialize loading from disk
     */
    async initialize(): Promise<void> {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8');
            this.queue = JSON.parse(data);
            console.log(`[OfflineQueue] Loaded ${this.queue.length} items from disk.`);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.error(`[OfflineQueue] Failed to load queue: ${error.message}`);
            }
            // If file doesn't exist, start empty
            this.queue = [];
        }
    }

    /**
     * Add item to queue and save
     */
    async enqueue(type: QueueItem['type'], payload: any): Promise<void> {
        const item: QueueItem = {
            id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
            type,
            payload,
            timestamp: Date.now(),
            retryCount: 0
        };

        this.queue.push(item);
        console.log(`[OfflineQueue] Enqueued item: ${type} (Total: ${this.queue.length})`);
        await this.save();
    }

    /**
     * Process queue with a handler function
     * If handler returns true, item is removed. If false/throws, item stays.
     */
    async process(handler: (item: QueueItem) => Promise<boolean>): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        console.log(`[OfflineQueue] Processing ${this.queue.length} items...`);

        const remainingQueue: QueueItem[] = [];
        let processedCount = 0;

        for (const item of this.queue) {
            try {
                const success = await handler(item);
                if (success) {
                    process.stdout.write('.'); // Progress dot
                    processedCount++;
                } else {
                    item.retryCount++;
                    remainingQueue.push(item);
                }
            } catch (err) {
                console.error(`[OfflineQueue] Error processing item ${item.id}:`, err);
                item.retryCount++;
                remainingQueue.push(item);
            }
        }

        if (processedCount > 0) console.log(''); // Newline
        console.log(`[OfflineQueue] Processed ${processedCount}, Remaining ${remainingQueue.length}`);

        this.queue = remainingQueue;
        await this.save();
        this.isProcessing = false;
    }

    async save(): Promise<void> {
        const tmpPath = `${this.filePath}.tmp`;
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            // Write to tmp file first
            await fs.writeFile(tmpPath, JSON.stringify(this.queue, null, 2));
            // Rename tmp file to actual file (Atomic operation)
            await fs.rename(tmpPath, this.filePath);
        } catch (error) {
            console.error(`[OfflineQueue] Failed to save queue:`, error);
            // Try to cleanup tmp if exists
            try { await fs.unlink(tmpPath); } catch { }
        }
    }

    getQueueLength(): number {
        return this.queue.length;
    }
}
