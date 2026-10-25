import React, { useState, useEffect } from 'react';
import {
  ActiveTask,
  AccessibilitySettings,
  EngineMode,
  HealthResponse,
} from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { RightPanels } from './components/RightPanels';
import { DashboardHome } from './components/DashboardHome';
import { NeonPerimeterLines } from './components/NeonPerimeterLines';
import { VoiceAssistantController } from './components/VoiceAssistantController';
import { DescribeSurroundingsView } from './components/DescribeSurroundingsView';
import { FindObjectView } from './components/FindObjectView';
import { ReadTextView } from './components/ReadTextView';
import { LiveDetectionView } from './components/LiveDetectionView';
import { OnboardingPermissionsModal } from './components/OnboardingPermissionsModal';
import { PrivacyModal } from './components/PrivacyModal';
import { AccessibilityModal } from './components/AccessibilityModal';
import { UserManualModal } from './components/UserManualModal';
import { AboutModelModal } from './components/AboutModelModal';
import { BackendModal } from './components/BackendModal';
import { apiService } from './services/apiService';
import { speechService } from './services/speech';
import { cameraManager } from './services/cameraManager';
import {
  ArrowLeft,
  Eye,
  Search,
  BookOpen,
  Scan,
  RotateCcw,
  VolumeX,
} from 'lucide-react';

export default function App() {
  const [activeTask, setActiveTask] = useState<ActiveTask>('home');
  const [engineMode, setEngineMode] = useState<EngineMode>(apiService.getEngineMode());
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Modals state (onboarding is available on demand so it never traps the initial page load)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState<boolean>(false);
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [isAccessibilityOpen, setIsAccessibilityOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isEngineOpen, setIsEngineOpen] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Persistent accessibility configuration
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnilens_accessibility');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return {
      fontSize: 'normal',
      highContrast: false,
      reduceMotion: false,
      speechRate: 1.0,
      speechPitch: 1.0,
      autoSpeakResults: true,
      announcePosition: true,
      soundEffects: true,
      invertLeftRight: false,
    };
  });

  useEffect(() => {
    localStorage.setItem('omnilens_accessibility', JSON.stringify(settings));
    speechService.setRate(settings.speechRate);
    speechService.setPitch(settings.speechPitch);
  }, [settings]);

  useEffect(() => {
    const unsub = speechService.subscribe((speaking: boolean) => {
      setIsSpeaking(speaking);
    });
    return unsub;
  }, []);

  const refreshHealth = async () => {
    try {
      const res = await apiService.checkHealth();
      setHealth(res);
    } catch (e) {
      setHealth(null);
    }
  };

  useEffect(() => {
    refreshHealth();
  }, [engineMode]);

  const handleUpdateSettings = (newPartial: Partial<AccessibilitySettings>) => {
    setSettings((prev) => ({ ...prev, ...newPartial }));
  };

  const handleSelectTask = (task: ActiveTask) => {
    if (task === 'settings') {
      setIsAccessibilityOpen(true);
      return;
    }
    if (task === 'about') {
      setIsAboutOpen(true);
      return;
    }
    setActiveTask(task);
  };

  const handleEngineModeChange = (mode: EngineMode) => {
    apiService.setEngineMode(mode);
    setEngineMode(mode);
  };

  const handleCompleteOnboarding = () => {
    localStorage.setItem('omnilens_onboarding_completed', 'true');
    setIsOnboardingOpen(false);
  };

  // Determine font size class
  const getFontSizeClass = () => {
    if (settings.fontSize === 'extra-large') return 'font-size-xlarge';
    if (settings.fontSize === 'large') return 'font-size-large';
    return 'font-size-normal';
  };

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('omnilens_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });

  const toggleSidebarCollapse = () => {
    const next = !isLeftSidebarCollapsed;
    setIsLeftSidebarCollapsed(next);
    localStorage.setItem('omnilens_sidebar_collapsed', String(next));
  };

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#0B0507] text-[#FAF7F0] font-sans selection:bg-[#EC4899] selection:text-white relative overflow-x-hidden ${getFontSizeClass()} ${
        settings.highContrast ? 'high-contrast-mode' : ''
      }`}
    >
      {/* 1. Neon Perimeter Lines (Fluid concentric trails from image_89f6a0e3) */}
      <NeonPerimeterLines reduceMotion={settings.reduceMotion} />

      {/* 2. Top Header matching image_e7ecfc04 */}
      <Header
        activeTask={activeTask}
        onSelectTask={handleSelectTask}
        onOpenSettings={() => setIsAccessibilityOpen(true)}
        onToggleMobileMenu={() => setIsMobileNavOpen((prev) => !prev)}
        isRightPanelOpen={isRightPanelOpen}
        onToggleRightPanel={() => setIsRightPanelOpen((prev) => !prev)}
      />

      {/* 3. Main Workspace Container with Flexible 3-Column Layout */}
      <div className="flex-1 w-full max-w-[1720px] mx-auto flex flex-col lg:flex-row relative z-10 transition-all duration-300">
        {/* Left Column: Navigation Sidebar (Collapsible desktop + mobile drawer) */}
        <Sidebar
          activeTask={activeTask}
          onSelectTask={handleSelectTask}
          onOpenSettings={() => setIsAccessibilityOpen(true)}
          onOpenHelp={() => setIsManualOpen(true)}
          isCollapsed={isLeftSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
          isMobileOpen={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
        />

        {/* Center Column: Active Viewport (expands dynamically when right panel is toggled) */}
        <main
          className="flex-1 min-w-0 p-3 sm:p-5 lg:p-7 space-y-6 transition-all duration-300"
          role="main"
          id="main-content"
        >
          {/* Active Mode Banner (when navigating inside sub-views) */}
          {activeTask !== 'home' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#180A10]/90 backdrop-blur-md border border-[#3E1627] shadow-xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTask('home')}
                  className="p-2.5 rounded-xl bg-[#2C121D] hover:bg-[#3D1828] text-white border border-[#521E33] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                  aria-label="Return to Dashboard Home"
                >
                  <ArrowLeft className="w-4 h-4 text-[#EC4899]" />
                  <span className="hidden sm:inline">Home</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#220E19] border border-[#3E1627] flex items-center justify-center">
                    {activeTask === 'describe' && <Eye className="w-4 h-4 text-[#EC4899]" />}
                    {activeTask === 'find' && <Search className="w-4 h-4 text-[#F59E0B]" />}
                    {activeTask === 'read' && <BookOpen className="w-4 h-4 text-[#FBBF24]" />}
                    {activeTask === 'live' && <Scan className="w-4 h-4 text-[#10B981]" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#EC4899]">
                      Active Workspace
                    </span>
                    <h2 className="text-sm sm:text-base font-extrabold text-white">
                      {activeTask === 'describe' && 'Describe Surroundings & Activity'}
                      {activeTask === 'find' && 'Find Object with Spatial Audio Elevation'}
                      {activeTask === 'read' && 'Read Text Aloud (Neural OCR)'}
                      {activeTask === 'live' && 'Continuous Live Spatial Detection'}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Quick Speech Repeat & Silence */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => speechService.repeat()}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors cursor-pointer"
                  title="Repeat last spoken announcement"
                  aria-label="Repeat speech"
                >
                  <RotateCcw className="w-4 h-4 text-[#EC4899]" />
                </button>
                {isSpeaking && (
                  <button
                    onClick={() => speechService.stop()}
                    className="p-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-600/40 text-rose-300 transition-colors cursor-pointer"
                    title="Silence audio"
                    aria-label="Silence audio"
                  >
                    <VolumeX className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active View Content */}
          <div className="relative">
            {activeTask === 'home' && (
              <DashboardHome
                onSelectTask={handleSelectTask}
                onOpenVoiceAssistant={() => {
                  speechService.speak('Voice assistant ready. Say describe surroundings, find glasses, read text, or live detection.', 'interrupt', 'general');
                }}
              />
            )}

            {activeTask === 'describe' && (
              <DescribeSurroundingsView
                highContrast={settings.highContrast}
                onSwitchTask={handleSelectTask}
              />
            )}

            {activeTask === 'find' && (
              <FindObjectView
                highContrast={settings.highContrast}
                onSwitchTask={handleSelectTask}
              />
            )}

            {activeTask === 'read' && (
              <ReadTextView
                highContrast={settings.highContrast}
                onSwitchTask={handleSelectTask}
              />
            )}

            {activeTask === 'live' && (
              <LiveDetectionView
                highContrast={settings.highContrast}
                onSwitchTask={handleSelectTask}
              />
            )}
          </div>
        </main>

        {/* Right Column: Accessibility & System Status & Privacy */}
        <RightPanels
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onOpenPrivacy={() => setIsPrivacyOpen(true)}
          isOpen={isRightPanelOpen}
          onClose={() => setIsRightPanelOpen(false)}
        />
      </div>

      {/* 4. Global Voice Assistant Controller */}
      <div className="relative z-20 max-w-[1720px] w-full mx-auto px-3 sm:px-5 lg:px-7 pb-4">
        <VoiceAssistantController
          onSelectTask={handleSelectTask}
          onRunAction={(task) => setActiveTask(task)}
          isSpeaking={isSpeaking}
          onOpenAccessibility={() => setIsAccessibilityOpen(true)}
        />
      </div>

      {/* 5. Minimal Accessible Footer */}
      <footer className="mt-auto border-t border-[#2D121F] bg-[#0c0609] py-4 text-xs text-[#FAF7F0]/50 relative z-10 select-none">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">OmniLens</span>
            <span>—</span>
            <span>Voice-first visual & mobility companion for blind and low-vision users.</span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={() => setIsPrivacyOpen(true)}
              className="hover:text-white transition-colors cursor-pointer underline"
            >
              Privacy & Local Processing
            </button>
            <button
              onClick={() => setIsManualOpen(true)}
              className="hover:text-white transition-colors cursor-pointer underline"
            >
              User Manual
            </button>
            <button
              onClick={() => setIsAboutOpen(true)}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Model Specs
            </button>
            <button
              onClick={() => setIsEngineOpen(true)}
              className="hover:text-white transition-colors cursor-pointer font-mono"
            >
              Engine ({engineMode === 'gemini-vision' ? 'Gemini 3.8 Flash' : engineMode})
            </button>
          </div>
        </div>
      </footer>

      {/* --- MODALS --- */}
      {/* 1. First-Time Setup & Permissions Modal */}
      <OnboardingPermissionsModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onContinue={handleCompleteOnboarding}
      />

      {/* 2. Privacy Disclosure Modal */}
      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

      {/* 3. User Manual & Help Guide Modal */}
      <UserManualModal
        isOpen={isManualOpen}
        onClose={() => setIsManualOpen(false)}
        onSelectTask={handleSelectTask}
      />

      {/* 4. Accessibility Settings Modal */}
      <AccessibilityModal
        isOpen={isAccessibilityOpen}
        onClose={() => setIsAccessibilityOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* 5. About Model Specs Modal */}
      <AboutModelModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* 6. Backend Engine Modal */}
      <BackendModal
        isOpen={isEngineOpen}
        onClose={() => setIsEngineOpen(false)}
        engineMode={engineMode}
        onUpdateEngineMode={handleEngineModeChange}
        health={health}
        onRefreshHealth={refreshHealth}
      />
    </div>
  );
}
