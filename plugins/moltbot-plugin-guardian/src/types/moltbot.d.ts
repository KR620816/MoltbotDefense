/**
 * Type declarations for moltbot/plugin-sdk
 * 
 * These are the essential types needed by the Guardian plugin.
 * In production, these would come from the actual moltbot package.
 */

declare module "moltbot/plugin-sdk" {
    export interface PluginLogger {
        debug?: (message: string) => void;
        info: (message: string) => void;
        warn: (message: string) => void;
        error: (message: string) => void;
    }

    export interface MoltbotConfig {
        [key: string]: unknown;
    }

    export interface MoltbotPluginServiceContext {
        config: MoltbotConfig;
        workspaceDir?: string;
        stateDir: string;
        logger: PluginLogger;
    }

    export interface MoltbotPluginService {
        id: string;
        start: (ctx: MoltbotPluginServiceContext) => void | Promise<void>;
        stop?: (ctx: MoltbotPluginServiceContext) => void | Promise<void>;
    }

    export interface PluginCommandContext {
        senderId?: string;
        channel: string;
        isAuthorizedSender: boolean;
        args?: string;
        commandBody: string;
        config: MoltbotConfig;
    }

    export interface PluginCommandResult {
        text?: string;
        [key: string]: unknown;
    }

    export interface MoltbotPluginCommandDefinition {
        name: string;
        description: string;
        acceptsArgs?: boolean;
        requireAuth?: boolean;
        handler: (ctx: PluginCommandContext) => PluginCommandResult | Promise<PluginCommandResult>;
    }

    export interface PluginHookBeforeToolCallEvent {
        toolName: string;
        params: Record<string, unknown>;
    }

    export interface PluginHookBeforeToolCallResult {
        params?: Record<string, unknown>;
        block?: boolean;
        blockReason?: string;
    }

    export interface PluginHookToolContext {
        agentId?: string;
        sessionKey?: string;
        toolName: string;
    }

    export interface MoltbotPluginApi {
        id: string;
        name: string;
        version?: string;
        description?: string;
        source: string;
        config: MoltbotConfig;
        pluginConfig?: Record<string, unknown>;
        logger: PluginLogger;

        registerService: (service: MoltbotPluginService) => void;
        registerCommand: (command: MoltbotPluginCommandDefinition) => void;
        registerHttpRoute: (params: { path: string; handler: (req: any, res: any) => Promise<void> | void }) => void;

        on: <K extends string>(
            hookName: K,
            handler: (event: any, ctx: any) => any,
            opts?: { priority?: number }
        ) => void;
    }
}
