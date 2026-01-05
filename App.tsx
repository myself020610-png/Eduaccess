import React, { useState } from 'react';
import { Eye, Ear, ArrowLeft } from 'lucide-react';
import { AppMode } from './types';
import VisionAssistant from './components/VisionAssistant';
import HearingAssistant from './components/HearingAssistant';
import Button from './components/Button';
import { speak } from './services/speechService';
import { vibrate, HapticPatterns } from './services/hapticService';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);

  // Home Screen
  if (mode === AppMode.HOME) {
    return (
      <div className="min-h-screen bg-access-dark p-6 flex flex-col justify-center max-w-md mx-auto">
        <div className="mb-12 text-center space-y-4">
          <h1 className="text-5xl font-extrabold text-white tracking-tight">
            Edu<span className="text-access-accent">Access</span>
          </h1>
          <p className="text-lg md:text-xl font-bold bg-gradient-to-r from-sky-400 via-purple-400 to-access-accent bg-clip-text text-transparent leading-relaxed">
            Inclusive Learning Platform For Impaired Students
          </p>
        </div>

        <div className="space-y-6">
          <button
            onClick={() => {
              vibrate(HapticPatterns.click);
              speak("Vision Assistant");
              setMode(AppMode.VISION);
            }}
            onMouseEnter={() => speak("Vision Assistant")}
            onFocus={() => speak("Vision Assistant")}
            className="w-full group relative bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 hover:border-access-accent transition-all duration-300 rounded-3xl p-8 flex flex-col items-center gap-4 focus:outline-none focus:ring-4 focus:ring-access-accent/50"
            aria-label="Select Vision Assistant Mode"
          >
            <div className="bg-slate-900 p-6 rounded-full group-hover:scale-110 transition-transform">
              <Eye className="w-12 h-12 text-access-accent" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Vision Assistant</h2>
              <p className="text-slate-400">Clock-face descriptions & OCR</p>
            </div>
          </button>

          <button
            onClick={() => {
              vibrate(HapticPatterns.click);
              speak("Hearing Assistant");
              setMode(AppMode.HEARING);
            }}
            onMouseEnter={() => speak("Hearing Assistant")}
            onFocus={() => speak("Hearing Assistant")}
            className="w-full group relative bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 hover:border-access-info transition-all duration-300 rounded-3xl p-8 flex flex-col items-center gap-4 focus:outline-none focus:ring-4 focus:ring-access-info/50"
            aria-label="Select Hearing Assistant Mode"
          >
             <div className="bg-slate-900 p-6 rounded-full group-hover:scale-110 transition-transform">
              <Ear className="w-12 h-12 text-access-info" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Hearing Assistant</h2>
              <p className="text-slate-400">Real-time Transcription</p>
            </div>
          </button>
        </div>
        
        <footer className="mt-12 text-center text-slate-600 text-sm">
          EduAccess Core v1.0 • Built with Gemini
        </footer>
      </div>
    );
  }

  // Active Modes
  return (
    <div className="h-screen bg-access-dark flex flex-col max-w-2xl mx-auto overflow-hidden">
      {/* Top Navigation */}
      <div className="p-4 flex items-center border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <button 
          onClick={() => {
            vibrate(HapticPatterns.click);
            speak("Home");
            setMode(AppMode.HOME);
          }}
          onMouseEnter={() => speak("Back")}
          onFocus={() => speak("Back")}
          className="p-3 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Back to Home"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="ml-4 font-mono text-sm text-slate-500 uppercase tracking-widest">
          {mode === AppMode.VISION ? 'Vision Mode' : 'Hearing Mode'}
        </span>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-hidden">
        {mode === AppMode.VISION ? <VisionAssistant /> : <HearingAssistant />}
      </main>
    </div>
  );
};

export default App;