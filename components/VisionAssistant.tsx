import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X, Sparkles, Volume2, Image as ImageIcon, ChevronLeft, AlertCircle } from 'lucide-react';
import { analyzeImage } from '../services/geminiService';
import { VisionState } from '../types';
import { speak, stopSpeech } from '../services/speechService';
import { vibrate, HapticPatterns } from '../services/hapticService';
import { VISION_SYSTEM_PROMPT } from '../constants';

// --- Audio Cue System ---
const playAudioCue = (type: 'start' | 'capture' | 'success') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    
    if (type === 'start') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } 
    else if (type === 'capture') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } 
    else if (type === 'success') {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); 
      gain1.gain.setValueAtTime(0.05, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.1); 
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.05, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.start(now);
      osc1.stop(now + 0.6);
      osc2.start(now);
      osc2.stop(now + 0.6);
    }
  } catch (e) {
    // Silently fail
  }
};

const VisionAssistant: React.FC = () => {
  const [state, setState] = useState<VisionState>({
    isAnalyzing: false,
    image: null,
    analysis: null,
    error: null
  });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Auto-Capture States
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
      stopSpeech();
    };
  }, []);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const stopCamera = useCallback(() => {
    stopCameraStream();
    setIsCameraActive(false);
    setCameraReady(false);
    setCountdown(null);
    vibrate(HapticPatterns.click);
  }, []);

  // Initialize camera when active state changes
  useEffect(() => {
    const initCamera = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
           speak("Camera not supported on this device.");
           setState(prev => ({ ...prev, error: "Camera not supported." }));
           setIsCameraActive(false);
           return;
        }
    
        try {
          const constraints = { 
            video: { 
              facingMode: 'environment',
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            } 
          };
    
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef.current = stream;
    
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = async () => {
                 try {
                    await videoRef.current?.play();
                    setCameraReady(true);
                    setCountdown(5); // Start auto-capture countdown
                    speak("Camera active. Auto capturing in 5 seconds.");
                 } catch (e) {
                     console.error("Autoplay failed", e);
                 }
            };
          }
        } catch (err: any) {
          console.error("Camera Access Error:", err);
          stopCameraStream();
          speak("Could not access camera. Please check permissions.");
          vibrate(HapticPatterns.error);
          setState(prev => ({ ...prev, error: "Camera permission denied or unavailable." }));
          setIsCameraActive(false);
        }
      };

    if (isCameraActive && !streamRef.current) {
        initCamera();
    }
  }, [isCameraActive]);

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current) return;

    playAudioCue('capture');
    vibrate(HapticPatterns.heavyClick);
    speak("Analyzing image...");

    // Create a temporary canvas for capture
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext('2d');
    
    if (!context) return;

    context.drawImage(videoRef.current, 0, 0);

    // Get Data
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    const previewImage = canvas.toDataURL('image/jpeg', 0.8);
    
    // Stop camera immediately to save resources
    stopCamera();
    
    // Set Loading State
    setState(prev => ({ ...prev, image: previewImage, isAnalyzing: true, error: null }));

    // Haptic pulse loop
    const pulseInterval = setInterval(() => {
        vibrate(HapticPatterns.scan);
    }, 1200);

    try {
      const result = await analyzeImage(base64Image, VISION_SYSTEM_PROMPT);
      
      clearInterval(pulseInterval);
      playAudioCue('success');
      vibrate(HapticPatterns.success);
      
      // Auto-speak is now handled by a separate useEffect with delay
      setState(prev => ({ ...prev, analysis: result, isAnalyzing: false }));
      
    } catch (err: any) {
      clearInterval(pulseInterval);
      speak("Analysis failed. Please try again.");
      vibrate(HapticPatterns.error);
      setState(prev => ({ ...prev, error: "Failed to analyze image. Please check your connection.", isAnalyzing: false }));
    }
  }, [stopCamera]);

  // Auto-Capture Countdown Effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCameraActive && cameraReady && countdown !== null && countdown > 0) {
        timer = setTimeout(() => {
            setCountdown(prev => (prev !== null ? prev - 1 : null));
        }, 1000);
    } else if (isCameraActive && cameraReady && countdown === 0) {
        captureAndAnalyze();
        setCountdown(null);
    }
    return () => clearTimeout(timer);
  }, [isCameraActive, cameraReady, countdown, captureAndAnalyze]);

  // Auto-Read Result Effect (Immediate)
  useEffect(() => {
    // Only trigger if we have a result, we are NOT analyzing, and no error
    if (state.analysis && !state.isAnalyzing && !state.error) {
        speak(state.analysis!);
    }
  }, [state.analysis, state.isAnalyzing, state.error]);


  const startCamera = () => {
    stopSpeech();
    vibrate(HapticPatterns.heavyClick);
    playAudioCue('start');
    
    setState(prev => ({ ...prev, error: null, analysis: null, image: null }));
    setCameraReady(false);
    setCountdown(null);
    setIsCameraActive(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    vibrate(HapticPatterns.click);
    playAudioCue('capture');
    speak("Processing uploaded image...");
    
    if (isCameraActive) stopCamera();

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const cleanBase64 = base64String.split(',')[1];
      
      setState({ isAnalyzing: true, image: base64String, analysis: null, error: null });
      
      const pulseInterval = setInterval(() => { vibrate(HapticPatterns.scan); }, 1200);

      try {
        const result = await analyzeImage(cleanBase64, VISION_SYSTEM_PROMPT);
        
        clearInterval(pulseInterval);
        playAudioCue('success');
        vibrate(HapticPatterns.success);
        
        setState(prev => ({ ...prev, analysis: result, isAnalyzing: false }));
        // Speak handled by useEffect

      } catch (err: any) {
        clearInterval(pulseInterval);
        speak("Processing failed.");
        vibrate(HapticPatterns.error);
        setState(prev => ({ ...prev, error: "Failed to process file.", isAnalyzing: false }));
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input
    e.target.value = '';
  };

  const handleReset = () => {
      stopSpeech();
      vibrate(HapticPatterns.click);
      setState({ isAnalyzing: false, image: null, analysis: null, error: null });
      setIsCameraActive(false);
  };

  const handleReplay = () => {
    if (state.analysis) {
        vibrate(HapticPatterns.click);
        stopSpeech();
        speak(state.analysis);
    }
  };

  // --- Views ---

  // 1. Camera Active View
  if (isCameraActive) {
      return (
          <div className="absolute inset-0 bg-black flex flex-col z-50" aria-label="Camera Active">
              <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="flex-1 w-full h-full object-cover"
              />
              
              {/* Countdown Overlay */}
              {countdown !== null && countdown > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-[12rem] font-bold text-white/80 drop-shadow-lg animate-pulse">
                          {countdown}
                      </div>
                  </div>
              )}

              {/* Close Button */}
              <button 
                  onClick={stopCamera}
                  className="absolute top-6 right-6 bg-black/60 p-4 rounded-full text-white hover:bg-black/80 border border-white/20 backdrop-blur-md z-10"
                  aria-label="Close Camera"
              >
                  <X className="w-8 h-8" />
              </button>

              {/* Capture Controls */}
              <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 flex justify-center bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-32">
                  <button 
                      onClick={captureAndAnalyze}
                      className="group relative flex items-center justify-center"
                      aria-label="Capture Photo and Analyze Now"
                  >
                      <div className="absolute inset-0 bg-access-accent rounded-full opacity-30 group-hover:scale-125 transition-transform duration-300"></div>
                      <div className="relative w-24 h-24 bg-access-accent rounded-full border-[6px] border-white flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.6)] active:scale-95 transition-all transform">
                          <Camera className="w-10 h-10 text-access-dark" />
                      </div>
                  </button>
              </div>
          </div>
      );
  }

  // 2. Analyzing View
  if (state.isAnalyzing) {
      return (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-8 animate-pulse bg-slate-900" role="status" aria-live="polite">
               <div className="relative">
                   <div className="w-32 h-32 rounded-full border-4 border-slate-700 bg-slate-800"></div>
                   <div className="absolute inset-0 w-32 h-32 rounded-full border-4 border-access-accent border-t-transparent animate-spin"></div>
                   <Sparkles className="absolute inset-0 m-auto w-12 h-12 text-access-accent" />
               </div>
               <div>
                   <h3 className="text-3xl font-bold text-white mb-3">Analyzing...</h3>
                   <p className="text-slate-400 text-lg">Describing the scene for you.</p>
               </div>
          </div>
      );
  }

  // 3. Result / Error View
  if (state.analysis || state.error) {
      return (
          <div className="h-full flex flex-col relative bg-slate-900" role="region" aria-label="Analysis Results">
             <div className="flex-1 overflow-y-auto p-6 pb-32 scroll-smooth">
                 {/* Image Thumbnail */}
                 {state.image && (
                     <div className="w-full h-56 mb-6 rounded-3xl overflow-hidden relative border border-slate-700 shrink-0 bg-black">
                         <img src={state.image} className="w-full h-full object-contain opacity-80" alt="Captured scene" />
                     </div>
                 )}

                 {state.error ? (
                     <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-2xl flex flex-col items-center text-center gap-4" role="alert">
                         <AlertCircle className="w-12 h-12 text-red-400" />
                         <p className="text-xl text-red-200 font-medium">{state.error}</p>
                     </div>
                 ) : (
                     <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-700 pb-4">
                            <Sparkles className="w-6 h-6 text-access-accent" />
                            <h2 className="text-xl font-bold text-white tracking-wide">Analysis Result</h2>
                        </div>
                        <p className="text-2xl leading-relaxed text-slate-100 font-medium">
                            {state.analysis}
                        </p>
                     </div>
                 )}
             </div>

             {/* Bottom Controls */}
             <div className="absolute bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 p-6 flex items-center justify-between gap-4 z-20">
                 <button 
                    onClick={handleReset}
                    onMouseEnter={() => speak("Back")}
                    onFocus={() => speak("Back")}
                    className="flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white transition-colors border border-slate-700"
                    aria-label="Go Back to Camera"
                 >
                     <ChevronLeft className="w-6 h-6" />
                     <span className="font-bold text-sm uppercase tracking-wider">Back</span>
                 </button>
                 
                 {!state.error && (
                    <button 
                        onClick={handleReplay}
                        className="flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-access-accent hover:bg-yellow-300 text-access-dark shadow-lg shadow-yellow-500/20 transition-all active:scale-95"
                        aria-label="Replay Audio Description"
                    >
                        <Volume2 className="w-6 h-6" />
                        <span className="font-bold text-sm uppercase tracking-wider">Replay</span>
                    </button>
                 )}
             </div>
          </div>
      );
  }

  // 4. Idle / Default View
  return (
    <div className="h-full flex flex-col justify-center items-stretch space-y-6 px-2" role="main" aria-label="Vision Assistant Home">
       
       <button
          onClick={startCamera}
          onMouseEnter={() => speak("Tap to Scan")}
          onFocus={() => speak("Tap to Scan")}
          className="flex-1 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border-2 border-slate-700 hover:border-access-accent rounded-[2.5rem] flex flex-col items-center justify-center gap-8 transition-all group focus:outline-none focus:ring-4 focus:ring-access-accent/50 p-8"
          aria-label="Open Camera to Scan"
       >
           <div className="w-40 h-40 rounded-full bg-slate-900 flex items-center justify-center group-hover:scale-105 transition-transform shadow-2xl border-2 border-slate-700 group-hover:border-access-accent">
               <Camera className="w-20 h-20 text-access-accent" />
           </div>
           <div className="text-center space-y-3">
               <h2 className="text-4xl font-extrabold text-white tracking-tight">Tap to Scan</h2>
               <p className="text-slate-400 text-xl font-medium">Identify objects & read text</p>
           </div>
       </button>

       <div className="flex justify-center pb-4">
           <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 px-8 py-5 rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all text-lg font-medium active:scale-95"
              aria-label="Upload image from gallery"
           >
               <ImageIcon className="w-6 h-6" />
               <span>Upload from Gallery</span>
           </button>
       </div>
       
       <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleFileUpload} 
        aria-hidden="true"
       />
    </div>
  );
};

export default VisionAssistant;