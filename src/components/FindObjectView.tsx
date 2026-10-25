import React, { useState, useRef } from 'react';
import {
  Search,
  Compass,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Eye,
  FileText,
  ArrowLeft,
  Volume2,
  Mic,
  MicOff,
  FlipHorizontal,
  Sparkles,
} from 'lucide-react';
import { FindResponse, ActiveTask, Detection } from '../types';
import { apiService } from '../services/apiService';
import { speechService } from '../services/speech';
import { ImageInputZone } from './ImageInputZone';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';
import { SpeechController } from './SpeechController';
import { inspectObjectRegion } from '../services/visionAnalysis';
import { flipImageHorizontally, flipDetectionsHorizontally, invertSpatialText } from '../services/imageUtils';
import { localDetector } from '../services/localDetector';
import { cleanSearchQuery, isDetectionMatch } from '../services/synonymMatcher';

interface FindObjectViewProps {
  highContrast?: boolean;
  onSwitchTask?: (task: ActiveTask) => void;
}

const COMMON_SUGGESTIONS = [
  'phone',
  'glasses',
  'person',
  'fan',
  'light',
  'door',
  'window',
  'cookie packet',
  'bottle',
  'chair',
  'desk',
  'laptop',
  'switchboard',
  'backpack',
];

export const FindObjectView: React.FC<FindObjectViewProps> = ({
  highContrast = false,
  onSwitchTask,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<File | undefined>(undefined);
  const [query, setQuery] = useState<string>('door');
  // Requirement: Detection Sensitivity must ALWAYS default to 100% (maximum)
  const [sensitivity, setSensitivity] = useState<number>(100);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FindResponse | null>(null);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [invertLeftRight, setInvertLeftRight] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnilens_accessibility');
      if (saved) {
        try {
          return JSON.parse(saved).invertLeftRight || false;
        } catch (e) {}
      }
    }
    return false;
  });
  const [isMicListening, setIsMicListening] = useState<boolean>(false);
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  const handleImageSelected = (src: string, file?: File) => {
    setSelectedImage(src);
    setActiveFile(file);
    setResult(null);
    setError(null);
    speechService.stop();
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    setActiveFile(undefined);
    setResult(null);
    setError(null);
    speechService.stop();
  };

  const handleFlipImage = async () => {
    if (!selectedImage || isFlipping) return;
    setIsFlipping(true);
    try {
      const { dataUrl, file } = await flipImageHorizontally(selectedImage);
      setSelectedImage(dataUrl);
      setActiveFile(file);

      if (result) {
        const flippedMatches = flipDetectionsHorizontally(result.matches);
        const invertedSummary = invertSpatialText(result.spoken_summary);
        setResult({
          ...result,
          matches: flippedMatches,
          spoken_summary: invertedSummary,
        });
        speechService.speak('Photo flipped. Left and right coordinates reversed.');
      } else {
        speechService.speak('Photo flipped horizontally.');
      }
    } catch (err) {
      console.error('Failed to flip image:', err);
    } finally {
      setIsFlipping(false);
    }
  };

  const handleRunFind = async (customQuery?: string) => {
    if (!selectedImage) return;
    const targetQuery = customQuery !== undefined ? customQuery : query;
    if (!targetQuery.trim()) {
      speechService.speak('Please specify an item to search for.');
      return;
    }

    setIsLoading(true);
    setError(null);
    speechService.warmUp();

    try {
      const minConfidence = Math.max(0.12, 0.65 - ((sensitivity - 10) / 90) * (0.65 - 0.15));
      const cleaned = cleanSearchQuery(targetQuery.trim());

      // 1. Instant-Path: Check recent fresh detections cache (< 1200ms old)
      const freshDets = localDetector.getFreshDetections(1200);
      const cachedMatches = freshDets.filter((d) => isDetectionMatch(d, cleaned));
      if (cachedMatches.length > 0) {
        const m = cachedMatches[0];
        const side = m.sideDirection || (m.position === 'center' ? 'in the center' : `on your ${m.position} side`);
        const vert = m.verticalPosition ? `, ${m.verticalPosition}` : '';
        const spoken = `I found a ${m.label} ${side}${vert} with ${Math.round(m.confidence * 100)}% confidence.`;

        const instantResult: FindResponse = {
          success: true,
          message: `Found "${cleaned}" in 5ms from fresh camera stream.`,
          requested_object: cleaned,
          is_category_supported: true,
          found: true,
          instances_count: cachedMatches.length,
          matches: cachedMatches,
          all_candidates: cachedMatches,
          sub_threshold_candidates: [],
          spoken_summary: spoken,
          agentic_guidance: `Target located ${side}. Center camera to inspect.`,
          processing_time_ms: 5,
          model_status: 'Local WebGL Detector (Instant Stream Match 5ms)',
          position: m.position,
          side_direction: m.sideDirection,
          vertical_position: m.verticalPosition,
          confidence: m.confidence,
        };

        setResult(instantResult);
        speechService.speak(spoken, 'interrupt');
        setIsLoading(false);
        return;
      }

      // 2. Fast-Path: Run WebGL local detector on current image (<35ms)
      let targetImg: HTMLImageElement | null = imageElementRef.current;
      if (!targetImg || !targetImg.complete) {
        targetImg = new Image();
        targetImg.src = selectedImage;
        await targetImg.decode().catch(() => {});
      }

      if (targetImg && targetImg.naturalWidth > 0) {
        try {
          const localRes = await localDetector.detect(targetImg, minConfidence, invertLeftRight);
          const localMatches = localRes.detections.filter((d) => isDetectionMatch(d, cleaned));

          if (localMatches.length > 0) {
            let spoken = '';
            if (localMatches.length === 1) {
              const m = localMatches[0];
              const side = m.sideDirection || (m.position === 'center' ? 'in the center' : `on your ${m.position} side`);
              const vert = m.verticalPosition ? `, ${m.verticalPosition}` : '';
              spoken = `I found a ${m.label} ${side}${vert} with ${Math.round(m.confidence * 100)}% confidence.`;
            } else {
              const sideList = localMatches.map((m) => `${m.label} ${m.sideDirection || 'in view'}`);
              spoken = `Found ${localMatches.length} instances of ${cleaned}: ${sideList.join(', and ')}.`;
            }

            const instantResult: FindResponse = {
              success: true,
              message: `Found ${localMatches.length} instance(s) of "${cleaned}" in ${localRes.inferenceMs}ms.`,
              requested_object: cleaned,
              is_category_supported: true,
              found: true,
              instances_count: localMatches.length,
              matches: localMatches,
              all_candidates: localMatches,
              sub_threshold_candidates: [],
              spoken_summary: spoken,
              agentic_guidance: `Target localized. Re-aim toward ${localMatches[0].sideDirection || 'center'} to center object.`,
              processing_time_ms: localRes.inferenceMs,
              model_status: `Local WebGL Neural Detector (${localRes.inferenceMs}ms Instant Match)`,
              position: localMatches[0].position,
              side_direction: localMatches[0].sideDirection,
              vertical_position: localMatches[0].verticalPosition,
              confidence: localMatches[0].confidence,
            };

            setResult(instantResult);
            speechService.speak(spoken, 'interrupt');
            setIsLoading(false);
            return;
          }
        } catch (localErr) {
          console.warn('Local detector search pass notice:', localErr);
        }
      }

      // 3. Precision Open-Vocabulary Cascade for architectural or open items (doors, windows, fans, keys)
      const res = await apiService.findObject(selectedImage, targetQuery.trim(), activeFile, minConfidence, invertLeftRight);

      setResult(res);
      speechService.speak(res.spoken_summary, 'interrupt');
    } catch (err: any) {
      console.error('Find object error:', err);
      const errMsg = err?.message || 'Search failed. Please retry.';
      setError(errMsg);
      speechService.speak(errMsg, 'interrupt');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceSearch = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      speechService.speak('Voice speech recognition is not supported in this browser.');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      setIsMicListening(true);
      speechService.speak('Listening for item name...', 'interrupt');

      recognition.onresult = (event: any) => {
        const spoken = event.results[0][0].transcript.toLowerCase().trim();
        setIsMicListening(false);
        const cleaned = spoken.replace(/^(find|search for|look for|where is|locate)\s+/i, '');
        setQuery(cleaned);
        handleRunFind(cleaned);
      };

      recognition.onerror = () => {
        setIsMicListening(false);
        speechService.speak('Could not hear item name. Please type or retry.');
      };

      recognition.onend = () => {
        setIsMicListening(false);
      };

      recognition.start();
    } catch (e) {
      setIsMicListening(false);
    }
  };

  return (
    <div className="space-y-6 select-none" role="region" aria-label="Find Object Screen">
      {/* Top Action Bar */}
      <div className="p-3.5 bg-[#180A10]/95 backdrop-blur-md rounded-2xl border border-[#3E1627] shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
          <span>Find an Object with Spatial Elevation</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {selectedImage && (
            <button
              onClick={handleClearImage}
              className="px-3.5 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-white font-bold text-xs border border-[#3E1627] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span>Choose Another Photo</span>
            </button>
          )}

          {onSwitchTask && (
            <>
              <button
                onClick={() => onSwitchTask('describe')}
                className="px-3 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-pink-300 font-bold text-xs border border-[#3E1627] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-pink-400" />
                <span>1. Describe Scene</span>
              </button>
              <button
                onClick={() => onSwitchTask('read')}
                className="px-3 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-yellow-300 font-bold text-xs border border-[#3E1627] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-yellow-400" />
                <span>3. Read Text (OCR)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Intro Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-1">
          Find an Object
        </h2>
        <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
          Locate doors, door handles, windows, fans, bottles, packets, or personal belongings and hear their exact <strong>left side, center, or right side</strong> positions.
        </p>
      </div>

      {/* Input zone */}
      <ImageInputZone
        selectedImage={selectedImage}
        onImageSelected={handleImageSelected}
        onClearImage={handleClearImage}
        isLoading={isLoading}
      />

      {selectedImage && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Canvas & Query Box */}
          <div className="lg:col-span-7 space-y-4">
            <BoundingBoxCanvas
              imageSrc={selectedImage}
              detections={result?.matches || []}
              highlightLabel={result?.requested_object}
              onImageReady={(img) => {
                imageElementRef.current = img;
              }}
              highContrast={highContrast}
            />

            {/* Search query input box */}
            <div className="p-5 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-4">
              <div>
                <label
                  htmlFor="object-query-input"
                  className="text-xs font-bold text-white block mb-1.5"
                >
                  What object or architectural item are you looking for?
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="object-query-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRunFind();
                      }
                    }}
                    placeholder="e.g. door, window, fan, cookie packet, bottle, glasses, person"
                    className="w-full pl-10 pr-12 py-3 rounded-2xl border border-[#3E1627] bg-[#220E19] text-sm font-semibold text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
                  />
                  <button
                    type="button"
                    onClick={handleVoiceSearch}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all cursor-pointer ${
                      isMicListening
                        ? 'bg-emerald-500 text-white animate-pulse'
                        : 'text-[#F59E0B] hover:bg-[#F59E0B]/15'
                    }`}
                    title={isMicListening ? 'Listening... speak object name' : 'Click to speak object name'}
                    aria-label={isMicListening ? 'Listening for object name' : 'Speak object name using microphone'}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Suggestions */}
              <div>
                <span className="text-[11px] font-bold text-white/60 block mb-1.5">
                  Suggested common items & fixtures:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setQuery(item);
                        handleRunFind(item);
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        query.toLowerCase() === item
                          ? 'bg-[#F59E0B] text-black font-extrabold border-[#F59E0B] shadow-sm'
                          : 'bg-[#220E19] text-white/80 border-[#3E1627] hover:border-[#F59E0B]/50 hover:bg-[#2A111F]'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detection Sensitivity Filter */}
              <div className="pt-2 border-t border-[#311320] flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-xs text-white/90 font-semibold">Detection sensitivity filter</span>
                  <span className="text-[10px] text-white/50">Higher sensitivity captures subtle, small or distant objects</span>
                </div>
                <span className="text-xs font-mono font-bold text-[#F59E0B] tabular-nums px-2.5 py-1 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 shadow-sm">
                  {sensitivity}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
                className="w-full accent-[#F59E0B] cursor-pointer"
                aria-label="Detection sensitivity filter"
              />

              {/* Laptop Camera Left-Right Alignment Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-[#220E19] border border-[#3E1627]">
                <button
                  onClick={handleFlipImage}
                  disabled={isLoading || isFlipping}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-200 bg-amber-950/60 hover:bg-amber-900 border border-amber-600/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Flips the photo horizontally so left and right match your real-world perspective"
                >
                  <FlipHorizontal className={`w-3.5 h-3.5 text-amber-400 ${isFlipping ? 'animate-spin' : ''}`} />
                  <span>{isFlipping ? 'Flipping...' : 'Flip Photo (Left ↔ Right)'}</span>
                </button>

                <button
                  onClick={() => {
                    const nextVal = !invertLeftRight;
                    setInvertLeftRight(nextVal);
                    speechService.speak(
                      nextVal
                        ? 'Laptop camera perspective enabled. Left and right cues are inverted.'
                        : 'Laptop camera perspective disabled.'
                    );
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    invertLeftRight
                      ? 'bg-[#F59E0B] text-black font-extrabold border-[#F59E0B] shadow-sm'
                      : 'bg-[#180A10] text-white/80 border-[#3E1627] hover:bg-[#25101C]'
                  }`}
                  title="Inverts spatial directions (left vs right) for laptop webcams"
                >
                  <span>Laptop Invert Directions:</span>
                  <span className="font-bold">{invertLeftRight ? 'ON' : 'OFF'}</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleRunFind()}
                  disabled={isLoading || !query.trim()}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-[#F59E0B] text-black font-extrabold text-sm hover:bg-[#D97706] disabled:opacity-50 transition-all shadow-lg shadow-[#F59E0B]/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Searching for "{query}"...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Find "{query || 'Object'}" in Image</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleClearImage}
                  disabled={isLoading}
                  className="px-4 py-3.5 rounded-2xl bg-[#220E19] border border-[#3E1627] hover:bg-[#331425] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Choose a different image file"
                >
                  <ArrowLeft className="w-4 h-4 text-[#F59E0B]" />
                  <span>Choose Another Photo</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Results & Audio Feedback */}
          <div className="lg:col-span-5 space-y-4">
            {error && (
              <div className="p-4 bg-amber-950/40 rounded-2xl text-xs text-amber-200 flex items-center justify-between gap-3 border border-amber-500/40 shadow-md">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <div className="font-bold mb-0.5">Search Notice</div>
                    <div>{error}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleRunFind()}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-500 transition-colors shrink-0 cursor-pointer shadow-sm"
                >
                  Retry Search
                </button>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <SpeechController
                  currentText={result.spoken_summary}
                  autoSpeak={true}
                />

                {/* Status Announcement Banner */}
                <div
                  className={`p-5 rounded-3xl border shadow-xl space-y-3 ${
                    !result.is_category_supported
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                      : result.found
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2.5">
                    {!result.is_category_supported ? (
                      <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
                    ) : result.found ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    )}
                    <div className="font-bold text-sm text-white">
                      {!result.is_category_supported
                        ? 'Unsupported Model Category'
                        : result.found
                        ? 'Object Found in Image'
                        : 'Object Not Detected'}
                    </div>
                  </div>

                  <blockquote className="text-sm sm:text-base font-bold text-white leading-relaxed p-4 bg-black/40 rounded-2xl border-l-4 border-[#F59E0B]">
                    "{result.spoken_summary}"
                  </blockquote>

                  {/* Agentic Vision Re-aiming Guidance Card */}
                  {result.agentic_guidance && (
                    <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300">
                        <Compass className="w-4 h-4 text-amber-400" />
                        <span>Agentic Vision Re-aiming Guidance:</span>
                      </div>
                      <p className="text-white/80 font-medium leading-relaxed">
                        {result.agentic_guidance}
                      </p>
                    </div>
                  )}
                </div>

                {/* Matches list & Multi-instance breakdown */}
                {result.matches && result.matches.length > 0 && (
                  <div className="p-4 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#F59E0B]" />
                        <span>Identified Instances ({result.instances_count ?? result.matches.length})</span>
                      </div>
                      <span className="font-mono text-[10px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-600/30">
                        Spatial Localized
                      </span>
                    </div>

                    {result.scene_context && (
                      <p className="text-[11px] text-white/70 italic px-2 pb-1 border-b border-[#3E1627]">
                        Context: {result.scene_context}
                      </p>
                    )}

                    {result.matches.map((det, idx) => (
                      <div
                        key={det.id || idx}
                        className="p-3 rounded-2xl bg-[#220E19] border border-[#3E1627] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 font-bold text-white">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] shadow-sm shadow-[#F59E0B]/50" />
                          <span>{det.label}</span>
                          {det.attributes?.color && (
                            <span className="text-[10px] text-white/50 font-normal">
                              ({det.attributes.color})
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[#F59E0B] font-semibold">
                          {det.sideDirection || det.position} • {Math.round(det.confidence * 100)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sub-threshold / Ambiguous Candidates Honest Disclosure */}
                {result.sub_threshold_candidates && result.sub_threshold_candidates.length > 0 && (
                  <div className="p-4 bg-[#180A10]/90 rounded-3xl border border-amber-500/20 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Faint or Distant Candidates ({result.sub_threshold_candidates.length})</span>
                    </div>
                    <p className="text-[11px] text-white/60">
                      These items resembled your target but lacked conclusive certainty. Bring the camera closer to confirm:
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {result.sub_threshold_candidates.map((cand: any, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-xl bg-amber-950/40 border border-amber-600/30 text-[11px] text-amber-200"
                        >
                          {typeof cand === 'string' ? cand : cand.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
