
import { PatternDiscoveryService } from '../src/services/pattern-discovery.js';
import { PatternLearningService } from '../src/services/pattern-learning.js';
import { PatternDB } from '../src/db/pattern-db.js';
import { ExecutionIsolationService } from '../src/services/execution-isolation.js';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

// Mock DB
const mockDb = {
    getCategories: () => ['sql_injection'],
    getCategory: () => ({ patterns: [] }),
    addPatterns: async () => ({ added: 1 }),
    save: async () => { }
} as any;

// Mock AI Client
const mockAiClient = {
    chat: {
        completions: {
            create: async () => {
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                pattern: "SELECT * FROM users WHERE admin = '1' OR '1'='1' --",
                                category: "sql_injection",
                                severity: "high",
                                description: "Classic SQLi"
                            })
                        }
                    }]
                };
            }
        }
    }
} as any;

// Mock Learning Service
const mockLearningService = {
    learnFromEvent: async (evt: any) => {
        console.log(`\n[Test] Learning Service received pattern: ${evt.pattern}`);
        console.log(`[Test] Metadata:`, JSON.stringify(evt.metadata, null, 2));
        return { success: true, category: 'sql_injection', pattern: evt.pattern };
    }
} as any;

const config = {
    enabled: true,
    targetCount: 1, // Stop after 1
    timeoutMinutes: 1,
    runOnStartup: false
};

const aiConfig = {
    model: 'test-model',
    baseUrl: '',
    apiKey: '',
    timeoutMs: 1000,
    provider: 'openai-compatible' as const,
    maxTokens: 100
};

async function main() {
    console.log('🚀 Starting Pattern Discovery + Execution Integration Test...');

    const service = new PatternDiscoveryService(
        mockDb,
        mockLearningService,
        config,
        aiConfig,
        mockAiClient
    );

    // Override loop delay to be fast
    service.delayLoopMs = 10;

    console.log('[Test] Starting discovery...');
    const result = await service.startDiscovery();

    console.log('\n--- Test Results ---');
    console.log('Total Requested:', result.totalRequested);
    console.log('Discovered:', result.discovered);
    console.log('Reason:', result.reason);

    if (result.discovered > 0) {
        console.log('✅ SUCCESS: Pattern was discovered and processed.');
        // We rely on the logs from mockLearningService to confirm execution metadata was present
    } else {
        console.error('❌ FAILED: No patterns discovered.');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('❌ Test Error:', err);
    process.exit(1);
});
