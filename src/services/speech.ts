/**
 * Central Priority-Aware Speech Coordinator for OmniLens
 * Coordinates:
 *  - Urgent / User Action: Direct button requests & emergency stops
 *  - Spatial Alerts: Live detection alerts ("Bottle in center", "Person on left") with duplicate suppression
 *  - Scene / OCR: Descriptions and document text
 */

export type SpeechCategory = 'emergency' | 'obstacle' | 'description' | 'general';

interface QueuedUtterance {
  id: string;
  text: string;
  category: SpeechCategory;
  priorityScore: number; // Higher number = higher priority
  timestamp: number;
}

class SpeechService {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentCategory: SpeechCategory | null = null;
  private lastSpokenText: string = '';
  private listeners: Set<(speaking: boolean) => void> = new Set();
  private rate: number = 1.0;
  private pitch: number = 1.0;
  private useAiVoice: boolean = false;

  // Duplicate suppression for live obstacle alerts
  private lastObstacleAlertText: string = '';
  private lastObstacleAlertTime: number = 0;

  // Queue of pending speech items
  private queue: QueuedUtterance[] = [];
  private isProcessingQueue: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    }
  }

  public isAvailable(): boolean {
    return this.synth !== null || typeof Audio !== 'undefined';
  }

  public setRate(rate: number): void {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  public getRate(): number {
    return this.rate;
  }

  public setPitch(pitch: number): void {
    this.pitch = Math.max(0.5, Math.min(1.5, pitch));
  }

  public setUseAiVoice(val: boolean): void {
    this.useAiVoice = val;
  }

  public getUseAiVoice(): boolean {
    return this.useAiVoice;
  }

  public subscribe(callback: (speaking: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(speaking: boolean): void {
    this.listeners.forEach((fn) => {
      try {
        fn(speaking);
      } catch (e) {
        console.error('Error in speech listener', e);
      }
    });
  }

  /**
   * Primary speak method with priority & category coordination
   */
  public async speak(
    text: string,
    priority: 'interrupt' | 'queue' = 'interrupt',
    category: SpeechCategory = 'general'
  ): Promise<void> {
    if (!text || !text.trim()) return;

    const trimmed = text.trim();
    this.lastSpokenText = trimmed;

    // High priority: user emergency or direct command interrupts immediately
    if (priority === 'interrupt') {
      this.stop();
      await this.executeSpeech(trimmed, category);
      return;
    }

    // Otherwise, add to priority queue
    const priorityScore = this.getCategoryScore(category);
    this.queue.push({
      id: Math.random().toString(36).substring(2),
      text: trimmed,
      category,
      priorityScore,
      timestamp: Date.now(),
    });
    this.queue.sort((a, b) => b.priorityScore - a.priorityScore);

    this.processQueue();
  }

  /**
   * Speak a camera detection alert with duplicate suppression
   */
  public speakObstacleAlert(text: string, cooldownMs: number = 6000): boolean {
    if (!text || !text.trim()) return false;
    const now = Date.now();
    const clean = text.trim().toLowerCase();

    // Check duplicate suppression
    if (this.lastObstacleAlertText === clean && now - this.lastObstacleAlertTime < cooldownMs) {
      return false; // suppressed duplicate
    }

    this.lastObstacleAlertText = clean;
    this.lastObstacleAlertTime = now;
    this.speak(text, 'interrupt', 'obstacle');
    return true;
  }

  /**
   * Compatibility alias for live camera stream alerts
   */
  public speakLiveAlert(text: string, cooldownMs: number = 6000): boolean {
    return this.speakObstacleAlert(text, cooldownMs);
  }

  /**
   * Repeat the last spoken text
   */
  public repeat(): void {
    if (this.lastSpokenText) {
      this.speak(this.lastSpokenText, 'interrupt', this.currentCategory || 'general');
    }
  }

  /**
   * Pause active speech
   */
  public pause(): void {
    if (this.synth && this.synth.speaking && !this.synth.paused) {
      this.synth.pause();
    }
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  /**
   * Resume paused speech
   */
  public resume(): void {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
    }
    if (this.currentAudio && this.currentAudio.paused) {
      this.currentAudio.play();
    }
  }

  public isPaused(): boolean {
    return Boolean(
      this.synth?.paused || (this.currentAudio && this.currentAudio.paused && this.currentAudio.currentTime > 0)
    );
  }

  /**
   * Immediately stops all audio output and empties queue
   */
  public stop(): void {
    this.queue = [];
    this.isProcessingQueue = false;

    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    this.currentCategory = null;
    this.notify(false);
  }

  public isSpeaking(): boolean {
    return (
      (this.synth ? this.synth.speaking : false) ||
      (this.currentAudio !== null && !this.currentAudio.paused)
    );
  }

  public getCurrentCategory(): SpeechCategory | null {
    return this.currentCategory;
  }

  public getLastSpoken(): string {
    return this.lastSpokenText;
  }

  private getCategoryScore(cat: SpeechCategory): number {
    switch (cat) {
      case 'emergency':
        return 100;
      case 'obstacle':
        return 60;
      case 'description':
        return 40;
      default:
        return 20;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.isSpeaking() || this.queue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    const item = this.queue.shift();
    if (item) {
      await this.executeSpeech(item.text, item.category);
    }
    this.isProcessingQueue = false;

    if (this.queue.length > 0) {
      this.processQueue();
    }
  }

  private async executeSpeech(text: string, category: SpeechCategory): Promise<void> {
    this.currentCategory = category;

    // Optional Gemini TTS
    if (this.useAiVoice) {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.audioDataUrl) {
            await new Promise<void>((resolve) => {
              const audio = new Audio(data.audioDataUrl);
              audio.playbackRate = this.rate;
              this.currentAudio = audio;
              this.notify(true);

              audio.onended = () => {
                this.currentAudio = null;
                this.currentCategory = null;
                this.notify(false);
                resolve();
              };

              audio.onerror = () => {
                this.currentAudio = null;
                this.currentCategory = null;
                this.notify(false);
                this.speakBrowserSynth(text).then(resolve);
              };

              audio.play().catch(() => {
                this.speakBrowserSynth(text).then(resolve);
              });
            });
            return;
          }
        }
      } catch (e) {
        console.warn('AI TTS fallback to Web Speech:', e);
      }
    }

    await this.speakBrowserSynth(text);
  }

  /**
   * Warm up browser speech engine so first word starts with zero device latency
   */
  public warmUp(): void {
    if (this.synth) {
      try {
        this.synth.getVoices();
        if (this.synth.paused) {
          this.synth.resume();
        }
      } catch (e) {}
    }
  }

  /**
   * Begins speaking immediateSummary instantly, then seamlessly continues reading fullBody.
   * Eliminates the waiting delay for long document OCR synthesis!
   */
  public speakPromptlyWithContinuation(immediateSummary: string, fullBody: string): void {
    this.stop();
    if (!immediateSummary && !fullBody) return;

    if (!immediateSummary || immediateSummary === fullBody) {
      this.speak(fullBody, 'interrupt', 'description');
      return;
    }

    // Speak immediate summary first
    this.speak(immediateSummary, 'interrupt', 'description');

    // Queue the detailed body text right after
    const remaining = fullBody.replace(immediateSummary, '').trim();
    if (remaining.length > 0) {
      this.speak(remaining, 'queue', 'description');
    }
  }

  private speakBrowserSynth(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synth) {
        resolve();
        return;
      }

      try {
        if (this.synth.paused) {
          this.synth.resume();
        }
      } catch (e) {}

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;

      utterance.onstart = () => {
        this.currentUtterance = utterance;
        this.notify(true);
      };

      utterance.onend = () => {
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        this.currentCategory = null;
        this.notify(false);
        resolve();
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        this.currentCategory = null;
        this.notify(false);
        resolve();
      };

      this.synth.speak(utterance);
    });
  }
}

export const speechService = new SpeechService();
