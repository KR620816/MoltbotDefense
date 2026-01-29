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

export interface PropagationPushConfig {
    enabled: boolean;
    immediate: boolean;
    requireApproval: boolean;
}

export interface PropagationPullConfig {
    enabled: boolean;
    intervalMinutes: number;
    onStartup: boolean;
}

export interface PropagationConfig {
    enabled: boolean;
    mode: "api" | "p2p" | "local";
    apiEndpoint: string;
    apiKey: string;
    push: PropagationPushConfig;
    pull: PropagationPullConfig;
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
    mode: "p2p";
    network: DistributedLedgerNetworkConfig;
    consensus: DistributedLedgerConsensusConfig;
    sync: {
        onStartup: boolean;
        interval: number;
    };
}

// ========== 메인 설정 ==========

export interface GuardianConfig {
    enabled: boolean;
    stages: GuardianStagesConfig;
    guardianAi: GuardianAiConfig;
    blockedTools: string[];
    logging: GuardianLoggingConfig;
    // 멀티방어전략4 신규 설정
    autoDiscovery: AutoDiscoveryConfig;
    attackTrigger: AttackTriggerConfig;
    propagation: PropagationConfig;
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
    // 멀티방어전략4 기본값
    autoDiscovery: {
        enabled: false, // 기본 비활성화, 명시적 활성화 필요
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
    propagation: {
        enabled: false, // 기본 비활성화
        mode: "local",
        apiEndpoint: "https://patterns.moltbot.io/api/v1",
        apiKey: "",
        push: {
            enabled: true,
            immediate: true,
            requireApproval: false,
        },
        pull: {
            enabled: true,
            intervalMinutes: 30,
            onStartup: true,
        },
    },
    distributedLedger: {
        enabled: false, // 기본 비활성화
        mode: "p2p",
        network: {
            bootstrapNodes: [
                "node1.moltbot.io:6881",
                "node2.moltbot.io:6881",
            ],
            listenPort: 6881,
            maxPeers: 50,
        },
        consensus: {
            minValidators: 3,
            approvalThreshold: 0.51,
            blockInterval: 60000,
        },
        sync: {
            onStartup: true,
            interval: 300000,
        },
    },
};

/**
 * Merge user config with defaults
 */
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
        propagation: {
            ...DEFAULT_CONFIG.propagation,
            ...userConfig.propagation,
            push: {
                ...DEFAULT_CONFIG.propagation.push,
                ...userConfig.propagation?.push,
            },
            pull: {
                ...DEFAULT_CONFIG.propagation.pull,
                ...userConfig.propagation?.pull,
            },
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
            sync: {
                ...DEFAULT_CONFIG.distributedLedger.sync,
                ...userConfig.distributedLedger?.sync,
            },
        },
    };
}
