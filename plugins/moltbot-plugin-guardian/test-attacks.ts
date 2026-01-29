/**
 * Guardian Attack Pattern Tester
 * 
 * Loads attack patterns and tests them against Guardian API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUARDIAN_API = 'http://127.0.0.1:3000/api/guardian/validate';

interface TestResult {
    category: string;
    pattern: string;
    allowed: boolean;
    stageReached: number;
    blockReason?: string;
    durationMs: number;
}

interface CategoryResult {
    category: string;
    total: number;
    blocked: number;
    passed: number;
    blockRate: number;
    avgDurationMs: number;
}

async function validatePattern(text: string): Promise<any> {
    try {
        const response = await fetch(GUARDIAN_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        return await response.json();
    } catch (error) {
        return { error: String(error), allowed: true };
    }
}

async function runTests(): Promise<void> {
    // Load attack patterns
    const patternsPath = path.join(__dirname, 'data', 'attack-patterns.json');
    const patternsData = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));

    const results: TestResult[] = [];
    const categoryResults: Map<string, CategoryResult> = new Map();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                  Guardian AI Attack Test Suite                 ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let totalTests = 0;
    let totalBlocked = 0;

    for (const [category, data] of Object.entries(patternsData.categories) as any) {
        console.log(`\n▶ Testing Category: ${category.toUpperCase()}`);
        console.log(`  Description: ${data.description}`);
        console.log(`  Severity: ${data.severity}`);
        console.log('  ' + '─'.repeat(60));

        let categoryBlocked = 0;
        let categoryDuration = 0;

        for (const pattern of data.patterns) {
            const startTime = Date.now();
            const result = await validatePattern(pattern);
            const duration = Date.now() - startTime;

            const blocked = result.allowed === false;
            if (blocked) {
                categoryBlocked++;
                totalBlocked++;
            }
            totalTests++;
            categoryDuration += duration;

            const status = blocked ? '❌ BLOCKED' : '✅ PASSED';
            const stage = result.stageReached || '-';
            const reason = result.blockReason?.substring(0, 30) || '';

            // Truncate pattern for display
            const displayPattern = pattern.length > 50 ? pattern.substring(0, 47) + '...' : pattern;

            console.log(`  ${status} | Stage ${stage} | ${duration}ms | ${reason}`);
            console.log(`    Pattern: ${displayPattern}`);

            results.push({
                category,
                pattern,
                allowed: result.allowed,
                stageReached: result.stageReached,
                blockReason: result.blockReason,
                durationMs: duration,
            });

            // Small delay to not overwhelm the API
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const blockRate = (categoryBlocked / data.patterns.length) * 100;
        const avgDuration = categoryDuration / data.patterns.length;

        categoryResults.set(category, {
            category,
            total: data.patterns.length,
            blocked: categoryBlocked,
            passed: data.patterns.length - categoryBlocked,
            blockRate,
            avgDurationMs: avgDuration,
        });

        console.log('  ' + '─'.repeat(60));
        console.log(`  Category Result: ${categoryBlocked}/${data.patterns.length} blocked (${blockRate.toFixed(1)}%)`);
    }

    // Summary
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('                         TEST SUMMARY                            ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('┌──────────────────────┬───────┬─────────┬────────┬──────────┐');
    console.log('│ Category             │ Total │ Blocked │ Passed │ Rate     │');
    console.log('├──────────────────────┼───────┼─────────┼────────┼──────────┤');

    for (const [name, stats] of categoryResults.entries()) {
        const namePad = name.substring(0, 20).padEnd(20);
        const totalPad = String(stats.total).padStart(5);
        const blockedPad = String(stats.blocked).padStart(7);
        const passedPad = String(stats.passed).padStart(6);
        const ratePad = `${stats.blockRate.toFixed(1)}%`.padStart(8);
        console.log(`│ ${namePad} │${totalPad} │${blockedPad} │${passedPad} │${ratePad} │`);
    }

    console.log('├──────────────────────┼───────┼─────────┼────────┼──────────┤');
    const overallRate = (totalBlocked / totalTests) * 100;
    console.log(`│ TOTAL                │${String(totalTests).padStart(5)} │${String(totalBlocked).padStart(7)} │${String(totalTests - totalBlocked).padStart(6)} │${overallRate.toFixed(1).padStart(7)}% │`);
    console.log('└──────────────────────┴───────┴─────────┴────────┴──────────┘');

    // Stage breakdown
    const stageBreakdown = new Map<number, number>();
    for (const r of results.filter(r => !r.allowed)) {
        const stage = r.stageReached || 0;
        stageBreakdown.set(stage, (stageBreakdown.get(stage) || 0) + 1);
    }

    console.log('\n\n📊 Block by Stage:');
    for (const [stage, count] of [...stageBreakdown.entries()].sort((a, b) => a[0] - b[0])) {
        const stageName = stage === 1 ? 'Regex' : stage === 2 ? 'Pattern' : stage === 3 ? 'Guardian AI' : stage === 4 ? 'Parser' : 'Unknown';
        const bar = '█'.repeat(Math.min(count, 40));
        console.log(`  Stage ${stage} (${stageName}): ${bar} ${count}`);
    }

    // Failed patterns (passed through)
    const passed = results.filter(r => r.allowed);
    if (passed.length > 0) {
        console.log('\n\n⚠️  Patterns that PASSED (need additional protection):');
        for (const p of passed) {
            console.log(`  - [${p.category}] ${p.pattern.substring(0, 60)}`);
        }
    }

    // Save results to file
    const reportPath = path.join(__dirname, 'data', 'test-results.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
            totalTests,
            totalBlocked,
            totalPassed: totalTests - totalBlocked,
            overallBlockRate: overallRate,
        },
        categoryResults: Object.fromEntries(categoryResults),
        detailedResults: results,
    }, null, 2));

    console.log(`\n\n✅ Results saved to: ${reportPath}`);
}

runTests().catch(console.error);
