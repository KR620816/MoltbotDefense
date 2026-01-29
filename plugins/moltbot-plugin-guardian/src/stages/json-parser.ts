/**
 * Stage 4: JSON Parser
 *
 * Strict validation of Guardian AI response
 * - Only accepts boolean true/false for result field
 * - All parse errors = block (fail-closed)
 */

import type { StageResult } from "../guardian-pipe.js";

export interface ParsedResponse {
    result: boolean;
    confidence?: number;
    flags?: string[];
}

export class JsonParser {
    /**
     * Parse Guardian AI response with strict validation
     */
    parse(rawResponse: string): StageResult {
        // 1. Null/undefined check
        if (rawResponse === null || rawResponse === undefined) {
            return { allowed: false, parseError: "NULL_RESPONSE", blocked: true };
        }

        // 2. String type check
        if (typeof rawResponse !== "string") {
            return { allowed: false, parseError: "NOT_STRING", blocked: true };
        }

        // 3. Empty string check
        const trimmed = rawResponse.trim();
        if (trimmed === "") {
            return { allowed: false, parseError: "EMPTY_RESPONSE", blocked: true };
        }

        // 4. Try to parse JSON
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            // Try to extract JSON from markdown code block
            const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch {
                    return { allowed: false, parseError: "JSON_PARSE_ERROR", blocked: true };
                }
            } else {
                return { allowed: false, parseError: "JSON_PARSE_ERROR", blocked: true };
            }
        }

        // 5. Object type check
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { allowed: false, parseError: "NOT_OBJECT", blocked: true };
        }

        const obj = parsed as Record<string, unknown>;

        // 6. Result field existence check
        if (!("result" in obj)) {
            return { allowed: false, parseError: "MISSING_RESULT_FIELD", blocked: true };
        }

        // 7. STRICT boolean check (only true/false allowed)
        // "true" (string), 1 (number), etc. are NOT allowed
        if (obj.result !== true && obj.result !== false) {
            return { allowed: false, parseError: "INVALID_RESULT_TYPE", blocked: true };
        }

        // 8. Success: extract result
        const allowed = obj.result === true;
        const confidence =
            typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1
                ? obj.confidence
                : undefined;

        const flags: string[] = [];
        if (Array.isArray(obj.flags)) {
            for (const flag of obj.flags) {
                if (typeof flag === "string") {
                    flags.push(flag);
                }
            }
        }

        return {
            allowed,
            blocked: !allowed,
            confidence,
            flags: flags.length > 0 ? flags : undefined,
        };
    }
}
