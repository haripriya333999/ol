import React, { useState, useRef, useEffect } from 'react';
import {
  Eye,
  Sparkles,
  Loader2,
  Compass,
  AlertCircle,
  Sun,
  Palette,
  Layers,
  Volume2,
  Info,
  Radio,
  Search,
  FileText,
  ArrowRight,
  BookOpen,
  ArrowLeft,
  User,
  Shield,
  Activity,
  FlipHorizontal,
} from 'lucide-react';
import { DescribeResponse, Detection, ActiveTask } from '../types';
import { apiService } from '../services/apiService';
import { speechService } from '../services/speech';
import {
  analyzeSceneLighting,
  inspectObjectRegion,
  SceneLightingInfo,
  ObjectDetailedInspection,
} from '../services/visionAnalysis';
import { flipImageHorizontally, flipDetectionsHorizontally, invertSpatialText } from '../services/imageUtils';
import { ImageInputZone } from './ImageInputZone';
import { BoundingBoxCanvas } from './BoundingBoxCanvas';
import { SpeechController } from './SpeechController';

interface DescribeSurroundingsViewProps {
  highContrast?: boolean;
  onSwitchTask?: (task: ActiveTask) => void;
}

export const DescribeSurroundingsView: React.FC<DescribeSurroundingsViewProps> = ({
  highContrast = false,
  onSwitchTask,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<File | undefined>(undefined);
  // Requirement: Detection Sensitivity must ALWAYS default to 100% (maximum)
  const [sensitivity, setSensitivity] = useState<number>(100);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DescribeResponse | null>(null);
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

  const [lighting, setLighting] = useState<SceneLightingInfo | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<ObjectDetailedInspection | null>(null);
  const [autoContinuous, setAutoContinuous] = useState<boolean>(false);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const timerRef = useRef<any>(null);

  const handleImageSelected = (src: string, file?: File) => {
    setSelectedImage(src);
    setActiveFile(file);
    setResult(null);
    setLighting(null);
    setSelectedInspection(null);
    setError(null);
    speechService.stop();
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    setActiveFile(undefined);
    setResult(null);
    setLighting(null);
    setSelectedInspection(null);
    setError(null);
    if (autoContinuous) setAutoContinuous(false);
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
        const flippedDets = flipDetectionsHorizontally(result.detections);
        const invertedSummary = invertSpatialText(result.scene_description);
        const invertedGuidance = result.navigation_guidance
          ? invertSpatialText(result.navigation_guidance)
          : undefined;

        setResult({
          ...result,
          detections: flippedDets,
          scene_description: invertedSummary,
          navigation_guidance: invertedGuidance,
        });

        speechService.speak(
          'Photo flipped. Left and right spatial orientations have been inverted.',
          'interrupt'
        );
      } else {
        speechService.speak('Photo flipped horizontally.', 'interrupt');
      }
    } catch (err) {
      console.error('Failed to flip image:', err);
    } finally {
      setIsFlipping(false);
    }
  };

  const handleRunDescribe = async (isAutoTick: boolean = false) => {
    if (!selectedImage) return;

    if (!isAutoTick) {
      setIsLoading(true);
      setError(null);
      speechService.warmUp();
    }

    try {
      const minConfidence = Math.max(0.12, 0.65 - ((sensitivity - 10) / 90) * (0.65 - 0.15));
      const res = await apiService.describeSurroundings(selectedImage, activeFile, minConfidence, invertLeftRight);

      setResult(res);

      if (imageElementRef.current) {
        const lightInfo = analyzeSceneLighting(imageElementRef.current);
        setLighting(lightInfo);
      }

      const primary = res.scene_description || res.navigation_guidance || 'Surroundings analyzed.';
      const navCue = res.navigation_guidance && res.navigation_guidance !== res.scene_description ? ` ${res.navigation_guidance}` : '';
      const fullSpeech = `${primary}${navCue}`.trim();

      speechService.speak(fullSpeech, 'interrupt');
    } catch (err: any) {
      console.error('Describe surroundings error:', err);
      const errMsg = err?.message || 'Failed to analyze visual scene. Please check your network and retry.';
      setError(errMsg);
      speechService.speak(`Analysis issue: ${errMsg}`, 'interrupt');
      if (autoContinuous) setAutoContinuous(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoContinuous && selectedImage) {
      timerRef.current = setInterval(() => {
        handleRunDescribe(true);
      }, 7000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoContinuous, selectedImage, sensitivity, invertLeftRight]);

  const handleInspectDetection = (det: Detection) => {
    if (!imageElementRef.current) return;
    const inspect = inspectObjectRegion(imageElementRef.current, det);
    setSelectedInspection(inspect);

    if (inspect) {
      const prominenceSpoken = inspect.sizeCategory;
      const colorSpoken = inspect.dominantColor;
      const sideSpoken = det.sideDirection || `on your ${det.position} side`;
      const verticalSpoken = det.verticalPosition || 'at eye level';
      const activityExtra = det.activityOrDetails ? `, ${det.activityOrDetails}` : '';

      speechService.speak(
        `${inspect.label}: ${sideSpoken}, ${verticalSpoken}. Dominant shade: ${colorSpoken}. ${prominenceSpoken}${activityExtra}.`,
        'interrupt'
      );
    }
  };

  const handleAnnounceLighting = () => {
    if (lighting) {
      speechService.speak(
        `Lighting is ${lighting.lightingLevel}, approximately ${Math.round(
          (lighting.averageLuminance / 255) * 100
        )} percent illumination. ${lighting.recommendation}`,
        'interrupt'
      );
    }
  };

  return (
    <div className="space-y-6 select-none" role="region" aria-label="Describe Surroundings Screen">
      {/* Top Action Bar */}
      <div className="p-3.5 bg-[#180A10]/95 backdrop-blur-md rounded-2xl border border-[#3E1627] shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899] animate-pulse" />
          <span>Describe Surroundings & Vision Intelligence</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {selectedImage && (
            <button
              onClick={handleClearImage}
              className="px-3.5 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-white font-bold text-xs border border-[#3E1627] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Clear current photo and choose another"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#EC4899]" />
              <span>Choose Another Photo</span>
            </button>
          )}

          {onSwitchTask && (
            <>
              <button
                onClick={() => onSwitchTask('find')}
                className="px-3 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-amber-300 font-bold text-xs border border-[#3E1627] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span>Go to Find Object</span>
              </button>
              <button
                onClick={() => onSwitchTask('read')}
                className="px-3 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-yellow-300 font-bold text-xs border border-[#3E1627] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-yellow-400" />
                <span>Go to Read Text (OCR)</span>
              </button>
            </>
          )}

          {selectedImage && (
            <button
              onClick={() => setAutoContinuous(!autoContinuous)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                autoContinuous
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm animate-pulse'
                  : 'bg-[#25101C] text-white/80 border-[#3E1627] hover:bg-[#331425]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{autoContinuous ? 'Auto-Scan On' : 'Auto-Scan'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Intro Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-1">
          Describe Surroundings & Vision Intelligence
        </h2>
        <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
          Accurately detects <strong>doors, door latches, windows, ceiling fans, people, and human actions/gestures</strong> with natural <strong>left side, center, and right side</strong> directional guidance.
        </p>
      </div>

      {/* Input zone */}
      <ImageInputZone
        selectedImage={selectedImage}
        onImageSelected={handleImageSelected}
        onClearImage={handleClearImage}
        isLoading={isLoading}
      />

      {/* When image is loaded */}
      {selectedImage && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Visual Canvas & Detection Trigger */}
          <div className="lg:col-span-7 space-y-4">
            <BoundingBoxCanvas
              imageSrc={selectedImage}
              detections={result?.detections || []}
              highlightLabel={selectedInspection?.label}
              selectedDetectionId={selectedInspection ? `det-${selectedInspection.label}` : undefined}
              onImageReady={(img) => {
                imageElementRef.current = img;
              }}
              highContrast={highContrast}
            />

            {/* Threshold and Primary Trigger */}
            <div className="p-5 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label htmlFor="conf-slider" className="text-xs font-bold text-white block">
                    Detection Sensitivity Filter
                  </label>
                  <span className="text-[11px] text-white/60">
                    Higher sensitivity captures subtle doors, windows, and background items
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-[#EC4899] tabular-nums px-2.5 py-1 rounded-lg bg-[#EC4899]/15 border border-[#EC4899]/30 shadow-sm">
                  {sensitivity}%
                </span>
              </div>
              <input
                id="conf-slider"
                type="range"
                min="10"
                max="100"
                step="5"
                value={sensitivity}
                onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
                className="w-full accent-[#EC4899] cursor-pointer"
                aria-label="Detection Sensitivity Filter"
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
                      ? 'bg-[#EC4899] text-white border-[#EC4899] shadow-sm'
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
                  onClick={() => handleRunDescribe(false)}
                  disabled={isLoading}
                  className="flex-1 py-3.5 px-5 rounded-2xl bg-[#EC4899] text-white font-extrabold text-sm hover:bg-[#DB2777] disabled:opacity-50 transition-all shadow-lg shadow-[#EC4899]/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Scanning Doors, Windows, People & Gestures...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Describe My Surroundings & People</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleClearImage}
                  disabled={isLoading}
                  className="px-4 py-3.5 rounded-2xl bg-[#220E19] border border-[#3E1627] hover:bg-[#331425] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Choose a different image file"
                >
                  <ArrowLeft className="w-4 h-4 text-[#EC4899]" />
                  <span>Choose Another Photo</span>
                </button>
              </div>
            </div>

            {/* Ambient Lighting & Environmental Vision Card */}
            {lighting && (
              <div className="p-4 bg-[#180A10]/95 backdrop-blur-md rounded-2xl border border-[#3E1627] shadow-xl flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      lighting.lightingLevel === 'Bright & Clear'
                        ? 'bg-amber-500/20 text-amber-300'
                        : lighting.lightingLevel === 'Moderate Light'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-zinc-700/20 text-zinc-300'
                    }`}
                  >
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        Ambient Lighting: {lighting.lightingLevel}
                      </span>
                      <span className="text-[11px] font-mono text-white/50 tabular-nums">
                        ({Math.round((lighting.averageLuminance / 255) * 100)}% lux)
                      </span>
                    </div>
                    <p className="text-xs text-white/70 mt-0.5">
                      {lighting.recommendation}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleAnnounceLighting}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#25101C] text-[#EC4899] border border-[#3E1627] hover:bg-[#331425] shrink-0 flex items-center gap-1 transition-colors cursor-pointer"
                  aria-label="Speak lighting condition"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Hear</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Audio Output, Gestures & Results */}
          <div className="lg:col-span-5 space-y-4">
            {error && (
              <div className="p-4 bg-amber-950/40 rounded-2xl text-xs text-amber-200 flex items-center justify-between gap-3 shadow-md border border-amber-500/40">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <div className="font-bold mb-0.5">Analysis Notice</div>
                    <div>{error}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleRunDescribe(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-500 transition-colors shrink-0 cursor-pointer shadow-sm"
                >
                  Retry Analysis
                </button>
              </div>
            )}

            {/* Speech Player */}
            {result && (
              <div className="space-y-4">
                <SpeechController
                  currentText={
                    `${result.navigation_guidance || result.scene_description}. ${result.human_activities ? 'People activities: ' + result.human_activities : ''}`
                  }
                  autoSpeak={true}
                />

                {/* Primary Spoken Description Card */}
                <div className="p-5 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-3">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-[#EC4899]">
                      <Compass className="w-3.5 h-3.5" />
                      Directional Guidance (Left / Center / Right)
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-white/50">
                      {result.processing_time_ms}ms · {result.model_status}
                    </span>
                  </div>
                  <blockquote className="text-sm sm:text-base font-bold text-white leading-relaxed p-4 bg-[#220E19] rounded-2xl border-l-4 border-[#EC4899]">
                    "{result.navigation_guidance || result.scene_description}"
                  </blockquote>
                </div>

                {/* What the person is doing & Gestures Card */}
                {result.human_activities && result.human_activities.trim().length > 0 && (
                  <div className="p-4.5 bg-emerald-950/40 rounded-2xl border border-emerald-500/40 shadow-md space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300 uppercase tracking-wider text-[11px]">
                        <User className="w-3.5 h-3.5" />
                        <span>Human Actions & Postures</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                        Grounded Activity
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-emerald-100 leading-relaxed">
                      {result.human_activities}
                    </p>
                  </div>
                )}

                {/* Detected Objects List with Spatial Coordinates */}
                {result.detections && result.detections.length > 0 && (
                  <div className="p-4 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span>Detected Objects & Spatial Cues ({result.detections.length})</span>
                      <span className="text-[11px] text-white/50 font-normal">Click any item for details</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                      {result.detections.map((det) => (
                        <button
                          key={det.id}
                          onClick={() => handleInspectDetection(det)}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#220E19] hover:bg-[#2C1220] border border-[#3E1627] text-left transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#EC4899]" />
                            <span className="text-xs font-bold text-white group-hover:text-pink-200">
                              {det.label}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-white/60">
                            {det.sideDirection || `on your ${det.position}`}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Structural and Architectural Elements */}
                {result.structural_elements && result.structural_elements.length > 0 && (
                  <div className="p-4 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-2">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#EC4899]" />
                      <span>Architectural & Structural Elements</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-white/80">
                      {result.structural_elements.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 p-2 rounded-xl bg-[#220E19]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EC4899] mt-1.5 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Honest Uncertainty and Visual Limitations Card */}
                {result.uncertain_elements && result.uncertain_elements.length > 0 && (
                  <div className="p-4 bg-amber-950/30 rounded-3xl border border-amber-500/30 space-y-2 text-xs">
                    <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Honest Visual Limitations & Distant Items</span>
                    </div>
                    <ul className="space-y-1 text-white/75">
                      {result.uncertain_elements.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-amber-400">·</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
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
