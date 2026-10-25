import React, { useState, useRef } from 'react';
import {
  FileText,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Volume2,
  BookOpen,
  Eye,
  Search,
  ArrowLeft,
  Sparkles,
  FlipHorizontal,
  Pause,
  Play,
  Square,
  RotateCcw,
} from 'lucide-react';
import { OCRResponse, ActiveTask } from '../types';
import { apiService } from '../services/apiService';
import { speechService } from '../services/speech';
import { ImageInputZone } from './ImageInputZone';
import { SpeechController } from './SpeechController';
import { flipImageHorizontally } from '../services/imageUtils';

interface ReadTextViewProps {
  highContrast?: boolean;
  onSwitchTask?: (task: ActiveTask) => void;
}

export const ReadTextView: React.FC<ReadTextViewProps> = ({
  highContrast = false,
  onSwitchTask,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<File | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OCRResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
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
      speechService.speak('Photo flipped horizontally to un-mirror text.');
    } catch (err) {
      console.error('Failed to flip image:', err);
    } finally {
      setIsFlipping(false);
    }
  };

  const handleRunOCR = async () => {
    if (!selectedImage) return;

    setIsLoading(true);
    setError(null);
    speechService.warmUp();

    try {
      const res = await apiService.readText(selectedImage, activeFile);
      setResult(res);

      if (res.extracted_text && res.extracted_text.trim().length > 0) {
        const headline = res.primary_heading || res.summary || '';
        speechService.speakPromptlyWithContinuation(headline, res.extracted_text);
      } else {
        speechService.speak(
          'No printed or clear handwritten text could be identified in this image. Try holding the camera closer or checking the lighting.',
          'interrupt'
        );
      }
    } catch (err: any) {
      console.error('OCR error:', err);
      const errMsg = err?.message || 'OCR reading failed. Please retry.';
      setError(errMsg);
      speechService.speak(errMsg, 'interrupt');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = () => {
    if (result?.extracted_text) {
      navigator.clipboard.writeText(result.extracted_text);
      setCopied(true);
      speechService.speak('Text copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 select-none" role="region" aria-label="Read Text Screen">
      {/* Top Action Bar */}
      <div className="p-3.5 bg-[#180A10]/95 backdrop-blur-md rounded-2xl border border-[#3E1627] shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FBBF24] animate-pulse" />
          <span>Read Text & Signage (Neural OCR)</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {selectedImage && (
            <button
              onClick={handleClearImage}
              className="px-3.5 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-white font-bold text-xs border border-[#3E1627] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#FBBF24]" />
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
                onClick={() => onSwitchTask('find')}
                className="px-3 py-1.5 rounded-xl bg-[#25101C] hover:bg-[#331425] text-amber-300 font-bold text-xs border border-[#3E1627] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span>2. Find Object</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Intro Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-1">
          Read Text & Signage
        </h2>
        <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
          Extract exact text from badges, certificates, door plaques, medication bottles, blackboard notes, room signs, and product labels, and listen aloud.
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
          {/* Left: Image preview & Action */}
          <div className="lg:col-span-6 space-y-4">
            <div className="relative w-full rounded-3xl overflow-hidden bg-black/90 border border-[#3E1627] flex items-center justify-center max-h-[480px] shadow-2xl">
              <img
                ref={imageElementRef}
                src={selectedImage}
                alt="Document or sign to extract text from"
                className="max-h-[480px] w-full object-contain"
                crossOrigin="anonymous"
              />
            </div>

            {/* Laptop Camera Un-mirror Text Control */}
            <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-[#220E19] border border-[#3E1627]">
              <span className="text-xs text-white/70">
                Laptop camera mirrored the text backward?
              </span>
              <button
                onClick={handleFlipImage}
                disabled={isLoading || isFlipping}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-200 bg-amber-950/60 hover:bg-amber-900 border border-amber-600/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Flips the photo horizontally so backward/mirrored text becomes readable"
              >
                <FlipHorizontal className={`w-3.5 h-3.5 text-amber-400 ${isFlipping ? 'animate-spin' : ''}`} />
                <span>{isFlipping ? 'Flipping...' : 'Flip Photo (Un-mirror Text)'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleRunOCR}
                disabled={isLoading}
                className="flex-1 py-3.5 px-5 rounded-2xl bg-[#FBBF24] text-black font-extrabold text-sm hover:bg-[#F59E0B] disabled:opacity-50 transition-all shadow-lg shadow-[#FBBF24]/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Extracting Text with High-Precision Neural OCR...</span>
                  </>
                ) : (
                  <>
                    <BookOpen className="w-4 h-4" />
                    <span>Extract & Read Text Aloud</span>
                  </>
                )}
              </button>

              <button
                onClick={handleClearImage}
                disabled={isLoading}
                className="px-4 py-3.5 rounded-2xl bg-[#220E19] border border-[#3E1627] hover:bg-[#331425] text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                title="Choose a different image file"
              >
                <ArrowLeft className="w-4 h-4 text-[#FBBF24]" />
                <span>Choose Another Photo</span>
              </button>
            </div>
          </div>

          {/* Right: Extracted Text & Speech */}
          <div className="lg:col-span-6 space-y-4">
            {error && (
              <div className="p-4 bg-amber-950/40 rounded-2xl text-xs text-amber-200 flex items-center justify-between gap-3 border border-amber-500/40 shadow-md">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <div className="font-bold mb-0.5">OCR Notice</div>
                    <div>{error}</div>
                  </div>
                </div>
                <button
                  onClick={handleRunOCR}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-500 transition-colors shrink-0 cursor-pointer shadow-sm"
                >
                  Retry OCR
                </button>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <SpeechController
                  currentText={result.extracted_text || 'No readable text was found in the image.'}
                  autoSpeak={true}
                />

                {/* Extracted Text Content Box */}
                <div className="p-5 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5 flex-wrap">
                      <Sparkles className="w-3.5 h-3.5 text-[#FBBF24]" />
                      <span>Extracted Text Content ({result.word_count} words)</span>
                      {result.opencv_quality && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 normal-case">
                          OpenCV 5: Sharpness {result.opencv_quality.blur_score} • Lum {result.opencv_quality.mean_luminance}
                          {result.opencv_quality.clahe_applied ? ' • CLAHE Active' : ''}
                        </span>
                      )}
                    </div>
                    {result.extracted_text && (
                      <button
                        onClick={handleCopyText}
                        className="px-3 py-1.5 rounded-xl bg-[#220E19] hover:bg-[#2C1220] border border-[#3E1627] text-xs font-semibold text-white/80 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Copy text to clipboard"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Primary Heading / Sign Header if detected */}
                  {result.primary_heading && (
                    <div className="p-3.5 bg-[#FBBF24]/10 border border-[#FBBF24]/30 rounded-2xl flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-[#FBBF24] shrink-0" />
                      <div>
                        <div className="text-[10px] font-mono text-[#FBBF24] font-bold uppercase tracking-wider">
                          Primary Header / Sign Title
                        </div>
                        <div className="text-sm font-extrabold text-white">
                          {result.primary_heading}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Critical Information (Dates, Prices, Room Numbers, Warnings) */}
                  {result.critical_information && result.critical_information.length > 0 && (
                    <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-1.5">
                      <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-amber-400" />
                        <span>Key Data Points (Exact Transcriptions)</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.critical_information.map((item, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-black/50 border border-white/10 text-xs font-mono font-bold text-amber-200"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ambiguous or Obscured text segments notice */}
                  {result.ambiguous_segments && result.ambiguous_segments.length > 0 && (
                    <div className="p-3 bg-white/5 border border-white/10 rounded-2xl space-y-1 text-xs">
                      <div className="text-[11px] font-bold text-white/70 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>Uncertain / Partially Obscured Segments</span>
                      </div>
                      <ul className="text-white/60 space-y-0.5 pl-4 list-disc text-[11px]">
                        {result.ambiguous_segments.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-4 bg-[#220E19] rounded-2xl border border-[#3E1627] font-sans text-sm sm:text-base text-white leading-relaxed max-h-72 overflow-y-auto whitespace-pre-line">
                    {result.extracted_text || (
                      <span className="text-white/40 italic">
                        No printed or readable text was detected in this image.
                      </span>
                    )}
                  </div>

                  {/* Section breakdown */}
                  {result.lines && result.lines.length > 1 && (
                    <div className="space-y-2 pt-2 border-t border-[#311320]">
                      <div className="text-[11px] font-bold text-white/60">
                        Recognized Text Segments ({result.lines.length} lines):
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {result.lines.map((l, i) => (
                          <div
                            key={i}
                            className="p-2 rounded-xl bg-black/40 border border-white/5 text-xs text-white/80 flex items-center justify-between"
                          >
                            <span className="truncate">{l.text}</span>
                            <button
                              onClick={() => speechService.speak(l.text, 'interrupt')}
                              className="p-1 hover:text-[#FBBF24] transition-colors"
                              title="Read line aloud"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
