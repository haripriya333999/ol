import {
  DescribeResponse,
  FindResponse,
  OCRResponse,
  HealthResponse,
  EngineMode,
  Detection,
  SUPPORTED_EVERYDAY_CLASSES,
} from '../types';
import {
  cleanSearchQuery,
  findSynonymCluster,
  filterDetectionsWithSensitivity,
  isDetectionMatch,
} from './synonymMatcher';

const DEFAULT_PYTHON_URL = 'http://localhost:8000';

class ApiService {
  private engineMode: EngineMode = 'gemini-vision';
  private backendUrl: string = DEFAULT_PYTHON_URL;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('omnilens_engine_mode');
      if (savedMode === 'gemini-vision' || savedMode === 'python-fastapi' || savedMode === 'web-ml') {
        this.engineMode = savedMode as EngineMode;
      }
      const savedUrl = localStorage.getItem('omnilens_backend_url');
      if (savedUrl) {
        this.backendUrl = savedUrl;
      }
    }
  }

  public getEngineMode(): EngineMode {
    return this.engineMode;
  }

  public setEngineMode(mode: EngineMode): void {
    this.engineMode = mode;
    if (typeof window !== 'undefined') {
      localStorage.setItem('omnilens_engine_mode', mode);
    }
  }

  public getBackendUrl(): string {
    return this.backendUrl;
  }

  public setBackendUrl(url: string): void {
    this.backendUrl = url.trim() || DEFAULT_PYTHON_URL;
    if (typeof window !== 'undefined') {
      localStorage.setItem('omnilens_backend_url', this.backendUrl);
    }
  }

  /**
   * Check connection and health of backend / engine
   */
  public async checkHealth(): Promise<HealthResponse> {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        return {
          status: data.status === 'healthy' ? 'healthy' : 'degraded',
          model_name: data.model_name || 'Gemini Flash-Lite Cascade (High-Precision Vision & OCR)',
          detector_ready: Boolean(data.detector_ready),
          ocr_ready: Boolean(data.ocr_ready),
          gemini_vision_active: Boolean(data.gemini_vision_active),
          supported_classes_count: data.supported_classes_count || 'Universal Open-Vocabulary',
          version: data.version || '3.2.0',
          opencv_version: data.opencv_version || '5.0.0',
          opencv5_ready: Boolean(data.opencv5_ready),
        };
      }
    } catch (e) {
      // server route fallback
    }

    if (this.engineMode === 'python-fastapi') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${this.backendUrl}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          return {
            status: data.status === 'ok' ? 'healthy' : 'degraded',
            model_name: data.model_name || 'Ultralytics YOLO (Python FastAPI)',
            detector_ready: Boolean(data.detector_ready),
            ocr_ready: Boolean(data.ocr_ready),
            supported_classes_count: data.supported_classes_count || 80,
            version: data.version || '1.1.0',
            opencv_version: data.opencv_version || '5.0.0',
            opencv5_ready: Boolean(data.opencv_ready),
          };
        }
      } catch (err) {
        // failed
      }
    }

    return {
      status: 'offline',
      model_name: 'No Vision Service Connected',
      detector_ready: false,
      ocr_ready: false,
      supported_classes_count: 0,
      version: '3.2.0',
      opencv_version: 'Unavailable',
      opencv5_ready: false,
    };
  }

  /**
   * Describe Surroundings Task with human activity and gesture identification
   */
  public async describeSurroundings(
    imageElement: HTMLImageElement | string,
    file?: File | Blob,
    minConfidence: number = 0.20,
    invertLeftRight: boolean = false
  ): Promise<DescribeResponse> {
    const imgWidth = typeof imageElement === 'string' ? 640 : (imageElement.naturalWidth || imageElement.width || 640);
    const imgHeight = typeof imageElement === 'string' ? 480 : (imageElement.naturalHeight || imageElement.height || 480);

    // Prioritized Engine: High-Precision Gemini Vision & Activity Analyzer
    if (this.engineMode === 'gemini-vision') {
      try {
        const dataUrl = imageElementToDataUrl(imageElement, 768, 0.80);
        const res = await fetch('/api/analyze-vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: dataUrl,
            confidence: minConfidence,
            imgWidth,
            imgHeight,
            invertLeftRight,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return {
            success: true,
            message: `Detected ${data.detections.length} objects & room features.`,
            detections: data.detections,
            scene_description: data.scene_description,
            navigation_guidance: data.navigation_guidance,
            human_activities: data.human_activities,
            visible_text: data.visible_text || '',
            total_objects_count: data.detections.length,
            processing_time_ms: data.processing_time_ms,
            model_status: data.model_status || 'Gemini Flash-Lite Cascade + OpenCV 5',
            lighting_level: data.lighting_level,
            lighting_advice: data.lighting_advice,
            opencv_version: data.opencv_version || '5.0.0',
            opencv_quality: data.opencv_quality,
          };
        } else {
          const errData = await res.json().catch(() => ({}));
          let cleanErr = errData.error || `Server returned ${res.status}`;
          if (typeof cleanErr === 'string' && cleanErr.includes('{') && cleanErr.includes('}')) {
            try {
              const p = JSON.parse(cleanErr);
              if (p?.error?.message) cleanErr = p.error.message;
            } catch (e) {}
          }
          throw new Error(cleanErr);
        }
      } catch (err: any) {
        console.warn('Server-side vision failed:', err);
        throw err;
      }
    }

    // Python FastAPI mode
    if (this.engineMode === 'python-fastapi') {
      try {
        const formData = new FormData();
        if (file) {
          formData.append('file', file, 'capture.jpg');
        } else {
          const blob = await imageElementToBlob(imageElement);
          formData.append('file', blob, 'capture.jpg');
        }
        formData.append('confidence', minConfidence.toString());
        const res = await fetch(`${this.backendUrl}/describe`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          return data;
        }
      } catch (err) {
        console.warn('Python backend call failed:', err);
      }
    }

    throw new Error('Please select Gemini Vision or ensure local Python FastAPI backend is running.');
  }

  /**
   * Find an Object Task
   */
  public async findObject(
    imageElement: HTMLImageElement | string,
    requestedObject: string,
    file?: File | Blob,
    minConfidence: number = 0.20,
    invertLeftRight: boolean = false
  ): Promise<FindResponse> {
    const cleanQuery = cleanSearchQuery(requestedObject) || requestedObject.trim().toLowerCase();
    const cluster = findSynonymCluster(cleanQuery);
    const searchTarget = cluster ? cluster.canonical : cleanQuery;
    const imgWidth = typeof imageElement === 'string' ? 640 : (imageElement.naturalWidth || imageElement.width || 640);
    const imgHeight = typeof imageElement === 'string' ? 480 : (imageElement.naturalHeight || imageElement.height || 480);

    // High Precision Gemini Vision
    if (this.engineMode === 'gemini-vision') {
      try {
        const dataUrl = imageElementToDataUrl(imageElement, 640, 0.80);
        const res = await fetch('/api/analyze-vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: dataUrl,
            confidence: minConfidence,
            requestedObject: searchTarget,
            imgWidth,
            imgHeight,
            invertLeftRight,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const allDets: Detection[] = (data.matches && data.matches.length > 0)
            ? data.matches
            : (data.detections || data.all_candidates || []);

          // Robust synonym and sensitivity filtering
          const { matches, subThresholdCandidates, allMatchingCandidates } =
            filterDetectionsWithSensitivity(allDets, cleanQuery, minConfidence);

          const found = data.found !== undefined ? data.found : matches.length > 0;
          let spoken = data.spoken_summary || '';
          if (!spoken) {
            if (found && matches.length > 0) {
              if (matches.length === 1) {
                const m = matches[0];
                const side = m.sideDirection || (m.position === 'center' ? 'in the center' : `on your ${m.position} side`);
                const vert = m.verticalPosition ? ` ${m.verticalPosition}` : '';
                const extra = m.activityOrDetails ? ` (${m.activityOrDetails})` : '';
                spoken = `${m.label.toUpperCase()} detected ${side}${vert}${extra} with ${Math.round(m.confidence * 100)}% confidence.`;
              } else {
                const sideList = matches.map((m) => {
                  const s = m.sideDirection || `${m.position} side`;
                  const v = m.verticalPosition ? ` ${m.verticalPosition}` : '';
                  return `${m.label} ${s}${v}`;
                });
                spoken = `Found ${matches.length} instances of ${cleanQuery}: ${sideList.join(', and ')}.`;
              }
            } else if (subThresholdCandidates.length > 0) {
              const bestSub = subThresholdCandidates[0];
              spoken = `No clear ${cleanQuery} above ${Math.round(minConfidence * 100)}% threshold, but detected a candidate at ${Math.round(bestSub.confidence * 100)}% confidence ${bestSub.sideDirection || 'in view'}. Move camera slightly closer or lower sensitivity.`;
            } else {
              spoken = `I can't see a ${cleanQuery} clearly in this view. Slowly move the camera to your right, or tilt slightly downward, and re-scan.`;
            }
          }

          const agenticGuidance = found
            ? `Target confirmed. Re-aim toward ${matches[0].sideDirection || 'center'} to center object.`
            : subThresholdCandidates.length > 0
            ? `Potential candidate found at ${Math.round(subThresholdCandidates[0].confidence * 100)}% confidence. Move 1-2 feet closer or lower the sensitivity slider.`
            : `I can't see a ${cleanQuery} in this view. Slowly pan the camera 30 degrees to your right or tilt toward the table.`;

          return {
            success: true,
            message: found
              ? `Found ${matches.length} instance(s) of "${cleanQuery}".`
              : subThresholdCandidates.length > 0
              ? `Detected ${subThresholdCandidates.length} candidate(s) below ${Math.round(minConfidence * 100)}% threshold.`
              : `No "${cleanQuery}" detected in current frame.`,
            requested_object: cleanQuery,
            is_category_supported: true,
            found,
            matches,
            all_candidates: allMatchingCandidates,
            sub_threshold_candidates: subThresholdCandidates,
            threshold_used: minConfidence,
            has_sub_threshold: subThresholdCandidates.length > 0,
            position: matches.length > 0 ? matches[0].position : (subThresholdCandidates.length > 0 ? subThresholdCandidates[0].position : undefined),
            side_direction: matches.length > 0 ? matches[0].sideDirection : (subThresholdCandidates.length > 0 ? subThresholdCandidates[0].sideDirection : undefined),
            vertical_position: matches.length > 0 ? matches[0].verticalPosition : (subThresholdCandidates.length > 0 ? subThresholdCandidates[0].verticalPosition : undefined),
            confidence: matches.length > 0 ? matches[0].confidence : (subThresholdCandidates.length > 0 ? subThresholdCandidates[0].confidence : undefined),
            spoken_summary: spoken,
            agentic_guidance: agenticGuidance,
            processing_time_ms: data.processing_time_ms,
            model_status: data.model_status || 'Gemini Vision Cascade + OpenCV 5',
            opencv_version: data.opencv_version || '5.0.0',
            opencv_quality: data.opencv_quality,
          };
        } else {
          const errData = await res.json().catch(() => ({}));
          let cleanErr = errData.error || `Search failed with status ${res.status}`;
          if (typeof cleanErr === 'string' && cleanErr.includes('{') && cleanErr.includes('}')) {
            try {
              const p = JSON.parse(cleanErr);
              if (p?.error?.message) cleanErr = p.error.message;
            } catch (e) {}
          }
          return {
            success: false,
            message: cleanErr,
            requested_object: cleanQuery,
            is_category_supported: true,
            found: false,
            matches: [],
            spoken_summary: cleanErr,
            processing_time_ms: 0,
            model_status: 'Temporary Peak Demand',
          };
        }
      } catch (err: any) {
        console.warn('Gemini findObject failed:', err);
      }
    }

    // Python FastAPI fallback
    if (this.engineMode === 'python-fastapi') {
      try {
        const formData = new FormData();
        if (file) {
          formData.append('file', file, 'capture.jpg');
        } else {
          const blob = await imageElementToBlob(imageElement);
          formData.append('file', blob, 'capture.jpg');
        }
        formData.append('requested_object', cleanQuery);
        formData.append('confidence', minConfidence.toString());
        const res = await fetch(`${this.backendUrl}/find`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Python findObject failed:', err);
      }
    }

    return {
      success: false,
      message: 'Vision service is busy. Please tap Retry.',
      requested_object: cleanQuery,
      is_category_supported: true,
      found: false,
      matches: [],
      spoken_summary: `Could not search for ${cleanQuery} right now. Please tap retry.`,
      processing_time_ms: 0,
      model_status: 'Service Unavailable',
    };
  }

  /**
   * Read Text (High-Precision OCR) Task
   */
  public async readText(
    imageElement: HTMLImageElement | string,
    file?: File | Blob
  ): Promise<OCRResponse> {
    // 1. Prioritize Server-Side High-Precision Neural OCR
    try {
      const dataUrl = imageElementToDataUrl(imageElement, 1280, 0.85);
      const res = await fetch('/api/ocr-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      } else {
        const errJson = await res.json().catch(() => ({}));
        let cleanErr = errJson.error || `Server OCR status ${res.status}`;
        if (typeof cleanErr === 'string' && cleanErr.includes('{') && cleanErr.includes('}')) {
          try {
            const p = JSON.parse(cleanErr);
            if (p?.error?.message) cleanErr = p.error.message;
          } catch (e) {}
        }
        return {
          success: false,
          message: cleanErr,
          extracted_text: '',
          lines: [],
          summary: cleanErr,
          word_count: 0,
          processing_time_ms: 0,
          engine_ready: false,
          model_status: 'OCR Unavailable',
        };
      }
    } catch (err: any) {
      console.warn('Server Gemini Neural OCR failed:', err);
    }

    // 2. Python FastAPI OCR fallback
    if (this.engineMode === 'python-fastapi') {
      try {
        const formData = new FormData();
        if (file) {
          formData.append('file', file, 'capture.jpg');
        } else {
          const blob = await imageElementToBlob(imageElement);
          formData.append('file', blob, 'capture.jpg');
        }
        const res = await fetch(`${this.backendUrl}/ocr`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Python backend OCR failed:', err);
      }
    }

    return {
      success: false,
      message: 'Could not extract text. Please ensure camera/photo is focused and lit properly.',
      extracted_text: '',
      lines: [],
      word_count: 0,
      processing_time_ms: 0,
      engine_ready: false,
      model_status: 'OCR Unavailable',
    };
  }



  /**
   * Continuous Live Stream frame analysis
   */
  public async analyzeLiveStreamFrame(
    image: string,
    confidence: number = 0.20,
    invertLeftRight: boolean = false
  ): Promise<{ detections: Detection[]; speech_announcement: string }> {
    try {
      const res = await fetch('/api/live-stream/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          confidence,
          invertLeftRight,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          detections: data.detections || [],
          speech_announcement: data.speech_announcement || '',
        };
      }
    } catch (e) {
      console.warn('Live stream frame analysis issue:', e);
    }
    return {
      detections: [],
      speech_announcement: '',
    };
  }
}

function imageElementToDataUrl(img: HTMLImageElement | string, maxDim: number = 1024, quality: number = 0.85): string {
  if (typeof img === 'string') return img;
  const origW = img.naturalWidth || img.width || 640;
  const origH = img.naturalHeight || img.height || 480;
  let targetW = origW;
  let targetH = origH;
  if (targetW > maxDim || targetH > maxDim) {
    const ratio = Math.min(maxDim / targetW, maxDim / targetH);
    targetW = Math.round(targetW * ratio);
    targetH = Math.round(targetH * ratio);
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }
  return canvas.toDataURL('image/jpeg', quality);
}

async function imageElementToBlob(img: HTMLImageElement | string): Promise<Blob> {
  if (typeof img === 'string') {
    if (img.startsWith('data:')) {
      const parts = img.split(',');
      const byteString = atob(parts[1]);
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mime });
    }
    const res = await fetch(img);
    return await res.blob();
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width || 640;
  canvas.height = img.naturalHeight || img.height || 480;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0);
  }
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob || new Blob([]));
    }, 'image/jpeg', 0.95);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const apiService = new ApiService();
