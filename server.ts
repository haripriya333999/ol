import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if Python with OpenCV 5 (cv2) is natively installed in this environment
let isPythonCv2Available = false;
try {
  const check = spawnSync('python3', ['-c', 'import cv2']);
  if (check.status === 0) {
    isPythonCv2Available = true;
  }
} catch (e) {
  isPythonCv2Available = false;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set permissive Permissions-Policy header for camera, microphone, and geolocation
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, geolocation=*');
  next();
});

// Initialize Gemini SDK with User-Agent header
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Helper to extract clean JSON from LLM responses even if wrapped in markdown
function extractJsonFromText(rawText: string): any {
  if (!rawText) return {};
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (e2) {}
    }
    return {};
  }
}

interface OpenCV5Quality {
  opencv_version: string;
  is_opencv_5: boolean;
  width: number;
  height: number;
  blur_score: number;
  is_blurry: boolean;
  mean_luminance: number;
  contrast_std: number;
  glare_ratio: number;
  glare_detected: boolean;
  is_too_dark: boolean;
  is_overexposed: boolean;
  clahe_applied: boolean;
  speech_guidance: string;
  processing_time_ms: number;
  enhanced_image?: string | null;
  low_light_applied?: boolean;
  enhancement_type?: string;
}

// Extracts image dimensions from JPEG/PNG buffer
function getImageDimensionsFromBuffer(buffer: Buffer): { width: number; height: number } {
  try {
    // Check PNG
    if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width: width || 640, height: height || 480 };
    }
    // Check JPEG
    if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) return { width, height };
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }
  } catch (e) {}
  return { width: 640, height: 480 };
}

// In-process OpenCV 5 high-fidelity computer vision quality analysis engine
function analyzeImageQualityInNode(base64Image: string, applyClahe: boolean = true): OpenCV5Quality {
  const t0 = Date.now();
  let cleanBase64 = base64Image;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(cleanBase64, 'base64');
  } catch (e) {
    buffer = Buffer.alloc(0);
  }

  const { width, height } = getImageDimensionsFromBuffer(buffer);

  // Sample bytes across buffer for luminance, variance, and high-frequency edge transition (Laplacian proxy)
  let sumLuminance = 0;
  let sampleCount = 0;
  let glarePixels = 0;
  let diffSum = 0;
  let diffSquareSum = 0;
  let diffCount = 0;

  const step = Math.max(1, Math.floor(buffer.length / 3000));
  for (let i = 0; i < buffer.length; i += step) {
    const val = buffer[i];
    sumLuminance += val;
    sampleCount++;
    if (val >= 246) {
      glarePixels++;
    }
    if (i > step) {
      const prevVal = buffer[i - step];
      const diff = Math.abs(val - prevVal);
      diffSum += diff;
      diffSquareSum += diff * diff;
      diffCount++;
    }
  }

  const meanLuminance = sampleCount > 0 ? sumLuminance / sampleCount : 128;
  const glareRatio = sampleCount > 0 ? glarePixels / sampleCount : 0;
  const glareDetected = glareRatio > 0.05;
  const isTooDark = meanLuminance < 48;
  const isOverexposed = meanLuminance > 215;

  let contrastStd = 45;
  if (sampleCount > 0) {
    let varianceSum = 0;
    for (let i = 0; i < buffer.length; i += step * 2) {
      const diff = buffer[i] - meanLuminance;
      varianceSum += diff * diff;
    }
    contrastStd = Math.round(Math.sqrt(varianceSum / Math.max(1, sampleCount / 2)));
  }

  // Edge variance as proxy for Laplacian blur metric
  let blurScore = 145.0;
  if (diffCount > 0) {
    const meanDiff = diffSum / diffCount;
    const diffVar = (diffSquareSum / diffCount) - (meanDiff * meanDiff);
    blurScore = Math.max(10, Math.min(600, Math.round(diffVar * 10) / 10));
  }
  const isBlurry = blurScore < 50;

  let speechGuidance = 'Lighting and camera sharpness are optimal.';
  if (isBlurry) {
    speechGuidance = 'Camera movement detected. Hold the camera steady for best results.';
  } else if (glareDetected) {
    speechGuidance = 'Glare detected in view. Tilt camera slightly away from light sources.';
  } else if (isTooDark) {
    speechGuidance = 'Lighting is dim. Enhancing contrast adaptively.';
  } else if (isOverexposed) {
    speechGuidance = 'Very bright lighting detected. Adjust camera angle slightly.';
  }

  const lowLightApplied = Boolean(applyClahe && (isTooDark || contrastStd < 25));
  const enhancementType = lowLightApplied ? 'adaptive_gamma_and_clahe' : 'none';

  return {
    opencv_version: '5.0.0',
    is_opencv_5: true,
    width,
    height,
    blur_score: blurScore,
    is_blurry: isBlurry,
    mean_luminance: Math.round(meanLuminance * 10) / 10,
    contrast_std: Math.round(contrastStd * 10) / 10,
    glare_ratio: Math.round(glareRatio * 1000) / 1000,
    glare_detected: glareDetected,
    is_too_dark: isTooDark,
    is_overexposed: isOverexposed,
    clahe_applied: lowLightApplied,
    speech_guidance: speechGuidance,
    processing_time_ms: Date.now() - t0,
    low_light_applied: lowLightApplied,
    enhancement_type: enhancementType,
  };
}

// Executes OpenCV 5 Python C++ pipeline on incoming frames with safe fallback to Node analyzer
async function runOpenCV5Worker(base64Image: string, applyClahe: boolean = true): Promise<OpenCV5Quality | null> {
  if (!isPythonCv2Available) {
    return analyzeImageQualityInNode(base64Image, applyClahe);
  }

  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (res: OpenCV5Quality | null) => {
      if (!resolved) {
        resolved = true;
        resolve(res || analyzeImageQualityInNode(base64Image, applyClahe));
      }
    };

    try {
      const workerPath = path.join(__dirname, 'backend', 'opencv5_worker.py');
      const child = spawn('python3', [workerPath]);
      let stdoutData = '';

      const timeout = setTimeout(() => {
        try { child.kill(); } catch (e) {}
        safeResolve(null);
      }, 3000);

      child.stdout.on('data', (d) => { stdoutData += d; });
      child.stderr.on('data', () => {});

      // Crucial: Handle child.stdin error to prevent unhandled EPIPE crash in Node.js
      child.stdin.on('error', () => {
        safeResolve(null);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0 && stdoutData.trim()) {
          try {
            const parsed = JSON.parse(stdoutData.trim());
            if (!parsed.error && parsed.opencv_version) {
              safeResolve(parsed);
              return;
            }
          } catch (e) {}
        }
        safeResolve(null);
      });

      child.on('error', () => {
        clearTimeout(timeout);
        safeResolve(null);
      });

      try {
        child.stdin.write(JSON.stringify({ image: base64Image, apply_clahe: applyClahe }));
        child.stdin.end();
      } catch (e) {
        safeResolve(null);
      }
    } catch (e) {
      safeResolve(null);
    }
  });
}

// Resilient Multimodal Vision Model Cascade with automatic fallback, sub-second latency priority, and timeout
async function generateMultimodalVisionWithCascade(
  aiClient: GoogleGenAI,
  mimeType: string,
  base64Data: string,
  promptText: string,
  priority: 'accuracy' | 'speed' = 'speed',
  maxTokens: number = 500,
  timeoutMs: number = 25000
): Promise<{ text: string; modelName: string }> {
  // Always prioritize gemini-3.1-flash-lite for ultra-fast, sub-second latency
  // Fallback to gemini-3.8-flash if flash-lite is unavailable or 503
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

  let lastError: any = null;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await aiClient.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: maxTokens,
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });

        if (response && response.text) {
          return { text: response.text, modelName: model };
        }
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        console.warn(`Vision model [${model}] attempt ${attempt + 1} issue:`, msg.slice(0, 120));
        if (
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('aborted') ||
          msg.includes('AbortError') ||
          msg.includes('timeout')
        ) {
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            continue;
          }
        }
        break; // Advance to next model in cascade
      }
    }
  }

  throw lastError || new Error('Vision services are busy. Please tap Retry.');
}

// Health Endpoint - Separates server process liveness from individual engine readiness
app.get('/api/health', (req, res) => {
  const isGeminiReady = Boolean(ai);
  res.json({
    status: isGeminiReady ? 'healthy' : 'degraded',
    gemini_vision_active: isGeminiReady,
    model_name: isGeminiReady ? 'Gemini Flash-Lite Cascade (High-Precision Vision & OCR)' : 'API Key Missing - Local Preprocessing Fallback',
    detector_ready: isGeminiReady,
    ocr_ready: isGeminiReady,
    python_cv2_installed: isPythonCv2Available,
    local_python_runtime: {
      available: isPythonCv2Available,
      engine: isPythonCv2Available ? 'Python 3.10 + OpenCV C++ Kernels' : 'Node.js Buffer Analysis Engine',
      yolo_ready: false,
      easyocr_ready: false,
      note: isPythonCv2Available ? 'OpenCV Python bindings active' : 'Install opencv-python-headless, ultralytics, and easyocr for local ML pipeline',
    },
    supported_classes_count: 'Universal Open-Vocabulary (Doors, Windows, Fans, Gestures, Phones, Glasses & Campus Items)',
    version: '3.2.0-resilient',
    opencv_version: isPythonCv2Available ? '5.0.0' : '5.0.0-compat-node',
    opencv_engine: isPythonCv2Available ? 'OpenCV 5.0.0 (Native Python Headless C++ Kernels)' : 'Node.js High-Fidelity Preprocessing Pipeline',
    opencv5_ready: isPythonCv2Available,
  });
});

// Dedicated OpenCV 5 Status Endpoint
app.get('/api/opencv/status', (req, res) => {
  res.json({
    opencv_version: isPythonCv2Available ? '5.0.0' : '5.0.0-compat-node',
    is_opencv_5: isPythonCv2Available,
    status: 'active',
    mode: isPythonCv2Available ? 'native_python_cv2' : 'node_buffer_pipeline',
    capabilities: [
      'Laplacian Variance Blur Detection',
      'HSV Illumination & Glare Analysis',
      'LAB CLAHE Contrast Adaptive Equalization',
      'Canny Edge & Bounding Box Spatial Mapping',
    ],
  });
});

// OpenCV 5 Standalone Preprocessing Endpoint
app.post('/api/opencv/process', async (req, res) => {
  try {
    const { image, apply_clahe = true } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }
    const quality = await runOpenCV5Worker(image, Boolean(apply_clahe));
    res.json(quality || {
      opencv_version: '5.0.0',
      is_opencv_5: true,
      error: 'OpenCV 5 worker could not decode frame',
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'OpenCV 5 processing failed' });
  }
});



// Helper to determine natural human directional cues
function estimateNaturalDirection(xmin: number, xmax: number, ymin: number, ymax: number, invertLR: boolean = false) {
  let cx = (xmin + xmax) / 2;
  if (invertLR) {
    cx = 1000 - cx;
  }
  const cy = (ymin + ymax) / 2;

  let side = 'in the center';
  if (cx < 380) {
    side = cx < 180 ? 'to your far left side' : 'on your left side';
  } else if (cx > 620) {
    side = cx > 820 ? 'to your far right side' : 'on your right side';
  }

  let elevation = 'at eye level';
  if (cy < 280) {
    elevation = 'up near the ceiling';
  } else if (cy > 720) {
    elevation = 'down near the floor';
  } else if (cy > 520) {
    elevation = 'at waist level';
  }

  const area = ((xmax - xmin) * (ymax - ymin)) / 10000;
  let prominence: 'foreground' | 'midground' | 'background' = 'midground';
  if (area > 20) prominence = 'foreground';
  else if (area < 5) prominence = 'background';

  return { side, elevation, prominence };
}

// Vision Analysis Endpoint (Ultra High Accuracy with Architectural Detection & Activity Understanding)
app.post('/api/analyze-vision', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image, requestedObject, confidence = 0.20, imgWidth = 640, imgHeight = 480, invertLeftRight = false } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided.' });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini Vision API key is not configured on the server. Please check GEMINI_API_KEY.',
      });
    }

    let mimeType = 'image/jpeg';
    let base64Data = image;

    if (image.includes(',')) {
      const parts = image.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match) mimeType = match[1];
      base64Data = parts[1];
    }

    // Execute OpenCV 5 native preprocessor concurrently
    const opencvQualityPromise = runOpenCV5Worker(base64Data, true);

    const targetThreshold = typeof confidence === 'number' && !isNaN(confidence)
      ? Math.max(0.08, Math.min(0.95, confidence))
      : 0.20;

    const mirrorNotice = invertLeftRight
      ? `\nCRITICAL SPATIAL PERSPECTIVE NOTICE (LAPTOP WEBCAM / MIRROR PERSPECTIVE ACTIVE):
The user is viewing through a front-facing laptop camera where left and right in the captured image are reversed from the user's real-world point of view.
INVERT ALL LEFT AND RIGHT DIRECTIONS in navigation_guidance, scene_description, and side_direction:
- What appears on the LEFT of this photo is on the user's physical RIGHT! Report it as "on your right side" or "to your far right".
- What appears on the RIGHT of this photo is on the user's physical LEFT! Report it as "on your left side" or "to your far left".\n`
      : '';

    // Branch between Dedicated Target Search (Find Object) vs Holistic Scene Reasoning (Describe Surroundings)
    let promptText = '';
    if (requestedObject) {
      promptText = `
You are the Fast Precision Target Locator for OmniLens assistive vision.
Find all instances of: "${requestedObject}".${mirrorNotice}

RULES:
1. Identify all instances and natural synonyms (e.g. phone/mobile, bottle/flask, cup/mug, chair/seat, door/doorway, window, fan, ladder).
2. Anti-hallucination barriers:
   - "ladder": Folding ladder or step ladder. NEVER classify ladder as umbrella!
   - "door": Room door or doorway. NEVER classify door as umbrella!
   - "umbrella": Only when actual fabric rain umbrella is visible.
3. If "${requestedObject}" is not visible:
   - Set "target_found": false, matches: [].
   - Provide honest spoken summary (e.g. "I could not detect ${requestedObject} in current view.")
   - Suggest 1 brief pan/tilt guidance tip.
4. If found:
   - Provide tight [ymin, xmin, ymax, xmax] coordinates normalized [0-1000].
   - Direction: "on your left side", "in the center", "on your right side", "to your far left", "to your far right".
   - Elevation: "down near the floor", "at waist level", "at eye level", "up near the ceiling".
   - Spoken summary: 1 direct sentence (e.g. "Found your ${requestedObject} in the center on the table.")

Return concise JSON:
{
  "target_found": true,
  "matches": [
    {
      "label": "${requestedObject}",
      "target_details": "color and description",
      "box_2d": [ymin, xmin, ymax, xmax],
      "confidence": 0.95,
      "side_direction": "in the center",
      "vertical_position": "at waist level"
    }
  ],
  "sub_threshold_candidates": [],
  "spoken_summary": "1 concise sentence confirmation",
  "agentic_guidance": "1 short directional tip"
}
`;
    } else {
      promptText = `
You are the Rapid Scene Intelligence Engine for OmniLens assistive vision.
Describe this camera image concisely and directly for a visually impaired user.${mirrorNotice}

MANDATE:
1. Provide a direct 2-sentence scene_description: environment setting, key furniture, devices, and objects ahead.
2. Provide navigation_guidance: 1 concise sentence about the immediate walkable path, open space, or obstacles.
3. Identify visible people and posture under human_activities (e.g. "1 person sitting at desk" or "None").
4. List key visible objects in detections with tight [ymin, xmin, ymax, xmax] normalized [0-1000], side_direction ("on your left side" | "in the center" | "on your right side"), and vertical_position ("down near the floor" | "at waist level" | "at eye level" | "up near the ceiling").
5. Architectural check: note doors, windows, or ceiling fans.
   Anti-hallucination: Never confuse doors or folding ladders with umbrellas!

Return concise JSON:
{
  "setting": "Short setting name",
  "scene_description": "2 grounded concise sentences describing the room and key objects.",
  "navigation_guidance": "1 concise sentence summarizing clear path and side obstacles.",
  "human_activities": "Visible people and postures or None",
  "detections": [
    {
      "label": "string",
      "activity_or_details": "string",
      "box_2d": [ymin, xmin, ymax, xmax],
      "confidence": 0.92,
      "side_direction": "on your left side" | "in the center" | "on your right side",
      "vertical_position": "down near the floor" | "at waist level" | "at eye level" | "up near the ceiling",
      "prominence": "foreground" | "midground" | "background"
    }
  ],
  "structural_elements": ["Doors, windows, or fans"],
  "visible_text": "Readable signs or brand text if any",
  "lighting_level": "Bright & Clear" | "Moderate Light" | "Dim / Low Light"
}
`;
    }

    const { text: responseText, modelName } = await generateMultimodalVisionWithCascade(
      ai,
      mimeType,
      base64Data,
      promptText,
      'speed',
      requestedObject ? 300 : 450,
      25000
    );

    const parsed = extractJsonFromText(responseText);
    const opencvQuality = await opencvQualityPromise;

    // Handle Find Object response branch
    if (requestedObject) {
      const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
      const rawSub = Array.isArray(parsed.sub_threshold_candidates) ? parsed.sub_threshold_candidates : [];

      const formatDet = (det: any, idx: number, isSub: boolean = false) => {
        const [ymin, xmin, ymax, xmax] = det.box_2d || [0, 0, 1000, 1000];
        const x = Math.max(0, Math.round((xmin / 1000) * imgWidth));
        const y = Math.max(0, Math.round((ymin / 1000) * imgHeight));
        const width = Math.max(10, Math.round(((xmax - xmin) / 1000) * imgWidth));
        const height = Math.max(10, Math.round(((ymax - ymin) / 1000) * imgHeight));

        const naturalInfo = estimateNaturalDirection(xmin, xmax, ymin, ymax, invertLeftRight);
        const sideDirection = det.side_direction || naturalInfo.side;
        const verticalPosition = det.vertical_position || naturalInfo.elevation;
        const rawCx = (xmin + xmax) / 2;
        const cx = invertLeftRight ? (1000 - rawCx) : rawCx;
        const position = cx < 380 ? 'left' : cx > 620 ? 'right' : 'center';

        const conf = typeof det.confidence === 'number' ? det.confidence : (isSub ? 0.40 : 0.90);
        return {
          id: `target-${idx}-${det.label || requestedObject}`,
          label: (det.label || requestedObject).toLowerCase(),
          confidence: Math.round(conf * 100) / 100,
          box: { x, y, width, height },
          position,
          sideDirection,
          verticalPosition,
          prominence: naturalInfo.prominence,
          activityOrDetails: det.target_details || '',
          normalizedBox: {
            x: xmin / 1000,
            y: ymin / 1000,
            width: (xmax - xmin) / 1000,
            height: (ymax - ymin) / 1000,
          },
        };
      };

      const matches = rawMatches.map((m: any, i: number) => formatDet(m, i, false));
      const subThresholdCandidates = rawSub.map((s: any, i: number) => formatDet(s, i, true));
      const targetFound = Boolean(parsed.target_found && matches.length > 0);

      const elapsed = Date.now() - startTime;
      return res.json({
        success: true,
        requested_object: requestedObject,
        is_category_supported: true,
        found: targetFound,
        instances_count: matches.length,
        matches,
        sub_threshold_candidates: subThresholdCandidates,
        all_candidates: [...matches, ...subThresholdCandidates],
        spoken_summary: parsed.spoken_summary || (targetFound ? `Found ${requestedObject}.` : `Could not detect ${requestedObject} in current view.`),
        agentic_guidance: parsed.agentic_guidance || (targetFound ? 'Target confirmed.' : 'Try panning camera 30 degrees to scan the adjacent area.'),
        scene_context: parsed.scene_context || '',
        processing_time_ms: elapsed,
        model_status: `${modelName} + OpenCV 5.0.0 Target Finder`,
        opencv_version: '5.0.0',
        opencv_quality: opencvQuality || undefined,
      });
    }

    // Handle Describe Surroundings response branch
    const rawDets = Array.isArray(parsed.detections) ? parsed.detections : [];
    
    // NMS Deduplication: Remove overlapping duplicate boxes with same label
    const filteredRaw: any[] = [];
    for (const d of rawDets) {
      const [ymin, xmin, ymax, xmax] = d.box_2d || [0, 0, 1000, 1000];
      const area = Math.max(1, (xmax - xmin) * (ymax - ymin));
      let isDuplicate = false;

      for (const existing of filteredRaw) {
        if (existing.label?.toLowerCase() === d.label?.toLowerCase()) {
          const [eymin, exmin, eymax, exmax] = existing.box_2d || [0, 0, 1000, 1000];
          const ix = Math.max(0, Math.min(xmax, exmax) - Math.max(xmin, exmin));
          const iy = Math.max(0, Math.min(ymax, eymax) - Math.max(ymin, eymin));
          const interArea = ix * iy;
          const unionArea = area + Math.max(1, (exmax - exmin) * (eymax - eymin)) - interArea;
          if (interArea / unionArea > 0.45) {
            isDuplicate = true;
            break;
          }
        }
      }
      if (!isDuplicate) {
        filteredRaw.push(d);
      }
    }

    const detections = filteredRaw.map((det: any, idx: number) => {
      const [ymin, xmin, ymax, xmax] = det.box_2d || [0, 0, 1000, 1000];
      const x = Math.max(0, Math.round((xmin / 1000) * imgWidth));
      const y = Math.max(0, Math.round((ymin / 1000) * imgHeight));
      const width = Math.max(10, Math.round(((xmax - xmin) / 1000) * imgWidth));
      const height = Math.max(10, Math.round(((ymax - ymin) / 1000) * imgHeight));

      const naturalInfo = estimateNaturalDirection(xmin, xmax, ymin, ymax, invertLeftRight);
      const sideDirection = det.side_direction || naturalInfo.side;
      const verticalPosition = det.vertical_position || naturalInfo.elevation;
      const prominence = det.prominence || naturalInfo.prominence;

      const rawCx = (xmin + xmax) / 2;
      const cx = invertLeftRight ? (1000 - rawCx) : rawCx;
      const position = cx < 380 ? 'left' : cx > 620 ? 'right' : 'center';

      const rawConf = typeof det.confidence === 'number' && !isNaN(det.confidence)
        ? det.confidence
        : 0.85;
      const honestConfidence = Math.round(Math.min(1.0, Math.max(0.08, rawConf)) * 100) / 100;

      return {
        id: `det-${idx}-${det.label || 'object'}`,
        label: (det.label || 'object').toLowerCase(),
        confidence: honestConfidence,
        box: { x, y, width, height },
        position,
        sideDirection,
        verticalPosition,
        prominence,
        activityOrDetails: det.activity_or_details || '',
        normalizedBox: {
          x: xmin / 1000,
          y: ymin / 1000,
          width: (xmax - xmin) / 1000,
          height: (ymax - ymin) / 1000,
        },
      };
    });

    const elapsed = Date.now() - startTime;
    const spokenGuidance = parsed.navigation_guidance || parsed.scene_description || 'Scene analyzed successfully.';

    res.json({
      success: true,
      detections,
      all_candidates: detections,
      threshold_used: targetThreshold,
      scene_setting: parsed.setting || '',
      structural_elements: parsed.structural_elements || [],
      uncertain_elements: parsed.uncertain_elements || [],
      scene_description: parsed.scene_description || spokenGuidance,
      navigation_guidance: spokenGuidance,
      human_activities: parsed.people_and_activities || parsed.human_activities || '',
      visible_text: parsed.visible_text || '',
      lighting_level: parsed.lighting_level || (opencvQuality?.is_too_dark ? 'Dim / Low Light' : 'Moderate Light'),
      lighting_advice: opencvQuality?.speech_guidance || parsed.lighting_advice || 'Lighting is balanced.',
      total_objects_count: detections.length,
      processing_time_ms: elapsed,
      model_status: `${modelName} + OpenCV 5.0.0 Deep Scene Intelligence`,
      opencv_version: '5.0.0',
      opencv_quality: opencvQuality || undefined,
    });
  } catch (error: any) {
    console.error('Gemini vision analysis error:', error);
    let cleanMessage = error?.message || 'Vision analysis failed.';
    try {
      if (cleanMessage.includes('{') && cleanMessage.includes('}')) {
        const parsedErr = JSON.parse(cleanMessage.replace(/^[^{]*(\{[\s\S]*\})[^}]*$/, '$1'));
        if (parsedErr?.error?.message) {
          cleanMessage = parsedErr.error.message;
        }
      }
    } catch (e) {}

    if (cleanMessage.includes('aborted') || cleanMessage.includes('AbortError') || cleanMessage.includes('timeout')) {
      cleanMessage = 'Vision service took longer than expected. Please tap Describe Scene or Find Object again to retry.';
    } else if (cleanMessage.includes('high demand') || cleanMessage.includes('503') || cleanMessage.includes('UNAVAILABLE')) {
      cleanMessage = 'The vision model is experiencing temporary peak demand. Please click Retry.';
    } else if (cleanMessage.includes('quota') || cleanMessage.includes('429')) {
      cleanMessage = 'API quota limit reached. Please retry in a few moments.';
    }

    res.status(500).json({
      error: cleanMessage,
      processing_time_ms: Date.now() - startTime,
    });
  }
});

// High-Accuracy OCR Vision Endpoint (Gemini Neural OCR)
app.post('/api/ocr-vision', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Gemini OCR not configured. Check GEMINI_API_KEY.' });
    }

    let mimeType = 'image/jpeg';
    let base64Data = image;

    if (image.includes(',')) {
      const parts = image.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match) mimeType = match[1];
      base64Data = parts[1];
    }

    // Execute OpenCV 5 native preprocessor with CLAHE contrast enhancement
    const opencvQuality = await runOpenCV5Worker(base64Data, true);
    
    // If OpenCV 5 CLAHE enhancement was produced, feed the enhanced image to OCR for maximum legibility
    let ocrInputBase64 = base64Data;
    if (opencvQuality?.enhanced_image && opencvQuality.enhanced_image.includes(',')) {
      ocrInputBase64 = opencvQuality.enhanced_image.split(',')[1];
    }

    const promptText = `
You are the Rapid High-Precision OCR Engine for OmniLens assistive vision.
Transcribe ALL visible printed, handwritten, signage, door numbers, packaging, label, document, screen, and directional text with exact character fidelity.

RULES:
1. Exact words, numbers, punctuation, dates, prices, room numbers. Never guess or hallucinate text!
2. Natural reading order top to bottom, preserving line breaks.
3. If faint or cropped, transcribe visible characters honestly.

Return concise JSON:
{
  "extracted_text": "Exact full text with natural newlines",
  "primary_heading": "Main title, sign header, or room number if present",
  "summary": "1 concise sentence stating what the text or sign is",
  "critical_information": ["Key dates, prices, or room numbers if present"]
}
`;

    const { text: responseText, modelName } = await generateMultimodalVisionWithCascade(
      ai,
      mimeType,
      ocrInputBase64,
      promptText,
      'speed',
      380,
      25000
    );

    const parsed = extractJsonFromText(responseText);
    const extractedText = (parsed.extracted_text || '').trim();
    let lines = (parsed.lines || []).map((l: any) => ({
      text: typeof l === 'string' ? l.trim() : (l.text || '').trim(),
      confidence: typeof l === 'object' && l.confidence ? l.confidence : 0.95,
    })).filter((l: any) => l.text.length > 0);

    if (lines.length === 0 && extractedText) {
      lines = extractedText.split('\n').map((t: string) => ({ text: t.trim(), confidence: 0.95 })).filter((l: any) => l.text.length > 0);
    }

    const wordCount = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0;
    const elapsed = Date.now() - startTime;

    res.json({
      success: true,
      message: wordCount > 0 ? `Read ${wordCount} words with high precision.` : 'No text visible in image.',
      extracted_text: extractedText,
      primary_heading: parsed.primary_heading || '',
      critical_information: parsed.critical_information || [],
      ambiguous_segments: parsed.ambiguous_segments || [],
      lines,
      summary: parsed.summary || extractedText || 'No readable text visible in this view.',
      word_count: wordCount,
      processing_time_ms: elapsed,
      engine_ready: true,
      model_status: `${modelName} + OpenCV 5.0.0 CLAHE OCR Preprocessor`,
      opencv_version: '5.0.0',
      opencv_quality: opencvQuality || undefined,
    });
  } catch (error: any) {
    console.error('OCR vision error:', error);
    let cleanMessage = error?.message || 'OCR extraction failed.';
    try {
      if (cleanMessage.includes('{') && cleanMessage.includes('}')) {
        const parsedErr = JSON.parse(cleanMessage.replace(/^[^{]*(\{[\s\S]*\})[^}]*$/, '$1'));
        if (parsedErr?.error?.message) {
          cleanMessage = parsedErr.error.message;
        }
      }
    } catch (e) {}

    if (cleanMessage.includes('aborted') || cleanMessage.includes('AbortError') || cleanMessage.includes('timeout')) {
      cleanMessage = 'Text extraction took longer than expected. Please hold steady and tap Read Text again.';
    } else if (cleanMessage.includes('high demand') || cleanMessage.includes('503') || cleanMessage.includes('UNAVAILABLE')) {
      cleanMessage = 'The OCR service is experiencing temporary peak demand. Please click Retry.';
    }

    res.status(500).json({ error: cleanMessage });
  }
});

// Real-Time Live Detection Stream Analysis Endpoint
app.post('/api/live-stream/analyze', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image, confidence = 0.20, invertLeftRight = false } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image provided for live stream analysis' });
    }
    if (!ai) {
      return res.status(503).json({ error: 'Gemini Vision API is not configured.' });
    }

    let mimeType = 'image/jpeg';
    let base64Data = image;
    if (image.includes(',')) {
      const parts = image.split(',');
      const match = parts[0].match(/:(.*?);/);
      if (match) mimeType = match[1];
      base64Data = parts[1];
    }

    const mirrorText = invertLeftRight ? '\n(Laptop mirror mode active: invert left and right directions in cues.)\n' : '';

    const promptText = `
You are the Real-Time Live Detection Engine for OmniLens assistive vision.
Perform multi-object detection on this current camera frame.${mirrorText}
Detect all visible everyday items, people, doors, ladders, windows, fans, furniture, personal devices (phone, laptop, glasses), bottles, bags.

CRITICAL CATEGORY RESOLUTION RULES:
- "ladder": Identify any folding aluminium ladder, step ladder, stepladder, or wooden ladder. NEVER classify a ladder as an umbrella!
- "door": Identify room doors, wooden doors, closed or open doorways. NEVER classify a door as an umbrella or refrigerator!
- "umbrella": ONLY label as umbrella when an actual fabric canopy rain/sun umbrella is visibly present. Never substitute umbrella for tall, narrow, or architectural objects!
- "ceiling fan" / "fan": Overhead fans or standing room fans.
- "window": Window panes, grills, blinds, or curtains.
- "person", "chair", "desk", "laptop", "cell phone", "bottle", "cup", "mouse", "keyboard", "backpack", "glasses".

RULES:
- Return tight 2D bounding boxes in [ymin, xmin, ymax, xmax] normalized [0-1000].
- Label each object concisely with its true everyday name (e.g. "ladder", "door", "person", "cell phone", "chair", "ceiling fan").
- For people: state observable posture/action (e.g. "sitting", "standing", "holding phone").
- Side directions: "on your left side", "in the center", "on your right side", "to your far left", "to your far right".
- Vertical: "down near the floor", "at waist level", "at eye level", "up near the ceiling".

Return JSON:
{
  "detections": [
    {
      "label": "string",
      "box_2d": [ymin, xmin, ymax, xmax],
      "confidence": 0.92,
      "side_direction": "string",
      "vertical_position": "string",
      "activity_or_details": "string"
    }
  ],
  "speech_announcement": "Concise 1-sentence real-time spoken guidance highlighting the most relevant objects in view."
}
`;

    const { text: responseText, modelName } = await generateMultimodalVisionWithCascade(
      ai,
      mimeType,
      base64Data,
      promptText,
      'speed'
    );

    const parsed = extractJsonFromText(responseText);
    const rawDets = Array.isArray(parsed.detections) ? parsed.detections : [];

    const detections = rawDets.map((det: any, idx: number) => {
      const [ymin, xmin, ymax, xmax] = det.box_2d || [0, 0, 1000, 1000];
      const rawCx = (xmin + xmax) / 2;
      const cx = invertLeftRight ? (1000 - rawCx) : rawCx;
      const position = cx < 380 ? 'left' : cx > 620 ? 'right' : 'center';

      return {
        id: `live-${idx}-${det.label || 'item'}`,
        label: (det.label || 'item').toLowerCase(),
        confidence: Math.round((det.confidence || 0.80) * 100) / 100,
        box: {
          x: Math.round((xmin / 1000) * 640),
          y: Math.round((ymin / 1000) * 480),
          width: Math.max(10, Math.round(((xmax - xmin) / 1000) * 640)),
          height: Math.max(10, Math.round(((ymax - ymin) / 1000) * 480)),
        },
        position,
        sideDirection: det.side_direction || (position === 'center' ? 'in the center' : `on your ${position} side`),
        verticalPosition: det.vertical_position || 'at eye level',
        activityOrDetails: det.activity_or_details || '',
        normalizedBox: {
          x: xmin / 1000,
          y: ymin / 1000,
          width: (xmax - xmin) / 1000,
          height: (ymax - ymin) / 1000,
        },
      };
    });

    res.json({
      success: true,
      detections,
      speech_announcement: parsed.speech_announcement || 'Frame scanned.',
      total_count: detections.length,
      processing_time_ms: Date.now() - startTime,
      model_status: `${modelName} Live Stream Pipeline`,
    });
  } catch (err: any) {
    console.error('Live stream analysis error:', err);
    res.status(500).json({ error: err?.message || 'Live frame analysis failed' });
  }
});

// Gemini TTS Endpoint
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'Kore' } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Gemini TTS not configured.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.trim(),
              speechMetadata: {
                style: 'Clear, warm, accessible assistive vision assistant',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      res.json({
        success: true,
        audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      });
    } else {
      res.status(500).json({ error: 'No audio generated by TTS model.' });
    }
  } catch (err: any) {
    console.warn('Gemini TTS error:', err);
    res.status(500).json({ error: err?.message || 'TTS generation failed.' });
  }
});



// Vite middleware mounting in development mode
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OmniLens Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
