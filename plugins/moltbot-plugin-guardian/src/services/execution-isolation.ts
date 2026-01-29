
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ExecutionResult {
    success: boolean;
    output?: any;
    error?: string;
    executionTimeMs: number;
}

export class ExecutionIsolationService {
    private sandboxImage: string = 'alpine:latest'; // In real app, build a custom image with python3
    // For this implementation, we assume the container has python3 installed. 
    // If we use standard 'alpine', we need to install python3 first? 
    // Or we use 'python:3.9-alpine'.

    private isAvailable: boolean = true; // Assume true until checked

    constructor(private config?: any) { }

    /**
     * Check if Docker is available
     */
    async initialize(): Promise<void> {
        try {
            await this.runDocker(['info']); // 'docker info' returns 0 if running
            this.isAvailable = true;
            console.log('[Execution] Docker is available.');
        } catch (error) {
            this.isAvailable = false;
            console.warn('[Execution] Docker is NOT available or not running. Execution Isolation will be disabled.');
        }
    }

    /**
     * Execute a Python script inside a strictly isolated Docker container
     */
    async executePythonScript(scriptName: string, inputData: any): Promise<ExecutionResult> {
        const startTime = Date.now();

        if (!this.isAvailable) {
            return {
                success: false,
                error: 'Docker not available',
                executionTimeMs: 0
            };
        }

        const containerName = `moltbot-exec-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        try {
            // 1. Resolve script path
            // We assume scripts are in ../execution relative to this service file
            // src/services/execution-isolation.ts -> src/execution/analyze_pattern.py
            const scriptPath = path.resolve(__dirname, '..', 'execution', scriptName);

            // Check if script exists
            try {
                await fs.access(scriptPath);
            } catch {
                throw new Error(`Script not found: ${scriptName}`);
            }

            // 2. Start Ephemeral Container (ReadOnly, No Network)
            // We use python:3.9-alpine for smallest footprint + python support
            // We bind mount the script? Or copy it? 
            // Copy is safer for "isolation" (no write back to host).
            // But bind mount read-only is faster. Let's use cp for strict isolation logic described in plan.

            // Step 2a: Start container with stdin open
            // docker run -i --rm --network none --name <name> python:3.9-alpine sh -c "cat > /app/script.py && python3 /app/script.py"
            // We can pipe the script content AND the input data?

            // Simpler approach:
            // 1. Start container idle
            // 2. Copy script
            // 3. Exec

            // 2. Start Ephemeral Container (Strict Isolation: Read-Only Root FS, No Network)
            // We use --read-only to prevent tampering with system files.
            // We use --tmpfs /tmp to allow writing the script and temp files in memory only.
            await this.runDocker(['run', '-d', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp', '--name', containerName, 'python:3.9-alpine', 'sleep', '60']);

            // 3. Copy script to container
            await this.runDocker(['cp', scriptPath, `${containerName}:/tmp/script.py`]);

            // 4. Exec script with input via stdin
            const inputJson = JSON.stringify(inputData);

            const result = new Promise<string>((resolve, reject) => {
                const child = spawn('docker', ['exec', '-i', containerName, 'python3', '/tmp/script.py']);

                let stdout = '';
                let stderr = '';

                child.stdout.on('data', d => stdout += d.toString());
                child.stderr.on('data', d => stderr += d.toString());

                child.on('close', code => {
                    if (code === 0) resolve(stdout);
                    else reject(new Error(`Script execution failed: ${stderr || stdout}`));
                });

                child.on('error', err => reject(err));

                // Write input
                child.stdin.write(inputJson);
                child.stdin.end();
            });

            const outputRaw = await result;
            let outputJson;
            try {
                outputJson = JSON.parse(outputRaw);
            } catch {
                outputJson = { raw: outputRaw };
            }

            return {
                success: true,
                output: outputJson,
                executionTimeMs: Date.now() - startTime
            };

        } catch (err: any) {
            return {
                success: false,
                error: err.message,
                executionTimeMs: Date.now() - startTime
            };
        } finally {
            // Cleanup
            try {
                await this.runDocker(['rm', '-f', containerName]);
            } catch { /* ignore */ }
        }
    }

    private runDocker(args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn('docker', args, { stdio: 'ignore' });
            child.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`Docker command failed: docker ${args.join(' ')}`));
            });
            child.on('error', reject);
        });
    }
}
