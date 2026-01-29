
import * as fs from 'fs/promises';
import * as path from 'path';

export class DirectivesService {
    private directives: Map<string, string> = new Map();
    private directivesDir: string;

    constructor(rootDir: string) {
        // Assuming rootDir is the plugin root, directives are in <root>/directives
        this.directivesDir = path.join(rootDir, 'directives');
    }

    /**
     * Load all markdown files from directives directory
     */
    async loadDirectives(): Promise<void> {
        try {
            // Check if dir exists
            try {
                await fs.access(this.directivesDir);
            } catch {
                console.warn(`[Directives] Directory not found: ${this.directivesDir}`);
                return;
            }

            const files = await fs.readdir(this.directivesDir);
            let loadedCount = 0;

            for (const file of files) {
                if (file.endsWith('.md')) {
                    const content = await fs.readFile(path.join(this.directivesDir, file), 'utf-8');
                    // Key is filename without extension, e.g., 'attack_trigger'
                    const key = path.basename(file, '.md');
                    this.directives.set(key, content);
                    loadedCount++;
                }
            }
            console.log(`[Directives] Loaded ${loadedCount} SOP documents.`);
        } catch (err: any) {
            console.error(`[Directives] Failed to load directives: ${err.message}`);
        }
    }

    /**
     * Get specific directive content
     */
    getDirective(name: string): string | undefined {
        return this.directives.get(name);
    }

    /**
     * Get all directives formatted for System Prompt
     */
    getAllDirectivesContext(): string {
        let context = "### Standard Operating Procedures (SOPs)\n\n";
        for (const [name, content] of this.directives.entries()) {
            context += `#### SOP: ${name}\n${content.substring(0, 500)}...\n(truncated)\n\n`; // Truncate to save tokens if needed
        }
        return context;
    }
}
