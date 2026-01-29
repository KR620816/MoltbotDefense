/**
 * Guardian Plugin - Main Entry Point
 *
 * 4-stage security validation pipeline with ON/OFF toggle
 */

import type { MoltbotPluginApi } from "moltbot/plugin-sdk";
import { GuardianPipe } from "./guardian-pipe.js";
import { createBeforeToolCallHook } from "./hooks/before-tool-call.js";
import { registerGuardianCommands, isGuardianEnabled } from "./commands/guardian-cmd.js";
import { registerGuardianHttpRoutes } from "./http-routes/index.js";
import { mergeConfig, type GuardianConfig } from "./config.js";
import * as path from "path";
import * as crypto from "crypto";
import { getPatternDB } from "./db/pattern-db.js";
import { createAttackTriggerService, type AttackEvent } from "./services/attack-trigger.js";
import { PatternLearningService } from "./services/pattern-learning.js";
import { PatternDiscoveryService } from "./services/pattern-discovery.js";
import { KillSwitchService } from "./services/kill-switch.js";
import { OfflineQueueService } from "./services/offline-queue.js";
import { DirectivesService } from "./services/directives.js";
// [REMOVED] PatternSyncService
import { P2PNetwork } from "./p2p/network.js";
import { Blockchain } from "./p2p/chain.js";
import { Consensus } from "./p2p/consensus.js";

// Runtime state
let guardianPipe: GuardianPipe | null = null;
let p2pNetwork: P2PNetwork | null = null;

export default function register(api: MoltbotPluginApi): void {
    const userConfig = api.pluginConfig as Partial<GuardianConfig> | undefined;
    const config = mergeConfig(userConfig);

    // Initialize Core Services
    const db = getPatternDB();

    // Initialize Services
    // Initialize Services
    const triggerService = createAttackTriggerService(config.attackTrigger);
    const learningService = new PatternLearningService(db, config.guardianAi);
    const discoveryService = new PatternDiscoveryService(db, learningService, config.autoDiscovery, config.guardianAi);
    const killSwitchService = new KillSwitchService(config.killSwitch, triggerService);

    // Initialize Directives Service
    // We assume rootDir is accessible, maybe from api.pluginConfig or we assume cwd
    // api.pluginConfig?.rootDir? For now let's assume Process CWD if not provided, or relative to this file
    const rootDir = process.cwd(); // CAUTION: this might be where moltbot runs
    const directivesService = new DirectivesService(path.join(rootDir, 'plugins', 'moltbot-plugin-guardian'));

    // Initialize P2P Blockchain
    const nodeId = crypto.randomUUID(); // TODO: Persist Node ID
    const blockchain = new Blockchain(nodeId);
    const consensus = new Consensus(blockchain);

    // Initialize Offline Queue
    // Fix: Ensure we get a string path, defaulting to ./data if undefined or not a string
    const stateDir = (typeof api.pluginConfig === 'object' && api.pluginConfig !== null && 'stateDir' in api.pluginConfig
        ? (api.pluginConfig as any).stateDir
        : './data');

    const offlineQueue = new OfflineQueueService(path.resolve(stateDir as string));

    const p2pNetwork = new P2PNetwork(config.distributedLedger, blockchain, consensus, offlineQueue);

    // Wire up events: Trigger -> Learning -> Sync (API & P2P)
    triggerService.on('patternsReady', async (patterns: AttackEvent[]) => {
        api.logger.info(`[guardian] Learning from ${patterns.length} triggered patterns...`);
        for (const p of patterns) {
            const result = await learningService.learnFromEvent(p);
            if (result.success && result.category && result.pattern) {
                api.logger.info(`[guardian] Learned new pattern: ${result.category}`);

                // 1. [REMOVED] API Push

                // 2. Sync: Propagate block via P2P
                if (config.distributedLedger.enabled) {
                    const block = blockchain.createBlock([{
                        pattern: result.pattern,
                        category: result.category,
                        severity: p.severity,
                        timestamp: Date.now()
                    }], blockchain.getLatestBlock().hash);

                    if (blockchain.addBlock(block)) {
                        p2pNetwork?.broadcastNewBlock(block);
                        api.logger.info(`[guardian] P2P Block broadcasted: index ${block.index}`);

                        // NEW: Directly add to local DB as well (since we mined it)
                        // Note: PatternLearningService already saved it, so strictly speaking
                        // we don't need to re-add it from the block, but it confirms consistency.
                    }
                }
            }
        }
    });

    // Wire up P2P Events
    p2pNetwork?.on('message', (msg, peer) => {
        api.logger?.debug?.(`[guardian] P2P Message from ${peer.id}: ${msg.type}`);
    });

    // Sync: P2P Block -> Local DB
    p2pNetwork?.on('blockAdded', async (block: any) => {
        api.logger.info(`[guardian] Syncing block ${block.index} to PatternDB...`);
        const patterns = block.patterns.map((p: any) => ({
            category: p.category,
            pattern: p.pattern,
            severity: p.severity
        }));

        const result = await db.addPatterns(patterns as any);
        if (result.added > 0) {
            await db.save();
            api.logger.info(`[guardian] Synced ${result.added} patterns from P2P block`);
        }
    });

    // Initialize Guardian Pipe
    guardianPipe = new GuardianPipe(config, api.logger);
    guardianPipe.setServices(triggerService, directivesService);

    // Hook: before_tool_call
    api.on(
        "before_tool_call",
        createBeforeToolCallHook(guardianPipe, config, () => isGuardianEnabled()),
        { priority: 100 }
    );

    // Commands
    registerGuardianCommands(api, config);

    // HTTP Routes
    registerGuardianHttpRoutes(api, guardianPipe);

    // Service: Guardian Background Services
    api.registerService({
        id: "guardian-services",
        start: async (ctx) => {
            api.logger.info("[guardian] Starting services");
            await guardianPipe?.initializeDatabase(ctx.stateDir);

            await guardianPipe?.initializeDatabase(ctx.stateDir);

            // [REMOVED] syncService.start()

            // Start P2P
            if (config.distributedLedger.enabled) {
                api.logger.info("[guardian] Starting P2P Network...");
                p2pNetwork?.start().then(() => {
                    api.logger.info("[guardian] P2P Network started");
                }).catch(err => {
                    api.logger.error(`[guardian] P2P Start failed: ${err}`);
                });
            }

            // Start Auto Discovery if enabled (non-blocking)
            if (config.autoDiscovery.enabled) {
                discoveryService.startDiscovery().then(result => {
                    api.logger.info(`[guardian] Discovery finished: Found ${result.discovered} patterns`);
                }).catch(err => {
                    api.logger.error(`[guardian] Discovery failed: ${err}`);
                });
            }

            // Load Directives
            await directivesService.loadDirectives();
            api.logger.info("[guardian] Directives loaded");

            // Start Offline Queue Initialization
            offlineQueue.initialize().then(() => {
                api.logger.info("[guardian] Offline Queue initialized");
            });

            // Start Kill Switch Service
            if (config.killSwitch.enabled) {
                killSwitchService.start();
                api.logger.info("[guardian] Kill Switch Service started");
            }
        },
        stop: async () => {
            api.logger.info("[guardian] Stopping services");
            guardianPipe?.close();
            triggerService.stop();
            discoveryService.stop();
            triggerService.stop();
            discoveryService.stop();
            // [REMOVED] syncService.stop();
            p2pNetwork?.stop();
            p2pNetwork?.stop();
        },
    });

    api.logger.info("[guardian] Plugin registered successfully");
    api.logger.info(`[guardian] Enabled: ${config.enabled}`);
    api.logger.info(`[guardian] P2P Enabled: ${config.distributedLedger.enabled}`);
}

export { GuardianPipe } from "./guardian-pipe.js";
export type { GuardianConfig } from "./config.js";
