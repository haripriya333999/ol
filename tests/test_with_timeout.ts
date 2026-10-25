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

async function testOne(model: string) {
  const t0 = Date.now();
  console.log(`Starting ${model}...`);
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: dummyJpegBase64 } },
            { text: 'Respond JSON: {"status":"ok"}' },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 20,
        abortSignal: AbortSignal.timeout(6000),
      },
    });
    console.log(`[SUCCESS] ${model} in ${Date.now() - t0}ms:`, res.text?.trim());
  } catch (err: any) {
    console.log(`[FAIL] ${model} in ${Date.now() - t0}ms:`, err?.message || err);
  }
}

async function main() {
  await testOne('gemini-2.5-flash');
  await testOne('gemini-3.1-flash-lite');
}

main();
