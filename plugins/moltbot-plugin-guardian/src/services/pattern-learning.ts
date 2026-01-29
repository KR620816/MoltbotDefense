/**
 * Pattern Learning Service
 * 
 * 공격 패턴을 분석하고 정규화하여 DB에 학습시키는 서비스
 */

import OpenAI from 'openai';
import { PatternDB } from '../db/pattern-db';
import { AttackEvent } from './attack-trigger';
import { GuardianAiConfig } from '../config';

// ========== Types ==========

export interface LearningResult {
    success: boolean;
    pattern?: string;
    category?: string;
    isDuplicate?: boolean;
    error?: string;
}

// ========== Prompts ==========

const CATEGORY_CLASSIFICATION_PROMPT = `
You are a cybersecurity expert. Analyze the given attack pattern and classify it into a category.

Existing categories:
{CATEGORIES}

Rules:
1. Use an existing category if it fits well.
2. If it's a new type of attack, propose a new category name (lowercase, snake_case).
3. Determine the severity (critical, high, medium, low).
4. Extract the core attack payload, removing random values or noise if possible.

Output JSON format only:
{
  "category": "category_name",
  "severity": "high", 
  "normalized_pattern": "core_attack_pattern"
}
`;

// ========== PatternLearningService ==========

export class PatternLearningService {
    private db: PatternDB;
    private aiClient: OpenAI;
    private config: GuardianAiConfig;

    constructor(db: PatternDB, aiConfig: GuardianAiConfig, aiClient?: OpenAI) {
        this.db = db;
        this.config = aiConfig;

        this.aiClient = aiClient || new OpenAI({
            baseURL: aiConfig.baseUrl,
            apiKey: aiConfig.apiKey,
            timeout: aiConfig.timeoutMs,
        });
    }

    /**
     * 공격 이벤트로부터 패턴 학습
     */
    async learnFromEvent(event: AttackEvent): Promise<LearningResult> {
        try {
            // 1. 기본 정규화
            let pattern = this.normalizeInput(event.pattern || event.rawInput);

            if (!pattern || pattern.length < 3) {
                return { success: false, error: 'Pattern too short' };
            }

            // 2. 1차 중복 체크 (로컬 DB)
            await this.db.load();
            if (this.db.isDuplicate(pattern)) {
                return { success: false, isDuplicate: true, error: 'Duplicate pattern (exact match)' };
            }

            // 3. AI 분석 (카테고리 분류 및 정제)
            const analysis = await this.analyzeWithAI(pattern);

            if (!analysis) {
                // AI 분석 실패 시 기본값 사용
                return this.savePattern('uncategorized', pattern, 'medium');
            }

            // AI가 제안한 정규화된 패턴이 있으면 사용
            if (analysis.normalized_pattern && analysis.normalized_pattern.length > 3) {
                pattern = analysis.normalized_pattern;
            }

            // 4. 2차 중복 체크 (정규화 후)
            if (this.db.isDuplicate(pattern)) {
                return { success: false, isDuplicate: true, error: 'Duplicate pattern (after normalization)' };
            }

            // 5. DB 저장
            return await this.savePattern(
                analysis.category || 'unknown',
                pattern,
                analysis.severity || 'high',
                `Auto-learned from ${event.source} (Event: ${event.id})`
            );

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[PatternLearning] Error: ${msg}`);
            return { success: false, error: msg };
        }
    }

    /**
     * 입력값 정규화
     */
    private normalizeInput(input: string): string {
        if (!input) return '';

        // 공백 정리
        let normalized = input.trim();

        // 너무 긴 입력은 앞부분만 학습 (성능/보안)
        if (normalized.length > 500) {
            normalized = normalized.substring(0, 500);
        }

        return normalized;
    }

    /**
     * AI를 사용한 패턴 분석
     */
    private async analyzeWithAI(pattern: string): Promise<any> {
        try {
            const categories = this.db.getCategories().join(', ');
            const prompt = CATEGORY_CLASSIFICATION_PROMPT.replace('{CATEGORIES}', categories);

            const response = await this.aiClient.chat.completions.create({
                model: this.config.model,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: pattern }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0]?.message?.content;
            if (!content) return null;

            return JSON.parse(content);
        } catch (error) {
            console.error(`[PatternLearning] AI analysis failed: ${error}`);
            // AI 실패 시 null 반환하여 fallback 로직 타게 함
            return null;
        }
    }

    /**
     * 패턴 저장
     */
    private async savePattern(
        category: string,
        pattern: string,
        severity: 'critical' | 'high' | 'medium' | 'low',
        description?: string
    ): Promise<LearningResult> {
        const result = await this.db.addPattern(category, pattern, severity, description);

        if (result.success) {
            await this.db.save();
            return {
                success: true,
                pattern,
                category
            };
        } else {
            return {
                success: false,
                isDuplicate: result.isDuplicate,
                error: result.message
            };
        }
    }
}
