// Use native fetch in Node 18+
const SAMPLE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function measureEndpoint(name: string, url: string, body: any) {
  console.log(`[Start] Calling ${name}...`);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json() as any;
    const totalMs = Date.now() - t0;
    console.log(`[Done] ${name}: total=${totalMs}ms, server=${json.processing_time_ms}ms, status=${res.status}`);
    return {
      name,
      status: res.status,
      success: json.success || !json.error,
      totalMs,
      serverProcessingMs: json.processing_time_ms || 0,
      modelStatus: json.model_status || 'unknown',
      error: json.error || null,
    };
  } catch (err: any) {
    console.error(`[Error] ${name}:`, err.message);
    return {
      name,
      status: 0,
      success: false,
      totalMs: Date.now() - t0,
      serverProcessingMs: 0,
      modelStatus: 'error',
      error: err.message,
    };
  }
}

async function run() {
  console.log('--- MEASURING LATENCY BASELINE ---');
  
  // 1. Describe Surroundings
  const describeResult = await measureEndpoint('Describe Surroundings', 'http://localhost:3000/api/analyze-vision', {
    image: SAMPLE_BASE64,
    confidence: 0.20,
    imgWidth: 640,
    imgHeight: 480,
  });

  // 2. Find Object
  const findResult = await measureEndpoint('Find Object', 'http://localhost:3000/api/analyze-vision', {
    image: SAMPLE_BASE64,
    requestedObject: 'bottle',
    confidence: 0.20,
    imgWidth: 640,
    imgHeight: 480,
  });

  // 3. Read Text
  const ocrResult = await measureEndpoint('Read Text (OCR)', 'http://localhost:3000/api/ocr-vision', {
    image: SAMPLE_BASE64,
  });

  // 4. Live Stream Analyze
  const liveResult = await measureEndpoint('Live Stream Analyze', 'http://localhost:3000/api/live-stream/analyze', {
    image: SAMPLE_BASE64,
    confidence: 0.20,
  });

  console.log('\n--- BASELINE RESULTS SUMMARY ---');
  console.table([describeResult, findResult, ocrResult, liveResult]);
}

run();
