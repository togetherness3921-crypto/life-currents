// A simple, self-contained script to test OpenAI API model access.
const https = require('https');

async function runApiTest() {
    const apiKey = process.env.OPENAI_API_KEY;
    const modelToTest = process.env.MODEL_NAME || 'gpt-5-codex';

    if (!apiKey) {
        console.error('Error: OPENAI_API_KEY environment variable is not set.');
        process.exit(1);
    }

    console.log(`--- Starting API smoke test for model: ${modelToTest} ---`);

    // The /v1/responses endpoint uses a different payload structure.
    const postData = JSON.stringify({
        model: modelToTest,
        input: 'Say "Hello, World!"',
    });

    const options = {
        hostname: 'api.openai.com',
        path: '/v1/responses',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
    };

    const req = https.request(options, (res) => {
        console.log(`Status Code: ${res.statusCode}`);
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            console.log('Response Body:');
            try {
                // Pretty-print if JSON, otherwise print raw text
                console.log(JSON.stringify(JSON.parse(data), null, 2));
            } catch {
                console.log(data);
            }
            if (res.statusCode !== 200) {
                console.error(`\n--- Test FAILED for model: ${modelToTest} ---`);
                process.exit(1);
            } else {
                console.log(`\n--- Test SUCCEEDED for model: ${modelToTest} ---`);
            }
        });
    });

    req.on('error', (e) => {
        console.error('Request Error:', e);
        process.exit(1);
    });

    req.write(postData);
    req.end();
}

runApiTest();
