import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Camera,
  Image as ImageIcon,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FlipHorizontal,
  ArrowLeft,
  Sparkles,
  CameraOff,
} from 'lucide-react';
import { SAMPLE_IMAGES, SampleImage } from '../data/sampleImages';
import { flipImageHorizontally } from '../services/imageUtils';
import { speechService } from '../services/speech';
import { cameraManager, CameraDetailedError } from '../services/cameraManager';

interface ImageInputZoneProps {
  selectedImage: string | null;
  onImageSelected: (imageSrc: string, file?: File) => void;
  onClearImage: () => void;
  isLoading: boolean;
  defaultMode?: 'upload' | 'camera';
}

export const ImageInputZone: React.FC<ImageInputZoneProps> = ({
  selectedImage,
  onImageSelected,
  onClearImage,
  isLoading,
  defaultMode = 'upload',
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>(defaultMode);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraStarting, setCameraStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<CameraDetailedError | null>(null);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; name?: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRequestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Stop camera when unmounting or switching to upload tab
  const stopCameraStream = () => {
    cameraRequestIdRef.current++;
    cameraManager.releaseSession('image-input-zone', videoRef.current);
    setCameraActive(false);
    setCameraStarting(false);
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCameraStream();
    };
  }, []);

  const handleStartCamera = async () => {
    const reqId = ++cameraRequestIdRef.current;
    setCameraError(null);
    setCameraStarting(true);
    setCameraActive(false);

    try {
      const stream = await cameraManager.acquireSession('image-input-zone', {
        facingMode: 'user',
        idealWidth: 1280,
        idealHeight: 720,
      });

      if (!isMountedRef.current || cameraRequestIdRef.current !== reqId) {
        cameraManager.releaseSession('image-input-zone', videoRef.current);
        return;
      }

      if (videoRef.current) {
        cameraManager.attachToVideo(videoRef.current, stream);
        await cameraManager.waitForVideoReady(videoRef.current, 2500);
      }

      if (!isMountedRef.current || cameraRequestIdRef.current !== reqId) {
        cameraManager.releaseSession('image-input-zone', videoRef.current);
        return;
      }

      setCameraActive(true);
      setCameraStarting(false);
      speechService.speak('Live camera active. Point at surroundings and press Capture Photo.');
    } catch (err: any) {
      if (cameraRequestIdRef.current !== reqId) return;
      console.warn('Camera start error in ImageInputZone:', err);
      const classified = cameraManager.classifyCameraError(err);
      setCameraError(classified);
      setCameraActive(false);
      setCameraStarting(false);
      speechService.speak(classified.title + '. ' + classified.message, 'interrupt');
    }
  };

  const handleCaptureSnapshot = async () => {
    if (!videoRef.current || !cameraActive) return;
    const capture = await cameraManager.captureFrame(videoRef.current, {
      mirror: isMirrored,
      quality: 0.85,
    });
    if (capture) {
      const file = new File([capture.blob], 'camera-capture.jpg', { type: 'image/jpeg' });
      setImageMeta({ width: capture.width, height: capture.height, name: 'Live Camera Photo' });
      onImageSelected(capture.dataUrl, file);
      stopCameraStream();
      speechService.speak('Photo captured successfully.', 'interrupt');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndLoadFile(file);
    }
    if (e.target) e.target.value = '';
  };

  const validateAndLoadFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      speechService.speak('Invalid file format. Please upload a JPEG, PNG, or WebP photo.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      speechService.speak('File size exceeds the 25 megabyte limit. Please select a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        const img = new Image();
        img.onload = () => {
          setImageMeta({ width: img.naturalWidth, height: img.naturalHeight, name: file.name });
          onImageSelected(dataUrl, file);
          speechService.speak(`Photo ${file.name} loaded. Ready for analysis.`, 'interrupt');
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndLoadFile(file);
    }
  };

  const handleSelectSample = (sample: SampleImage) => {
    const img = new Image();
    img.onload = () => {
      setImageMeta({ width: img.naturalWidth, height: img.naturalHeight, name: sample.title });
    };
    img.src = sample.src;
    onImageSelected(sample.src);
    speechService.speak(`Sample image ${sample.title} selected.`);
  };

  const handleFlipCurrentImage = async () => {
    if (!selectedImage || isFlipping) return;
    setIsFlipping(true);
    try {
      const { dataUrl, file } = await flipImageHorizontally(selectedImage);
      onImageSelected(dataUrl, file);
      speechService.speak('Photo flipped horizontally.');
    } catch (err) {
      console.error('Failed to flip image:', err);
    } finally {
      setIsFlipping(false);
    }
  };

  return (
    <div className="w-full space-y-4" role="region" aria-label="Visual Input Selector">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp,image/bmp"
        className="hidden"
        aria-label="Upload image from device"
      />

      {/* Active Loaded Image Banner */}
      {selectedImage ? (
        <div className="p-4 bg-[#1C0D15] rounded-3xl border border-[#3E1627] shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={selectedImage}
              alt="Active visual input"
              className="w-16 h-16 rounded-2xl object-cover border border-[#521E36] shadow-md shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Active Image Loaded</span>
              </div>
              <div className="text-xs text-white/60 truncate mt-0.5">
                {imageMeta ? `${imageMeta.name || 'Image'} • ${imageMeta.width}×${imageMeta.height}px` : 'Ready for analysis'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleFlipCurrentImage}
              disabled={isLoading || isFlipping}
              className="px-3.5 py-2 text-xs font-bold text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-600/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              title="Flip image horizontally so real-world left and right align"
            >
              <FlipHorizontal className={`w-3.5 h-3.5 ${isFlipping ? 'animate-spin' : ''}`} />
              <span>{isFlipping ? 'Flipping...' : 'Flip Left ↔ Right'}</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-bold text-[#EC4899] bg-[#EC4899]/15 hover:bg-[#EC4899]/25 border border-[#EC4899]/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Choose Another Photo</span>
            </button>

            <button
              onClick={onClearImage}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-bold text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-600/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      ) : (
        /* Image Selection Tabs & Container */
        <div className="p-6 bg-[#180A10]/95 backdrop-blur-md rounded-3xl border border-[#3E1627] shadow-xl space-y-6">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center justify-between border-b border-[#311320] pb-4">
            <div className="flex items-center gap-2 p-1 bg-[#12070D] rounded-2xl border border-[#3E1627]">
              <button
                onClick={() => {
                  setActiveTab('upload');
                  stopCameraStream();
                }}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-[#EC4899] text-white shadow-md shadow-[#EC4899]/25'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>Upload Photo</span>
              </button>

              <button
                onClick={() => setActiveTab('camera')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'camera'
                    ? 'bg-[#00F0FF] text-black font-extrabold shadow-md shadow-[#00F0FF]/25'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Use Live Camera</span>
              </button>
            </div>

            <span className="hidden sm:inline-block text-xs text-white/50">
              {activeTab === 'upload' ? 'Upload files without camera permission' : 'Capture photo directly from webcam'}
            </span>
          </div>

          {/* Tab 1: Upload Photo */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-8 border-2 border-dashed rounded-3xl transition-all text-center flex flex-col items-center justify-center ${
                  isDragging
                    ? 'border-[#EC4899] bg-[#EC4899]/10 scale-[0.99]'
                    : 'border-[#3E1627] bg-[#1C0D15]/60 hover:border-[#EC4899]/50 hover:bg-[#1C0D15]'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-[#EC4899]/15 border border-[#EC4899]/30 flex items-center justify-center text-[#EC4899] mb-4 shadow-lg shadow-[#EC4899]/10">
                  <Upload className="w-8 h-8" />
                </div>

                <h3 className="text-lg sm:text-xl font-extrabold text-white mb-1.5">
                  Choose a Photo from your Device
                </h3>
                <p className="text-xs sm:text-sm text-white/65 max-w-md mb-6 leading-relaxed">
                  Drag and drop a photo here, select a file from your computer or phone, or test with a sample everyday scene.
                </p>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="px-6 py-3 rounded-2xl bg-[#EC4899] hover:bg-[#DB2777] text-white text-xs sm:text-sm font-bold shadow-lg shadow-[#EC4899]/25 transition-all flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EC4899]"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Select Image File (JPEG, PNG, WebP)</span>
                </button>
              </div>

              {/* Sample Everyday Scenes */}
              <div className="pt-2 border-t border-[#311320]">
                <div className="text-xs font-bold text-white/60 mb-3 text-center sm:text-left">
                  Or test immediately with a verified scene:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {SAMPLE_IMAGES.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => handleSelectSample(sample)}
                      className="flex items-center gap-3 p-2.5 rounded-2xl border border-[#3E1627] bg-[#1C0D15] hover:border-[#EC4899] hover:bg-[#25101C] text-left transition-all group cursor-pointer"
                    >
                      <img
                        src={sample.src}
                        alt={sample.title}
                        className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white group-hover:text-pink-200 truncate">
                          {sample.title}
                        </div>
                        <div className="text-[11px] text-white/50 truncate">
                          {sample.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Live Camera Capture */}
          {activeTab === 'camera' && (
            <div className="space-y-4">
              {/* Error Guidance Diagnostic */}
              {cameraError && (
                <div className="p-5 bg-amber-950/40 border border-amber-500/40 rounded-2xl space-y-3 text-amber-200">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{cameraError.title}</span>
                  </div>
                  <p className="text-xs text-white/85 leading-relaxed">
                    {cameraError.message}
                  </p>
                  <div className="p-3 bg-black/40 rounded-xl text-xs font-mono text-white/80 whitespace-pre-line border border-white/10">
                    {cameraError.guidance}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {cameraError.canRetry && (
                      <button
                        onClick={handleStartCamera}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                      >
                        Retry Camera Access
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setActiveTab('upload');
                        setCameraError(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/15 transition-colors cursor-pointer"
                    >
                      Switch to Upload Photo
                    </button>
                  </div>
                </div>
              )}

              {/* Viewfinder Container */}
              <div className="space-y-4">
                <div className="relative rounded-3xl overflow-hidden bg-black aspect-video max-h-[460px] flex items-center justify-center border border-[#3E1627] shadow-2xl">
                  {/* The video element is ALWAYS mounted in the DOM so videoRef.current is never null */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
                    className={`w-full h-full object-cover transition-transform duration-200 ${
                      cameraActive ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
                    }`}
                  />

                  {/* Overlay displayed when camera is not yet active */}
                  {!cameraActive && (
                    <div className="absolute inset-0 z-10 p-8 bg-[#180A10]/95 backdrop-blur-md text-center flex flex-col items-center justify-center space-y-4">
                      {cameraStarting ? (
                        <div className="space-y-4 flex flex-col items-center">
                          <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
                            <RefreshCw className="w-8 h-8 animate-spin" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-lg font-extrabold text-white">Opening Camera...</h3>
                            <p className="text-xs text-white/70 max-w-sm leading-relaxed">
                              Requesting live camera stream. If your browser displays a permission prompt, please click <strong className="text-cyan-300">Allow</strong>.
                            </p>
                          </div>
                          <button
                            onClick={stopCameraStream}
                            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4 flex flex-col items-center">
                          <div className="w-16 h-16 rounded-2xl bg-[#00F0FF]/15 border border-[#00F0FF]/30 flex items-center justify-center text-[#00F0FF] shadow-lg shadow-[#00F0FF]/10">
                            <Camera className="w-8 h-8" />
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-lg font-extrabold text-white">
                              Start Camera for Photo Capture
                            </h3>
                            <p className="text-xs text-white/60 max-w-md">
                              Click below to activate your webcam. Once active, frame any object or text and capture a high-resolution photo for AI analysis.
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                            <button
                              onClick={handleStartCamera}
                              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black font-black text-xs sm:text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-2 cursor-pointer"
                            >
                              <Camera className="w-4 h-4" />
                              <span>Start Live Camera</span>
                            </button>

                            <button
                              onClick={() => setActiveTab('upload')}
                              className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors cursor-pointer"
                            >
                              Upload Photo Instead
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Viewfinder crosshairs when camera is active */}
                  {cameraActive && (
                    <>
                      <div className="absolute inset-0 pointer-events-none border border-white/15 rounded-2xl m-6 flex items-center justify-center">
                        <div className="w-16 h-16 border-2 border-[#EC4899]/70 rounded-2xl" />
                      </div>

                      <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-emerald-600/90 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-md">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span>Camera Live</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Controls when camera is active */}
                {cameraActive && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsMirrored(!isMirrored)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                          isMirrored
                            ? 'bg-[#EC4899] text-white border-[#EC4899]'
                            : 'bg-[#1C0D15] text-white/80 border-[#3E1627] hover:bg-[#25101C]'
                        }`}
                        title="Mirror mode: Inverts preview so right is right and left is left (ideal for laptop cameras)"
                      >
                        <FlipHorizontal className="w-3.5 h-3.5" />
                        <span>{isMirrored ? 'Laptop Mirror: ON' : 'Mirror: OFF'}</span>
                      </button>

                      <button
                        onClick={stopCameraStream}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors cursor-pointer"
                      >
                        Stop Camera
                      </button>
                    </div>

                    <button
                      onClick={handleCaptureSnapshot}
                      disabled={isLoading}
                      className="px-6 py-3 rounded-2xl bg-[#EC4899] hover:bg-[#DB2777] text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-[#EC4899]/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture Photo & Analyze</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
