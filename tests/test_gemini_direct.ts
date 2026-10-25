import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('API Key present:', Boolean(apiKey), 'Prefix:', apiKey?.slice(0, 8));

if (!apiKey) {
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function testModel(model: string) {
  const t0 = Date.now();
  console.log(`Testing model [${model}]...`);
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Respond with JSON {"status": "ok", "message": "hello"}' }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 50,
      }
    });
    console.log(`Model [${model}] SUCCESS in ${Date.now() - t0}ms:`, res.text);
  } catch (err: any) {
    console.error(`Model [${model}] FAILED in ${Date.now() - t0}ms:`, err?.message || err);
  }
}

async function run() {
  await testModel('gemini-3.1-flash-lite');
  await testModel('gemini-3.8-flash');
}

run();
