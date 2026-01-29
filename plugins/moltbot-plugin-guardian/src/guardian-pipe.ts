/**
 * Guardian Pipe - 4-Stage Validation Pipeline
 *
 * Stage 1: Regex Filter (instant block)
 * Stage 2: Pattern DB Matching (similarity search)
 * Stage 3: Guardian AI (LLM validation)
 * Stage 4: JSON Parser (strict validation)
 */

import type { PluginLogger } from "moltbot/plugin-sdk";
import { RegexFilter } from "./stages/regex-filter.js";
import { PatternMatcher } from "./stages/pattern-matcher.js";
import { GuardianAI } from "./stages/guardian-ai.js";
import { JsonParser } from "./stages/json-parser.js";
import type { GuardianConfig } from "./config.js";
import { AttackTriggerService } from "./services/attack-trigger.js";

export interface ValidationInput {
    text: string;
    toolName?: string;
    sessionKey?: string;
    agentId?: string;
}

export interface StageResult {
    blocked: boolean;
    matched?: string[];
    matches?: Array<{ category: string; severity: number; similarity: number }>;
    rawResponse?: string;
    error?: string;
    parseError?: string;
    allowed?: boolean;
    confidence?: number;
    flags?: string[];
}

export interface ValidationResult {
    allowed: boolean;
    blockReason?: string;
    stageReached: number;
    stages: {
        regex?: StageResult;
        pattern?: StageResult;
        guardian?: StageResult;
        parser?: StageResult;
    };
    durationMs: number;
}

export class GuardianPipe {
    private regexFilter: RegexFilter;
    private patternMatcher: PatternMatcher;
    private guardianAI: GuardianAI;
    private jsonParser: JsonParser;
    private enabled: boolean;
    private logger: PluginLogger;

    // Services
    public attackTriggerService: AttackTriggerService | null = null;

    constructor(
        private config: GuardianConfig,
        logger: PluginLogger
    ) {
        this.enabled = config.enabled;
        this.logger = logger;
        this.regexFilter = new RegexFilter();
        this.patternMatcher = new PatternMatcher();
        this.guardianAI = new GuardianAI(config.guardianAi, logger);
        this.jsonParser = new JsonParser();
    }

    setServices(triggerService: AttackTriggerService): void {
        this.attackTriggerService = triggerService;
    }

    private recordAttack(
        source: 'regex' | 'ai' | 'heuristic' | 'rateLimit' | 'unknown',
        pattern: string,
        severity: 'critical' | 'high' | 'medium' | 'low',
        input: string
    ): void {
        if (!this.attackTriggerService) return;

        this.attackTriggerService.onAttackDetected({
            id: `atk_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            timestamp: new Date(),
            source,
            pattern,
            rawInput: input,
            severity,
            metadata: {}
        });
    }

    /**
     * Initialize SQLite database
     */
    async initializeDatabase(stateDir: string): Promise<void> {
        await this.patternMatcher.initialize(stateDir);
    }

    /**
     * Close database connections
     */
    close(): void {
        this.patternMatcher.close();
    }

    /**
     * Toggle Guardian ON/OFF at runtime
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.logger.info(`[guardian] Enabled set to: ${enabled}`);
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Main validation pipeline
     */
    async validate(input: ValidationInput): Promise<ValidationResult> {
        const startTime = Date.now();
        const result: ValidationResult = {
            allowed: true,
            stageReached: 0,
            stages: {},
            durationMs: 0,
        };

        // Guardian disabled = instant pass
        if (!this.enabled) {
            result.durationMs = Date.now() - startTime;
            return result;
        }

        this.logger.debug?.(`[guardian] Validating: ${input.text.slice(0, 100)}...`);

        // ============================================
        // Stage 1: Regex Filter (instant block)
        // ============================================
        if (this.config.stages.regex) {
            result.stageReached = 1;
            const regexResult = this.regexFilter.check(input.text);
            result.stages.regex = regexResult;

            if (regexResult.blocked) {
                result.allowed = false;
                result.blockReason = `REGEX_MATCH: ${regexResult.matched?.[0] ?? "unknown"}`;
                result.durationMs = Date.now() - startTime;
                this.logger.warn(`[guardian] Blocked by regex: ${result.blockReason}`);
                this.recordAttack('regex', regexResult.matched?.[0] ?? "unknown", 'critical', input.text);
                return result;
            }
        }

        // ============================================
        // Stage 2: Pattern DB Matching
        // ============================================
        if (this.config.stages.patternDb) {
            result.stageReached = 2;
            const patternResult = await this.patternMatcher.findSimilar(input.text);
            result.stages.pattern = patternResult;

            if (patternResult.blocked) {
                result.allowed = false;
                result.blockReason = `PATTERN_MATCH: ${patternResult.matches?.[0]?.category ?? "unknown"}`;
                result.durationMs = Date.now() - startTime;
                this.logger.warn(`[guardian] Blocked by pattern: ${result.blockReason}`);
                this.recordAttack('heuristic', patternResult.matches?.[0]?.category ?? "unknown", 'high', input.text);
                return result;
            }
        }

        // ============================================
        // Stage 3: Guardian AI
        // ============================================
        if (this.config.stages.guardianAi) {
            result.stageReached = 3;
            const guardianResult = await this.guardianAI.validate(input.text);
            result.stages.guardian = guardianResult;

            if (guardianResult.error) {
                // Fail-closed: AI error = block
                result.allowed = false;
                result.blockReason = `GUARDIAN_ERROR: ${guardianResult.error}`;
                result.durationMs = Date.now() - startTime;
                this.logger.error(`[guardian] AI error: ${guardianResult.error}`);
                return result;
            }

            // ============================================
            // Stage 4: JSON Parser
            // ============================================
            if (this.config.stages.jsonParser && guardianResult.rawResponse) {
                result.stageReached = 4;
                const parseResult = this.jsonParser.parse(guardianResult.rawResponse);
                result.stages.parser = parseResult;

                if (!parseResult.allowed) {
                    result.allowed = false;
                    result.blockReason = parseResult.parseError
                        ? `PARSE_ERROR: ${parseResult.parseError}`
                        : "GUARDIAN_BLOCKED";
                    result.durationMs = Date.now() - startTime;
                    this.logger.warn(`[guardian] Blocked by parser: ${result.blockReason}`);
                    this.recordAttack('ai', 'AI detected malicious intent', 'critical', input.text);
                    return result;
                }
            }
        }

        result.durationMs = Date.now() - startTime;
        this.logger.debug?.(`[guardian] Passed in ${result.durationMs}ms`);
        return result;
    }
}
