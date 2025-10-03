// .github/scripts/diagnose_key.cjs
const https = require('https');

async function testOpenAIModel(apiKey, model, prompt) {
    console.log(`\n--- Testing model: ${model} ---`);
    const postData = JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
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

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            console.log(`Status Code: ${res.statusCode}`);
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log('Response Body:', JSON.parse(data));
                if (res.statusCode >= 400) {
                    reject(new Error(`Request failed with status ${res.statusCode}`));
                } else {
                    resolve(data);
                }
            });
        });

        req.on('error', (e) => {
            console.error('Request Error:', e);
            reject(e);
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

    const testPrompt = 'Say "hello"';

    try {
        await testOpenAIModel(apiKey, 'gpt-5-codex', testPrompt);
        console.log('\n✅ Diagnosis: The API key is VALID and has access to gpt-5-codex.');
    } catch (error) {
        console.error(`\n❌ Failed to call gpt-5-codex.`);
        console.log('\n--- Attempting fallback test with gpt-4o ---');
        try {
            await testOpenAIModel(apiKey, 'gpt-4o', testPrompt);
            console.log('\n✅ Diagnosis: The API key is VALID, but it appears to LACK ACCESS to the gpt-5-codex model.');
        } catch (fallbackError) {
            console.error(`\n❌ Failed to call gpt-4o as well.`);
            console.log('\n--- Diagnosis ---');
            console.log('The API key appears to be INVALID or has other fundamental issues, as it failed for both models.');
        }
    }
}

main();
