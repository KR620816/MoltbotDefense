/**
 * before_tool_call Hook
 *
 * Validates tool calls before execution via Guardian Pipe
 */

import type {
    PluginHookBeforeToolCallEvent,
    PluginHookBeforeToolCallResult,
    PluginHookToolContext,
} from "moltbot/plugin-sdk";
import type { GuardianPipe } from "../guardian-pipe.js";
import type { GuardianConfig } from "../config.js";

/**
 * Extract text to validate from tool parameters
 */
function extractInputText(params: Record<string, unknown>): string | null {
    // Priority-ordered list of common parameter names
    const candidates = [
        params.command,      // exec
        params.commandLine,  // run_command
        params.content,      // write_to_file
        params.body,         // send_email
        params.message,      // send_message
        params.text,         // general
        params.prompt,       // AI-related
        params.url,          // browser/fetch
        params.query,        // search
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.length > 0) {
            return candidate;
        }
    }

    // Fallback: stringify all params
    try {
        const str = JSON.stringify(params);
        return str.length > 10 ? str : null;
    } catch {
        return null;
    }
}

/**
 * Create the before_tool_call hook handler
 */
export function createBeforeToolCallHook(
    pipe: GuardianPipe,
    config: GuardianConfig,
    isEnabledFn: () => boolean
): (
    event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext
) => Promise<PluginHookBeforeToolCallResult | void> {

    return async (
        event: PluginHookBeforeToolCallEvent,
        ctx: PluginHookToolContext
    ): Promise<PluginHookBeforeToolCallResult | void> => {
        // 1. Check if Guardian is enabled (runtime toggle)
        if (!isEnabledFn()) {
            return;
        }

        // 2. Check if this tool requires validation
        if (!config.blockedTools.includes(event.toolName)) {
            return;
        }

        // 3. Extract input text from params
        const inputText = extractInputText(event.params);
        if (!inputText) {
            return;
        }

        // 4. Run Guardian Pipe validation
        const result = await pipe.validate({
            text: inputText,
            toolName: event.toolName,
            sessionKey: ctx.sessionKey,
            agentId: ctx.agentId,
        });

        // 5. Block if not allowed
        if (!result.allowed) {
            return {
                block: true,
                blockReason: `[Guardian] ${result.blockReason ?? "Security check failed"} (stage ${result.stageReached})`,
            };
        }

        // 6. Pass through
        return;
    };
}
