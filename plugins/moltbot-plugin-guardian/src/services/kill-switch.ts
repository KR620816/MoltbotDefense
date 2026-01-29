import { AttackTriggerService, AttackEvent } from './attack-trigger';
// Note: Direct import from src/agents/sandbox/docker might fail if not compiled together or if path aliases differ.
// Since this is a plugin, it might not have direct access to internal Moltbot modules unless exposed via SDK.
// However, since we are in the same repo, we can try relative imports for now, or assume we pass a callback.

// For safer architecture, we should define an interface for the "Executor" or use the Moltbot API if available.
// But given the task is to modify the codebase directly, we will try to use the import.
// If resolve fails, we might need to look at how other plugins access core features or move the logic to core.
// Wait, plugins/moltbot-plugin-guardian is inside the repo.

import { spawn } from 'child_process';

function execDocker(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('docker', args, { stdio: 'ignore' });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Docker command failed: docker ${args.join(' ')}`));
        });
        child.on('error', (err) => reject(err));
    });
}

export interface KillSwitchConfig {
    enabled: boolean;
    autoAction: 'pause' | 'stop' | 'none';
}

export class KillSwitchService {
    private config: KillSwitchConfig;
    private attackService: AttackTriggerService;

    private isDockerAvailable: boolean = true;

    constructor(config: KillSwitchConfig, attackService: AttackTriggerService) {
        this.config = config;
        this.attackService = attackService;
    }

    async start() {
        // Check Docker availability asynchronously
        // 'docker info'
        const child = spawn('docker', ['info'], { stdio: 'ignore' });
        child.on('close', (code) => {
            if (code !== 0) {
                this.isDockerAvailable = false;
                console.warn('[KillSwitch] Docker not detected. Container controls disabled.');
            }
        });

        this.attackService.on('patternDetected', this.handleAttack.bind(this));
    }

    private async handleAttack(event: AttackEvent, triggerResult: any) {
        if (!this.config.enabled || this.config.autoAction === 'none') return;
        if (!this.isDockerAvailable) {
            console.debug('[KillSwitch] Docker not available, skipping container action.');
            return;
        }

        // Only react to Critical or High severity
        if (event.severity !== 'critical' && event.severity !== 'high' && triggerResult.priority < 9) {
            return;
        }

        console.warn(`🚨 [KillSwitch] CRITICAL THREAT DETECTED: ${event.pattern}`);
        console.warn(`🚨 [KillSwitch] Initiating ${this.config.autoAction.toUpperCase()} sequence...`);

        // Identify Container
        // Try to get containerName directly from metadata, or fallback to resolving from sessionKey if we verify the logic.
        // Since we updated GuardianPipe to pass metadata, we hope containerName is passed or we can deduce it.
        // Currently GuardianPipe passes sessionKey. We need to resolve sessionKey -> containerName.
        // But we can't import the resolver.

        // Strategy:
        // 1. If containerName is in metadata, use it.
        // 2. If sessionKey is in metadata, try to construct the name.
        //    The naming convention in docker.ts is: prefix + slugify(resolveSandboxScopeKey(scope, sessionKey))
        //    Default prefix: "moltbot-sandbox-"
        //    Default scope: "session" -> slugify(sessionKey)
        //    So: moltbot-sandbox-{sessionKey_slug}

        // This is a heuristic. Ideally, core should expose this.

        let containerName = event.metadata.containerName;

        if (!containerName && event.metadata.sessionKey) {
            // Simple fallback for standard session keys
            // slugify usually replaces non-alphanumeric with -
            const slug = event.metadata.sessionKey.replace(/[^a-z0-9]/gi, '-').toLowerCase();
            containerName = `moltbot-sandbox-${slug}`;
            console.log(`[KillSwitch] Derived container name from session: ${containerName}`);
        }

        if (containerName) {
            try {
                if (this.config.autoAction === 'pause') {
                    await execDocker(['pause', containerName]);
                    console.log(`✅ [KillSwitch] Container ${containerName} PAUSED.`);
                } else if (this.config.autoAction === 'stop') {
                    await execDocker(['kill', containerName]);
                    console.log(`✅ [KillSwitch] Container ${containerName} STOPPED.`);
                }
            } catch (err) {
                console.error(`[KillSwitch] Action failed for ${containerName}:`, err);
            }
        } else {
            console.error(`[KillSwitch] Container name could not be resolved. Metadata:`, event.metadata);
        }
    }
}
