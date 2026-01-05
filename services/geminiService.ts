import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { float32ToPCM16, arrayBufferToBase64, decodeAudioData, base64ToArrayBuffer, downsampleTo16k, createWavHeader } from "./audioUtils";

// Vision Analysis using gemini-3-flash-preview
export const analyzeImage = async (base64Image: string, systemInstruction: string, userPrompt?: string): Promise<string> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: userPrompt || "Analyze this image according to your operational guidelines."
          }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
      }
    });
    
    return response.text || "No description generated.";
  } catch (error: any) {
    console.error("Gemini Vision Error:", error);
    throw new Error(error.message || "Failed to analyze image");
  }
};

// Audio Transcription using gemini-3-flash-preview
export const transcribeAudio = async (base64Audio: string, mimeType: string, prompt?: string): Promise<string> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: prompt || "Please provide an accurate, verbatim transcription of this audio. Do not summarize. Identify speakers if possible."
          }
        ]
      }
    });
    
    return response.text || "No transcription generated.";
  } catch (error: any) {
    console.error("Gemini Transcription Error:", error);
    throw new Error(error.message || "Failed to transcribe audio");
  }
};

// Text-to-Speech using gemini-2.5-flash-preview-tts
export const generateTTS = async (text: string): Promise<string> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    // We add a prefix "Read this text: " to ensure the model acts as a TTS engine 
    // and doesn't try to answer the text if it looks like a question.
    // We also use string literal 'AUDIO' to avoid Enum transpilation issues.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{
        role: "user",
        parts: [{ text: `Read this text: ${text}` }]
      }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        // Fallback: Check if model returned text error
        const textError = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textError) console.warn("Model returned text instead of audio:", textError);
        throw new Error("No audio data returned from Gemini TTS");
    }
    
    return base64Audio;
  } catch (error: any) {
    const errStr = JSON.stringify(error);
    if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
        console.warn("Gemini TTS Rate Limit Hit (429).");
    } else {
        console.error("Gemini TTS Error:", error);
    }
    throw error;
  }
};

// Continuous Transcription Session using Gemini 3 Flash (Simulated Live)
export class Gemini3ContinuousSession {
  private audioContext: AudioContext | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private isConnected = false;
  private buffer: Float32Array[] = [];
  private bufferLength = 0;
  private isProcessing = false;

  constructor() {
     if (!process.env.API_KEY) throw new Error("API Key missing");
  }

  async connect(
    prompt: string,
    onTranscript: (text: string) => void,
    onVolume: (level: number) => void,
    onError: (error: string) => void
  ) {
    try {
        this.isConnected = true;
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.inputProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        let silenceStart = Date.now();

        this.inputProcessor.onaudioprocess = async (e) => {
            if (!this.isConnected) return;
            const inputData = e.inputBuffer.getChannelData(0);

            // Volume Calculation
            let sum = 0;
            for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
            const rms = Math.sqrt(sum/inputData.length) * 400;
            onVolume(Math.min(100, rms));

            // Buffering
            const copy = new Float32Array(inputData);
            this.buffer.push(copy);
            this.bufferLength += copy.length;

            const isSilent = rms < 5;
            if (!isSilent) silenceStart = Date.now();

            const duration = this.bufferLength / (this.audioContext?.sampleRate || 16000);
            const silenceDuration = Date.now() - silenceStart;

            // Trigger Logic: 
            // More aggressive timing for better real-time feel
            // Send if buffer is > 4s (force flush)
            // OR if buffer > 0.8s AND silence > 400ms (natural pause)
            if (!this.isProcessing && (duration > 4 || (duration > 0.8 && silenceDuration > 400))) {
                this.processBuffer(prompt, onTranscript, onError);
            }
        };

        source.connect(this.inputProcessor);
        this.inputProcessor.connect(this.audioContext.destination);

    } catch (e: any) {
        console.error("Gemini 3 Session Error:", e);
        this.isConnected = false;
        onError(e.message || "Failed to start continuous session");
        this.disconnect();
    }
  }

  private async processBuffer(prompt: string, onTranscript: (t:string)=>void, onError: (e:string)=>void) {
    if (this.buffer.length === 0) return;
    
    this.isProcessing = true;
    const currentBuffer = this.buffer;
    this.buffer = [];
    this.bufferLength = 0;

    try {
        // Flatten
        const totalLen = currentBuffer.reduce((acc, c) => acc + c.length, 0);
        const fullFloat = new Float32Array(totalLen);
        let offset = 0;
        for(const chunk of currentBuffer) {
            fullFloat.set(chunk, offset);
            offset += chunk.length;
        }

        // Downsample & Encode
        const sampleRate = this.audioContext?.sampleRate || 16000;
        const downsampled = downsampleTo16k(fullFloat, sampleRate);
        const pcm16 = float32ToPCM16(downsampled); // This gives us raw PCM ArrayBuffer

        // Wrap in WAV container
        const wavHeader = createWavHeader(16000, 1, pcm16.byteLength);
        const wavFile = new Uint8Array(wavHeader.byteLength + pcm16.byteLength);
        wavFile.set(new Uint8Array(wavHeader), 0);
        wavFile.set(new Uint8Array(pcm16), wavHeader.byteLength);

        const base64 = arrayBufferToBase64(wavFile.buffer);

        // API Call with audio/wav mime type
        const text = await transcribeAudio(base64, 'audio/wav', prompt);
        
        // Filter empty/hallucinated responses
        if (text && text.trim().length > 0 && text !== "No transcription generated.") {
            onTranscript(text);
        }
    } catch(e: any) {
        console.warn("Chunk processing failed:", e);
        // Don't kill session on one chunk fail, just log
    } finally {
        this.isProcessing = false;
    }
  }

  disconnect() {
      this.isConnected = false;
      this.buffer = [];
      
      if (this.mediaStream) {
          this.mediaStream.getTracks().forEach(t => t.stop());
          this.mediaStream = null;
      }
      if (this.inputProcessor) {
          try { this.inputProcessor.disconnect(); } catch(e) {}
          this.inputProcessor = null;
      }
      if (this.audioContext) {
          try { this.audioContext.close(); } catch(e) {}
          this.audioContext = null;
      }
  }
}

// Live Audio Session using gemini-2.5-flash-native-audio-preview-09-2025
export class LiveAudioSession {
  private ai: GoogleGenAI;
  private audioContext: AudioContext | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private session: any = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources: Set<AudioBufferSourceNode> = new Set();
  private isConnected = false;
  
  // Silence Detection
  private lastSpeechTime = 0;
  private silenceTriggered = false;
  
  constructor() {
    if (!process.env.API_KEY) throw new Error("API Key missing");
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(
    systemInstruction: string,
    onTranscript: (text: string, isUser: boolean) => void,
    onVolume: (level: number) => void,
    onError: (error: string) => void,
    onSilence?: () => void
  ) {
    try {
      this.isConnected = false;
      this.lastSpeechTime = Date.now();
      this.silenceTriggered = false;

      // Attempt to set 16kHz, but browser might override (e.g. to 44.1k or 48k)
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Ensure contexts are running
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            this.isConnected = true;
            this.startAudioInput(sessionPromise, onVolume, onSilence);
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              onTranscript(message.serverContent.inputTranscription.text, true);
            }
            if (message.serverContent?.outputTranscription) {
              onTranscript(message.serverContent.outputTranscription.text, false);
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && this.outputAudioContext) {
                this.playAudioChunk(base64Audio);
            }
            
            // Handle Interruption
            if (message.serverContent?.interrupted) {
                this.stopAudioOutput();
            }
          },
          onclose: () => {
            console.log("Gemini Live Session Closed");
            this.isConnected = false;
          },
          onerror: (err) => {
            console.error("Gemini Live Error:", err);
            this.isConnected = false;
            
            if (err.toString().includes("Network error") || err.toString().includes("Failed to fetch")) {
                onError("Network error: Please check your connection.");
            } else {
                onError("Connection error occurred.");
            }
            this.disconnect();
          }
        },
        config: {
            responseModalities: [Modality.AUDIO], 
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            systemInstruction: systemInstruction,
            inputAudioTranscription: {}, 
            outputAudioTranscription: {}, 
        }
      });
      
      this.session = await sessionPromise;

    } catch (e: any) {
      console.error("Connect Exception:", e);
      this.isConnected = false;
      onError(e.message || "Failed to start live session");
      this.disconnect();
    }
  }

  private startAudioInput(
    sessionPromise: Promise<any>, 
    onVolume: (level: number) => void,
    onSilence?: () => void
  ) {
    if (!this.audioContext || !this.mediaStream) return;

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.inputProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.inputProcessor.onaudioprocess = (e) => {
      // 1. Critical Check: Do not process if we are not connected
      if (!this.isConnected) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate Volume (RMS) for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length) * 400; // Scaled roughly 0-100
      onVolume(Math.min(100, rms));

      // Silence Detection Logic (3 seconds)
      if (rms > 5) { // Threshold for "speaking"
          this.lastSpeechTime = Date.now();
          this.silenceTriggered = false;
      } else {
          // If silent for > 3s and haven't triggered yet
          if (!this.silenceTriggered && (Date.now() - this.lastSpeechTime > 3000)) {
              this.silenceTriggered = true;
              if (onSilence) onSilence();
          }
      }

      // Handle Downsampling
      const currentRate = this.audioContext?.sampleRate || 16000;
      let pcm16Buffer;
      
      if (currentRate !== 16000) {
        const downsampledData = downsampleTo16k(inputData, currentRate);
        pcm16Buffer = float32ToPCM16(downsampledData);
      } else {
        pcm16Buffer = float32ToPCM16(inputData);
      }
      
      const base64Data = arrayBufferToBase64(pcm16Buffer);

      // 2. Critical Check: Ensure session promise resolves and we are STILL connected before sending
      sessionPromise.then(session => {
         if (!this.isConnected) return;
         try {
            session.sendRealtimeInput({
                media: {
                    mimeType: 'audio/pcm;rate=16000', // Always 16k after downsampling
                    data: base64Data
                }
            });
         } catch(err) {
             console.warn("Failed to send audio input", err);
         }
      });
    };

    source.connect(this.inputProcessor);
    this.inputProcessor.connect(this.audioContext.destination);
  }

  private async playAudioChunk(base64Audio: string) {
     if (!this.outputAudioContext) return;
     
     try {
        const audioBuffer = await decodeAudioData(
            new Uint8Array(base64ToArrayBuffer(base64Audio)),
            this.outputAudioContext,
            24000,
            1
        );
        
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputAudioContext.destination);
        source.addEventListener('ended', () => {
            this.sources.delete(source);
        });
        
        this.nextStartTime = Math.max(this.outputAudioContext.currentTime, this.nextStartTime);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
     } catch (e) {
         console.error("Audio decode error", e);
     }
  }
  
  private stopAudioOutput() {
      this.sources.forEach(source => {
          try { source.stop(); } catch(e) {}
      });
      this.sources.clear();
      this.nextStartTime = 0;
  }

  disconnect() {
    this.isConnected = false;
    this.stopAudioOutput();
    
    if (this.session) {
      try {
          if (typeof this.session.close === 'function') {
             this.session.close();
          }
      } catch (e) {
          console.warn("Error closing session:", e);
      }
      this.session = null;
    }
    
    if (this.inputProcessor) {
      try { this.inputProcessor.disconnect(); } catch (e) {}
      this.inputProcessor = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      try { this.audioContext.close(); } catch(e) {}
      this.audioContext = null;
    }
    
    if (this.outputAudioContext) {
        try { this.outputAudioContext.close(); } catch(e) {}
        this.outputAudioContext = null;
    }
  }
}