// .github/scripts/diagnose_models.cjs
const https = require('https');

async function testOpenAIModel(apiKey, model) {
    console.log(`\n--- [ATTEMPTING]: ${model} ---`);
    const postData = JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: "Say hello" }],
        max_tokens: 10,
    });

    const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            console.log(`[STATUS]: ${res.statusCode} ${res.statusMessage}`);
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    // Try to parse as JSON, but fall back to raw text if it fails
                    const jsonData = JSON.parse(data);
                    console.log('[RESPONSE BODY]:');
                    console.log(jsonData);
                } catch (e) {
                    console.log('[RAW RESPONSE BODY]:');
                    console.log(data);
                }
                resolve(); // Always resolve to continue to the next test
            });
        });

        req.on('error', (e) => {
            console.error('[REQUEST ERROR]:', e);
            resolve(); // Always resolve
        });

        req.write(postData);
        req.end();
    });
}

async function main() {
    const apiKey = process.env.DIAGNOSTIC_API_KEY;
    if (!apiKey) {
        console.error('Error: DIAGNOSTIC_API_KEY environment variable not set.');
        process.exit(1);
    }

    console.log('--- Starting Multi-Model Diagnostic ---');
    await testOpenAIModel(apiKey, 'gpt-5-codex');
    await testOpenAIModel(apiKey, 'gpt-5');
    await testOpenAIModel(apiKey, 'gpt-4o');
    console.log('\n--- Diagnostic Complete ---');
}

main();
