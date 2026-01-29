/**
 * Pattern Discovery Service
 * 
 * AI를 사용하여 능동적으로 새로운 공격 패턴을 탐색하고 DB에 추가하는 서비스
 */

import OpenAI from 'openai';
import { PatternDB } from '../db/pattern-db';
import { PatternLearningService } from './pattern-learning';
import { AutoDiscoveryConfig, GuardianAiConfig } from '../config';

// ========== Types ==========

export interface DiscoveryResult {
    totalRequested: number;
    discovered: number;
    duplicates: number;
    failed: number;
    durationMs: number;
    reason: string;
}

// ========== Prompts ==========

const DISCOVERY_PROMPT = `
You are a red team security researcher. Generate a NEW, NOVEL attack pattern that is NOT in the provided exclusion list.

Target Category: {CATEGORY}
Exclusion List (Do not generate these):
{EXCLUSIONS}

Rules:
1. The pattern must be a realistic attack payload string (e.g., SQL injection, XSS, Command Injection).
2. It must be syntactically correct and potentially executable.
3. Be creative: try obfuscation, encoding, or different variations.
4. Output specific payload only, no explanation.

Output JSON format only:
{
  "pattern": "payload_string",
  "category": "category_name",
  "severity": "high",
  "description": "Brief explanation of the technique"
}
`;

// ========== PatternDiscoveryService ==========

export class PatternDiscoveryService {
    private db: PatternDB;
    private learningService: PatternLearningService;
    private config: AutoDiscoveryConfig;
    private aiConfig: GuardianAiConfig;
    private aiClient: OpenAI;
    private isRunning: boolean = false;
    public delayLoopMs: number = 1000;

    constructor(
        db: PatternDB,
        learningService: PatternLearningService,
        config: AutoDiscoveryConfig,
        aiConfig: GuardianAiConfig,
        aiClient?: OpenAI
    ) {
        this.db = db;
        this.learningService = learningService;
        this.config = config;
        this.aiConfig = aiConfig;

        this.aiClient = aiClient || new OpenAI({
            baseURL: aiConfig.baseUrl,
            apiKey: aiConfig.apiKey,
            timeout: aiConfig.timeoutMs,
        });
    }

    /**
     * 자동 수집 시작
     */
    async startDiscovery(): Promise<DiscoveryResult> {
        if (!this.config.enabled) {
            return this.createResult(0, 0, 0, 0, 0, 'Disabled');
        }

        if (this.isRunning) {
            return this.createResult(0, 0, 0, 0, 0, 'Already running');
        }

        this.isRunning = true;
        const startTime = Date.now();
        let discoveredCount = 0;
        let duplicateCount = 0;
        let failCount = 0;

        console.log(`🔍 [Guardian] Starting auto pattern discovery. Target: ${this.config.targetCount}`);

        try {
            // 타임아웃 Promise
            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error('Timeout')), this.config.timeoutMinutes * 60 * 1000);
            });

            // 수집 작업
            const workPromise = async () => {
                const categories = this.db.getCategories();
                const targetCategories = categories.length > 0 ? categories : ['sql_injection', 'xss', 'command_injection'];

                while (discoveredCount < this.config.targetCount && this.isRunning) {
                    // 랜덤 카테고리 선택
                    const category = targetCategories[Math.floor(Math.random() * targetCategories.length)];

                    // 패턴 생성 요청
                    const patternData = await this.generatePatternWithAI(category);

                    if (!patternData) {
                        failCount++;
                        continue;
                    }

                    // 학습 (PatternLearningService 재사용 - 중복체크, 저장 등 포함)
                    const result = await this.learningService.learnFromEvent({
                        id: `auto_${Date.now()}`,
                        timestamp: new Date(),
                        source: 'ai', // source: 'ai' -> AttackTriggerService에서 AI_BLOCK으로 인식될 수 있으나, 여기서는 learningService를 직접 호출하므로 트리거와 무관
                        pattern: patternData.pattern,
                        rawInput: patternData.pattern,
                        severity: patternData.severity as any,
                        metadata: {}
                    });

                    if (result.success) {
                        discoveredCount++;
                        console.log(`✨ [Guardian] Discovered new pattern (${discoveredCount}/${this.config.targetCount}): ${patternData.pattern.substring(0, 30)}...`);
                    } else {
                        if (result.isDuplicate) duplicateCount++;
                        else failCount++;
                    }

                    // API Rate Limit 방지를 위한 짧은 대기
                    await new Promise(resolve => setTimeout(resolve, this.delayLoopMs));
                }
            };

            await Promise.race([workPromise(), timeoutPromise]);

            return this.createResult(
                discoveredCount + duplicateCount + failCount,
                discoveredCount,
                duplicateCount,
                failCount,
                Date.now() - startTime,
                'Completed'
            );

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.log(`🛑 [Guardian] Discovery stopped: ${msg}`);

            return this.createResult(
                discoveredCount + duplicateCount + failCount,
                discoveredCount,
                duplicateCount,
                failCount,
                Date.now() - startTime,
                `Stopped: ${msg}`
            );
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * AI에게 패턴 생성 요청
     */
    private async generatePatternWithAI(category: string): Promise<any> {
        try {
            // 해당 카테고리의 기존 패턴 샘플 (최대 10개)
            const catData = this.db.getCategory(category);
            const existingPatterns = catData ? catData.patterns.slice(0, 10) : [];
            const exclusions = existingPatterns.join('\n').substring(0, 500); // 길이 제한

            const prompt = DISCOVERY_PROMPT
                .replace('{CATEGORY}', category)
                .replace('{EXCLUSIONS}', exclusions || 'None');

            const response = await this.aiClient.chat.completions.create({
                model: this.config.model || this.aiConfig.model,
                messages: [
                    { role: 'system', content: prompt }
                ],
                temperature: 0.8, // 창의성 높임
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0]?.message?.content;
            if (!content) return null;

            return JSON.parse(content);
        } catch (error) {
            console.error(`[PatternDiscovery] Generation failed: ${error}`);
            return null;
        }
    }

    /**
     * 결과 객체 생성
     */
    private createResult(total: number, discovered: number, duplicates: number, failed: number, duration: number, reason: string): DiscoveryResult {
        return {
            totalRequested: total,
            discovered,
            duplicates,
            failed,
            durationMs: duration,
            reason
        };
    }

    /**
     * 강제 중단
     */
    stop(): void {
        this.isRunning = false;
    }
}
