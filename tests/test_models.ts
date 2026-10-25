import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const dummyJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const modelsToTest = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
];

async function run() {
  for (const m of modelsToTest) {
    const t0 = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: m,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: dummyJpegBase64,
                },
              },
              {
                text: 'Respond in JSON: {"status": "ok"}',
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 20,
        },
      });
      console.log(`Model [${m}] SUCCESS in ${Date.now() - t0}ms:`, res.text?.trim());
    } catch (err: any) {
      console.log(`Model [${m}] FAILED in ${Date.now() - t0}ms: ${err?.message?.slice(0, 100)}`);
    }
  }
}

run();
