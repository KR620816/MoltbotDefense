/**
 * Guardian Plugin Configuration Types
 */

export interface GuardianStagesConfig {
    regex: boolean;
    patternDb: boolean;
    guardianAi: boolean;
    jsonParser: boolean;
}

export interface GuardianAiConfig {
    provider: "anthropic" | "openai-compatible";
    baseUrl: string;
    model: string;
    apiKey: string;
    maxTokens: number;
    timeoutMs: number;
}

export interface GuardianLoggingConfig {
    enabled: boolean;
    retentionDays: number;
}

// ========== 멀티방어전략4 신규 설정 ==========

export interface AutoDiscoveryConfig {
    enabled: boolean;
    targetCount: number;
    timeoutMinutes: number;
    runOnStartup: boolean;
    model?: string;
}

export interface AttackTriggerTriggersConfig {
    aiBlock: boolean;
    highAnomaly: boolean;
    unknownPattern: boolean;
    repeatedAttack: boolean;
}

export interface AttackTriggerThresholdsConfig {
    anomalyScore: number;
    repeatCount: number;
    repeatWindowMs: number;
}

export interface AttackTriggerConfig {
    enabled: boolean;
    triggers: AttackTriggerTriggersConfig;
    thresholds: AttackTriggerThresholdsConfig;
    autoSave: {
        enabled: boolean;
        batchSize: number;
        flushIntervalMs: number;
    };
}

// [REMOVED] PropagationConfig related interfaces
export interface KillSwitchConfig {
    enabled: boolean;
    autoAction: 'pause' | 'stop' | 'none';
}

export interface DistributedLedgerNetworkConfig {
    bootstrapNodes: string[];
    listenPort: number;
    maxPeers: number;
}

export interface DistributedLedgerConsensusConfig {
    minValidators: number;
    approvalThreshold: number;
    blockInterval: number;
}

export interface DistributedLedgerConfig {
    enabled: boolean;
    network: DistributedLedgerNetworkConfig;
    consensus: DistributedLedgerConsensusConfig;
}

export interface GuardianConfig {
    enabled: boolean;
    stages: GuardianStagesConfig;
    guardianAi: GuardianAiConfig;
    blockedTools: string[];
    logging: GuardianLoggingConfig;
    autoDiscovery: AutoDiscoveryConfig;
    attackTrigger: AttackTriggerConfig;
    killSwitch: KillSwitchConfig;
    distributedLedger: DistributedLedgerConfig;
}

export const DEFAULT_CONFIG: GuardianConfig = {
    enabled: true,
    stages: {
        regex: true,
        patternDb: true,
        guardianAi: true,
        jsonParser: true,
    },
    guardianAi: {
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "local-model",
        apiKey: "lm-studio",
        maxTokens: 100,
        timeoutMs: 5000,
    },
    blockedTools: ["exec", "write", "browser", "send_email"],
    logging: {
        enabled: true,
        retentionDays: 30,
    },
    autoDiscovery: {
        enabled: false,
        targetCount: 10,
        timeoutMinutes: 10,
        runOnStartup: true,
    },
    attackTrigger: {
        enabled: true,
        triggers: {
            aiBlock: true,
            highAnomaly: true,
            unknownPattern: true,
            repeatedAttack: true,
        },
        thresholds: {
            anomalyScore: 0.8,
            repeatCount: 3,
            repeatWindowMs: 60000,
        },
        autoSave: {
            enabled: true,
            batchSize: 10,
            flushIntervalMs: 30000,
        },
    },
    killSwitch: {
        enabled: true,
        autoAction: 'pause'
    },
    distributedLedger: {
        enabled: true,
        network: {
            bootstrapNodes: [],
            listenPort: 6881,
            maxPeers: 50,
        },
        consensus: {
            minValidators: 1,
            approvalThreshold: 0.51,
            blockInterval: 60000,
        }
    },
};

export function mergeConfig(userConfig?: Partial<GuardianConfig>): GuardianConfig {
    if (!userConfig) return DEFAULT_CONFIG;

    return {
        enabled: userConfig.enabled ?? DEFAULT_CONFIG.enabled,
        stages: {
            ...DEFAULT_CONFIG.stages,
            ...userConfig.stages,
        },
        guardianAi: {
            ...DEFAULT_CONFIG.guardianAi,
            ...userConfig.guardianAi,
        },
        blockedTools: userConfig.blockedTools ?? DEFAULT_CONFIG.blockedTools,
        logging: {
            ...DEFAULT_CONFIG.logging,
            ...userConfig.logging,
        },
        autoDiscovery: {
            ...DEFAULT_CONFIG.autoDiscovery,
            ...userConfig.autoDiscovery,
        },
        attackTrigger: {
            ...DEFAULT_CONFIG.attackTrigger,
            ...userConfig.attackTrigger,
            triggers: {
                ...DEFAULT_CONFIG.attackTrigger.triggers,
                ...userConfig.attackTrigger?.triggers,
            },
            thresholds: {
                ...DEFAULT_CONFIG.attackTrigger.thresholds,
                ...userConfig.attackTrigger?.thresholds,
            },
            autoSave: {
                ...DEFAULT_CONFIG.attackTrigger.autoSave,
                ...userConfig.attackTrigger?.autoSave,
            },
        },
        killSwitch: {
            ...DEFAULT_CONFIG.killSwitch,
            ...userConfig.killSwitch
        },
        distributedLedger: {
            ...DEFAULT_CONFIG.distributedLedger,
            ...userConfig.distributedLedger,
            network: {
                ...DEFAULT_CONFIG.distributedLedger.network,
                ...userConfig.distributedLedger?.network,
            },
            consensus: {
                ...DEFAULT_CONFIG.distributedLedger.consensus,
                ...userConfig.distributedLedger?.consensus,
            },
        },
    };
}
