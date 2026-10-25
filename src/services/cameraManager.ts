/**
 * Central Camera Lifecycle & Session Manager for OmniLens
 * 
 * Guarantees:
 * 1. Single Camera Owner across the entire application.
 * 2. Complete track release on stop or feature switch (turns off hardware indicator).
 * 3. Asynchronous cancellation protection: late-resolving getUserMedia() promises are immediately stopped.
 * 4. Video readiness verification before frame capture.
 * 5. Clean snapshot capturing with aspect ratio preservation and optional mirroring.
 * 6. Actionable error classification and resolution guidance for NotAllowedError, NotFoundError, NotReadableError, InsecureContext.
 * 7. Soft fallback to simple { video: true } constraints if OverconstrainedError occurs.
 */

export type CameraLifecycleState =
  | 'idle'
  | 'starting'
  | 'active'
  | 'paused'
  | 'stopping'
  | 'error';

export interface CameraDetailedError {
  code:
    | 'NotAllowedError'
    | 'NotFoundError'
    | 'NotReadableError'
    | 'OverconstrainedError'
    | 'InsecureContext'
    | 'UnsupportedError'
    | 'UnknownError';
  title: string;
  message: string;
  guidance: string;
  canRetry: boolean;
}

export interface CameraSessionInfo {
  ownerId: string | null;
  state: CameraLifecycleState;
  hasStream: boolean;
  error: CameraDetailedError | null;
}

type CameraListener = (info: CameraSessionInfo) => void;

class CameraManager {
  private activeStream: MediaStream | null = null;
  private currentOwnerId: string | null = null;
  private state: CameraLifecycleState = 'idle';
  private currentRequestId: number = 0;
  private lastError: CameraDetailedError | null = null;
  private listeners: Set<CameraListener> = new Set();
  private idleStreamTimer: any = null;

  public getSessionInfo(): CameraSessionInfo {
    return {
      ownerId: this.currentOwnerId,
      state: this.state,
      hasStream: this.activeStream !== null,
      error: this.lastError,
    };
  }

  public subscribe(listener: CameraListener): () => void {
    this.listeners.add(listener);
    listener(this.getSessionInfo());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const info = this.getSessionInfo();
    this.listeners.forEach((fn) => {
      try {
        fn(info);
      } catch (e) {
        console.error('CameraManager listener error:', e);
      }
    });
  }

  /**
   * Checks current camera permission state using navigator.permissions where supported
   */
  public async checkPermissionStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
    if (!window.isSecureContext) return 'unsupported';
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const queryRes = await navigator.permissions.query({ name: 'camera' as any });
        return queryRes.state;
      } catch (e) {
        return 'unsupported';
      }
    }
    return 'unsupported';
  }

  /**
   * Acquire camera session exclusively for a specific component (e.g. 'live-detection', 'describe')
   * If a live camera stream is already running, reuses it immediately with zero hardware initialization delay!
   */
  public async acquireSession(
    ownerId: string,
    options: {
      facingMode?: 'user' | 'environment';
      idealWidth?: number;
      idealHeight?: number;
    } = {}
  ): Promise<MediaStream> {
    const reqId = ++this.currentRequestId;
    this.lastError = null;

    if (this.idleStreamTimer) {
      clearTimeout(this.idleStreamTimer);
      this.idleStreamTimer = null;
    }

    // Reuse existing live stream if active and healthy (0ms latency, no renegotiation lag)
    if (this.activeStream && this.activeStream.active) {
      const liveTrack = this.activeStream.getVideoTracks().find((t) => t.readyState === 'live');
      if (liveTrack) {
        this.currentOwnerId = ownerId;
        this.state = 'active';
        this.lastError = null;
        this.notify();
        return this.activeStream;
      }
    }

    // Release any stale stream
    this.stopActiveStreamDirectly();

    this.currentOwnerId = ownerId;
    this.state = 'starting';
    this.notify();

    // Verify secure context & mediaDevices availability
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const errDetail: CameraDetailedError = {
        code: 'InsecureContext',
        title: 'Insecure Origin (HTTPS Required)',
        message: 'Camera access requires a secure connection (HTTPS) or localhost.',
        guidance: 'Open this app over HTTPS or localhost to enable camera features.',
        canRetry: false,
      };
      this.state = 'error';
      this.lastError = errDetail;
      this.notify();
      throw new Error(errDetail.message);
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errDetail: CameraDetailedError = {
        code: 'UnsupportedError',
        title: 'Camera API Not Supported',
        message: 'Your browser does not support standard mediaDevices camera capture.',
        guidance: 'Please update your browser (Chrome, Edge, Firefox, Safari) or use photo upload.',
        canRetry: false,
      };
      this.state = 'error';
      this.lastError = errDetail;
      this.notify();
      throw new Error(errDetail.message);
    }

    try {
      let stream: MediaStream;
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: options.facingMode || 'user',
          width: { ideal: options.idealWidth || 1280 },
          height: { ideal: options.idealHeight || 720 },
        },
        audio: false,
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: any) {
        // If resolution or facingMode overconstrained, fallback to generic video
        if (firstErr.name === 'OverconstrainedError' || firstErr.name === 'ConstraintNotSatisfiedError') {
          console.warn('OverconstrainedError encountered, falling back to minimal video constraints');
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw firstErr;
        }
      }

      // Guard: if cancelled, invalidated, or owner changed while awaiting user permission
      if (this.currentRequestId !== reqId || this.currentOwnerId !== ownerId) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
        throw new Error('Camera request was cancelled or superseded.');
      }

      this.activeStream = stream;
      this.state = 'active';
      this.lastError = null;
      this.notify();
      return stream;
    } catch (err: any) {
      if (this.currentRequestId === reqId) {
        this.state = 'error';
        const errDetail = this.classifyCameraError(err);
        this.lastError = errDetail;
        this.notify();
      }
      throw err;
    }
  }

  /**
   * Classifies error with actionable explanations and browser settings guidance
   */
  public classifyCameraError(err: any): CameraDetailedError {
    const name = err?.name || '';
    const rawMsg = err?.message || String(err);

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || rawMsg.includes('Permission denied')) {
      return {
        code: 'NotAllowedError',
        title: 'Camera Permission Denied',
        message: 'The browser or site permissions blocked camera access.',
        guidance:
          '1. Look at your browser address bar at the top.\n2. Click the lock 🔒 or site settings icon beside the URL.\n3. Change "Camera" permission from Blocked to Allow.\n4. Click "Retry Camera Access" below, or upload a photo directly without camera.',
        canRetry: true,
      };
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || rawMsg.includes('Requested device not found')) {
      return {
        code: 'NotFoundError',
        title: 'No Camera Device Detected',
        message: 'No physical webcam or video capture device was detected on your system.',
        guidance:
          'Check that your camera is plugged in and recognized in your OS settings, or use the "Upload Photo" option to analyze images directly.',
        canRetry: true,
      };
    }

    if (name === 'NotReadableError' || name === 'TrackStartError' || rawMsg.includes('Could not start video source')) {
      return {
        code: 'NotReadableError',
        title: 'Camera Busy or Locked',
        message: 'Your camera is already in use by another application or browser tab.',
        guidance:
          'Close any other applications (Zoom, Teams, Discord, other browser tabs) currently accessing your webcam, then click "Retry Camera Access".',
        canRetry: true,
      };
    }

    if (name === 'OverconstrainedError') {
      return {
        code: 'OverconstrainedError',
        title: 'Unsupported Video Format',
        message: 'The requested video resolution or frame rate is not supported by your camera.',
        guidance: 'Click Retry Camera Access to start with default standard resolution.',
        canRetry: true,
      };
    }

    return {
      code: 'UnknownError',
      title: 'Camera Initialization Failed',
      message: rawMsg || 'Unable to start camera video stream.',
      guidance: 'Check that your browser has permission to access your webcam and click Retry, or select a photo from your device.',
      canRetry: true,
    };
  }

  /**
   * Release camera session owned by a specific component.
   * If immediate is false (default for feature navigation), keeps stream warm for 2.5 seconds
   * so switching between features reuses the active hardware feed with 0ms renegotiation lag.
   */
  public releaseSession(
    ownerId: string,
    videoElement?: HTMLVideoElement | null,
    immediate: boolean = false
  ) {
    if (this.currentOwnerId === ownerId || !this.currentOwnerId) {
      this.currentRequestId++;

      if (videoElement) {
        try {
          videoElement.pause();
          videoElement.srcObject = null;
        } catch (e) {}
      }

      this.currentOwnerId = null;

      if (immediate) {
        this.state = 'stopping';
        this.notify();
        this.stopActiveStreamDirectly();
        this.state = 'idle';
        this.notify();
      } else {
        // Keep stream warm for 2.5 seconds during UI transitions
        if (this.idleStreamTimer) clearTimeout(this.idleStreamTimer);
        this.idleStreamTimer = setTimeout(() => {
          if (!this.currentOwnerId) {
            this.state = 'stopping';
            this.notify();
            this.stopActiveStreamDirectly();
            this.state = 'idle';
            this.notify();
          }
        }, 2500);
      }
    }
  }

  /**
   * Force release all camera resources application-wide.
   */
  public releaseAll(videoElement?: HTMLVideoElement | null) {
    this.currentRequestId++;
    this.state = 'stopping';
    this.notify();

    this.stopActiveStreamDirectly();

    if (videoElement) {
      try {
        if (videoElement.srcObject) {
          const s = videoElement.srcObject as MediaStream;
          s.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch (e) {}
          });
          videoElement.srcObject = null;
        }
        videoElement.pause();
      } catch (e) {}
    }

    this.currentOwnerId = null;
    this.state = 'idle';
    this.notify();
  }

  private stopActiveStreamDirectly() {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.activeStream = null;
    }
  }

  /**
   * Safely attach a MediaStream to an HTMLVideoElement with standard inline playback flags.
   */
  public attachToVideo(video: HTMLVideoElement | null, stream?: MediaStream | null): void {
    if (!video) return;
    const targetStream = stream || this.activeStream;
    if (!targetStream) return;

    if (video.srcObject !== targetStream) {
      video.srcObject = targetStream;
    }
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    try {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Video auto-playback notice:', err);
        });
      }
    } catch (e) {}
  }

  /**
   * Wait for a video element attached to a stream to become playable and ready with real dimensions.
   */
  public async waitForVideoReady(
    video: HTMLVideoElement,
    timeoutMs: number = 3000
  ): Promise<boolean> {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        await video.play();
      } catch (e) {}
      return true;
    }

    return new Promise((resolve) => {
      let isResolved = false;

      const finish = (ok: boolean) => {
        if (!isResolved) {
          isResolved = true;
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('playing', onReady);
          video.removeEventListener('error', onError);
          clearTimeout(timer);
          resolve(ok);
        }
      };

      const onReady = () => {
        try {
          video.play().catch(() => {});
        } catch (e) {}
        finish(true);
      };

      const onError = () => {
        finish(false);
      };

      const timer = setTimeout(() => {
        // If stream has live tracks, consider it ready rather than aborting
        const hasLiveTracks = this.activeStream?.getVideoTracks().some((t) => t.readyState === 'live');
        finish(video.readyState >= 1 || hasLiveTracks || false);
      }, timeoutMs);

      video.addEventListener('loadedmetadata', onReady, { once: true });
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
      video.addEventListener('playing', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });

      try {
        video.play().catch(() => {});
      } catch (e) {}
    });
  }

  /**
   * Captures a fresh, current frame from a live video element.
   * Honors aspect ratio, optional left/right mirroring for webcam, and compresses to high-quality JPEG.
   */
  public captureFrame(
    video: HTMLVideoElement | null,
    options: { mirror?: boolean; quality?: number; maxWidth?: number; maxHeight?: number } = {}
  ): Promise<{ blob: Blob; dataUrl: string; width: number; height: number } | null> {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      try {
        const origW = video.videoWidth;
        const origH = video.videoHeight;
        const maxW = options.maxWidth || 1280;
        const maxH = options.maxHeight || 720;

        let targetW = origW;
        let targetH = origH;
        if (targetW > maxW || targetH > maxH) {
          const ratio = Math.min(maxW / targetW, maxH / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        if (options.mirror) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, targetW, targetH);

        const quality = options.quality ?? 0.85;
        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                dataUrl,
                width: targetW,
                height: targetH,
              });
            } else {
              resolve(null);
            }
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        console.error('Frame capture error:', err);
        resolve(null);
      }
    });
  }
}

export const cameraManager = new CameraManager();
