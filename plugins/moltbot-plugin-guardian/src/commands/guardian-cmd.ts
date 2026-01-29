/**
 * /guardian Command
 *
 * Toggle Guardian ON/OFF and check status
 */

import type { MoltbotPluginApi, PluginCommandContext } from "moltbot/plugin-sdk";
import type { GuardianConfig } from "../config.js";

// Runtime enabled state (shared with hooks)
let runtimeEnabled = true;

/**
 * Get current runtime enabled state
 */
export function isGuardianEnabled(): boolean {
    return runtimeEnabled;
}

/**
 * Set runtime enabled state
 */
export function setGuardianEnabled(enabled: boolean): void {
    runtimeEnabled = enabled;
}

/**
 * Register /guardian command
 */
export function registerGuardianCommands(
    api: MoltbotPluginApi,
    config: GuardianConfig
): void {
    // Initialize from config
    runtimeEnabled = config.enabled;

    api.registerCommand({
        name: "guardian",
        description: "Guardian 보안 모듈 제어 (on/off/status)",
        acceptsArgs: true,
        requireAuth: true,
        handler: async (ctx: PluginCommandContext) => {
            const args = ctx.args?.trim().toLowerCase() ?? "";

            switch (args) {
                case "on":
                case "enable":
                    runtimeEnabled = true;
                    return {
                        text: `🛡️ Guardian 보안 모듈이 **활성화**되었습니다.

현재 설정:
- AI 서버: \`${config.guardianAi.baseUrl}\`
- 모델: \`${config.guardianAi.model}\`
- 검증 대상: ${config.blockedTools.join(", ")}`,
                    };

                case "off":
                case "disable":
                    runtimeEnabled = false;
                    return {
                        text: `⚠️ Guardian 보안 모듈이 **비활성화**되었습니다.

주의: 모든 도구 호출이 검증 없이 실행됩니다.
다시 활성화: \`/guardian on\``,
                    };

                case "status":
                case "":
                    const stagesStatus = [
                        `  - Regex Filter: ${config.stages.regex ? "✅" : "❌"}`,
                        `  - Pattern DB: ${config.stages.patternDb ? "✅" : "❌"}`,
                        `  - Guardian AI: ${config.stages.guardianAi ? "✅" : "❌"}`,
                        `  - JSON Parser: ${config.stages.jsonParser ? "✅" : "❌"}`,
                    ].join("\n");

                    return {
                        text: `🛡️ **Guardian Security Module** v1.0.0

📊 상태: ${runtimeEnabled ? "✅ ON" : "❌ OFF"}

🔧 검증 단계:
${stagesStatus}

🤖 AI 설정:
  - Provider: \`${config.guardianAi.provider}\`
  - Base URL: \`${config.guardianAi.baseUrl}\`
  - Model: \`${config.guardianAi.model}\`

🔒 검증 대상 도구:
  ${config.blockedTools.map(t => `\`${t}\``).join(", ")}

💡 사용법:
  \`/guardian on\` - 활성화
  \`/guardian off\` - 비활성화`,
                    };

                default:
                    return {
                        text: `❓ 알 수 없는 명령: \`${args}\`

사용법:
- \`/guardian on\` - 활성화
- \`/guardian off\` - 비활성화
- \`/guardian status\` - 상태 확인`,
                    };
            }
        },
    });

    api.logger.info("[guardian] Command /guardian registered");
}
