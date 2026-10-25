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

// A small 100x100 white jpeg buffer
const dummyJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function testMultimodal() {
  const t0 = Date.now();
  console.log('Testing gemini-3.1-flash-lite with image...');
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
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
              text: 'Identify what is visible in 1 short sentence JSON: {"description": "string"}'
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 100,
        temperature: 0.1,
      }
    });
    console.log(`Multimodal SUCCESS in ${Date.now() - t0}ms:`, res.text);
  } catch (err: any) {
    console.error('Multimodal FAILED:', err);
  }
}

testMultimodal();
