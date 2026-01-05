import { generateTTS } from './geminiService';
import { decodeAudioData, base64ToArrayBuffer } from './audioUtils';
import { vibrate, HapticPatterns } from './hapticService';

// Singleton Audio Context for Speech
let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

// Cache for short phrases to improve UI navigation latency (e.g. "Home", "Back")
const audioCache = new Map<string, AudioBuffer>();
const MAX_CACHE_SIZE = 20;

// Circuit breaker state
let isQuotaExhausted = false;

const initAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000 // Match Gemini TTS native output
    });
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// Fallback to browser synthesis if API fails or for short commands
const fallbackSpeak = (text: string) => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    const setVoice = (voices: SpeechSynthesisVoice[]) => {
         const preferredVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) 
                            || voices.find(v => v.lang.startsWith('en'))
                            || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;
    };

    const voices = window.speechSynthesis.getVoices();
    
    if (voices.length > 0) {
        setVoice(voices);
        utterance.rate = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
    } else {
         // Chrome loads voices asynchronously
         const onVoicesChanged = () => {
             const updatedVoices = window.speechSynthesis.getVoices();
             setVoice(updatedVoices);
             // Ensure properties are set
             utterance.rate = 1.0;
             utterance.volume = 1.0;
             window.speechSynthesis.speak(utterance);
             window.speechSynthesis.onvoiceschanged = null; // cleanup
         };
         
         window.speechSynthesis.onvoiceschanged = onVoicesChanged;
         
         // Timeout safety: if voices never load or take too long, speak anyway with default
         setTimeout(() => {
             // Check if we are already speaking to avoid double speak
             if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
                 window.speechSynthesis.speak(utterance);
             }
         }, 300);
    }
  }
};

export const stopSpeech = () => {
  if (currentSource) {
    try { currentSource.stop(); } catch (e) {}
    currentSource = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export const speak = async (text: string) => {
  if (!text) return;

  // Clean text
  const spokenText = text
      .replace(/[*#_`]/g, '')
      .replace(/\[.*?\]/g, '')
      .trim();

  if (!spokenText) return;

  stopSpeech();

  // STRATEGY: 
  // 1. If quota exhausted, use system voice.
  // 2. If text is short (UI navigation), use system voice to save quota and reduce latency.
  // 3. If cached, use cache.
  // 4. Otherwise, try Gemini TTS.

  const isShortCommand = spokenText.length < 30; // "Back", "Home", "Vision Assistant" etc.
  
  if (isQuotaExhausted) {
    fallbackSpeak(spokenText);
    return;
  }

  // Use system voice for short UI labels unless we already have it cached
  if (isShortCommand && !audioCache.has(spokenText)) {
      fallbackSpeak(spokenText);
      return;
  }

  try {
    const ctx = initAudioContext();
    
    // Check Cache
    if (audioCache.has(spokenText)) {
      playBuffer(audioCache.get(spokenText)!, ctx);
      return;
    }

    // Call Gemini TTS
    const base64Audio = await generateTTS(spokenText);
    const arrayBuffer = base64ToArrayBuffer(base64Audio);
    
    // Use the manual decode helper from audioUtils which handles raw PCM well
    const audioBuffer = await decodeAudioData(
      new Uint8Array(arrayBuffer),
      ctx,
      24000, 
      1 
    );

    // Cache logic
    if (spokenText.length < 100) {
      if (audioCache.size >= MAX_CACHE_SIZE) {
        const firstKey = audioCache.keys().next().value;
        if (firstKey) audioCache.delete(firstKey);
      }
      audioCache.set(spokenText, audioBuffer);
    }

    playBuffer(audioBuffer, ctx);

  } catch (err: any) {
    console.warn("Gemini TTS attempt failed:", err);
    
    // Check for 429 Quota Exceeded error
    const errString = JSON.stringify(err);
    if (errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED') || err.message?.includes('quota')) {
        console.error("Gemini TTS Quota Exhausted. Switching to system voice fallback.");
        isQuotaExhausted = true;
    }

    fallbackSpeak(spokenText);
  }
};

const playBuffer = (buffer: AudioBuffer, ctx: AudioContext) => {
  stopSpeech(); // Ensure clean slate
  
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  currentSource = source;
  
  // Haptic tick when speech actually starts
  vibrate(HapticPatterns.click);
  
  source.onended = () => {
    if (currentSource === source) {
      currentSource = null;
    }
  };
};