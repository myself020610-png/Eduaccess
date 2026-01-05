import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, BookOpen, AlertCircle, FileText, Loader2 } from 'lucide-react';
import Button from './Button';
import { Gemini3ContinuousSession, transcribeAudio } from '../services/geminiService';
import { ChatMessage } from '../types';
import { vibrate, HapticPatterns } from '../services/hapticService';
import { HEARING_TRANSCRIPT_PROMPT } from '../constants';

type TranscriptType = 'STREAMING' | 'BATCH';

const HearingAssistant: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcriptType, setTranscriptType] = useState<TranscriptType>('STREAMING');
  const [volume, setVolume] = useState(0);
  
  // Use the new Gemini 3 Continuous Session
  const sessionRef = useRef<Gemini3ContinuousSession | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Batch Recording Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
         mediaRecorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isRecording, isProcessingBatch]);

  // Main Toggle Function
  const handleToggleAction = async () => {
    vibrate(HapticPatterns.heavyClick);
    
    if (isRecording) {
        // STOP logic
        if (transcriptType === 'BATCH') {
            stopBatchRecording();
        } else {
            stopStreamingSession();
        }
    } else {
        // START logic
        setError(null);
        if (transcriptType === 'BATCH') {
            startBatchRecording();
        } else {
            startStreamingSession();
        }
    }
  };

  // --- Streaming Logic (Gemini 3 Continuous) ---
  const startStreamingSession = async () => {
      setMessages([]); // Clear previous session on new start
      setIsRecording(true);
      
      sessionRef.current = new Gemini3ContinuousSession();
      
      await sessionRef.current.connect(
        HEARING_TRANSCRIPT_PROMPT,
        (text) => {
          setMessages(prev => [...prev, {
             role: 'model',
             content: text,
             timestamp: Date.now(),
             type: 'transcript'
          }]);
        },
        (level) => {
            setVolume(level);
        },
        (err) => {
            setError(err);
            vibrate(HapticPatterns.error);
            setIsRecording(false);
            setVolume(0);
        }
      );
  };

  const stopStreamingSession = () => {
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      setIsRecording(false);
      setVolume(0);
  };

  // --- Batch Logic (Gemini 3 Flash) ---
  const startBatchRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Determine supported mime type
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            setIsProcessingBatch(true);
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            
            // Convert to base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64Audio = (reader.result as string).split(',')[1];
                try {
                    const result = await transcribeAudio(base64Audio, mimeType, HEARING_TRANSCRIPT_PROMPT);
                    setMessages(prev => [...prev, {
                        role: 'model',
                        content: result,
                        timestamp: Date.now(),
                        type: 'transcript'
                    }]);
                    vibrate(HapticPatterns.success);
                } catch(e: any) {
                    setError("Transcription failed: " + e.message);
                    vibrate(HapticPatterns.error);
                } finally {
                    setIsProcessingBatch(false);
                }
            }
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
        // Fake volume for visualizer in batch mode
        setVolume(50); 
    } catch (e: any) {
        setError("Microphone access failed: " + e.message);
        setIsRecording(false);
    }
  };

  const stopBatchRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          setVolume(0);
      }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header with Visualizer */}
      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 relative overflow-hidden transition-colors">
        {/* Visualizer Background */}
        <div 
            className="absolute bottom-0 left-0 h-1 bg-access-info transition-all duration-100 ease-out z-10 opacity-70"
            style={{ width: `${Math.min(100, volume)}%` }}
        ></div>
        
        <div className="relative z-20 flex justify-between items-start">
             <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <BookOpen className="w-8 h-8 text-access-info" />
                Transcription
                </h2>
                <p className="text-slate-400 mt-1 text-sm">
                    {transcriptType === 'STREAMING' ? 'Real-time Captioning' : 'High-Precision Batch Audio'}
                </p>
            </div>
            {/* Visualizer Circle Indicator */}
            {isRecording && (
                <div className="flex flex-col items-center gap-1">
                    <div 
                        className={`w-4 h-4 rounded-full transition-all duration-75 ${volume > 5 ? 'bg-access-info shadow-[0_0_10px_#3b82f6]' : 'bg-slate-600'}`}
                        style={{ transform: `scale(${1 + volume/100})` }}
                    ></div>
                    <span className="text-[10px] text-slate-500 uppercase">MIC</span>
                </div>
            )}
        </div>
      </div>

      {/* Mode Toggles */}
      <div className="flex items-center gap-2 justify-center py-1 bg-slate-900/50 p-2 rounded-xl border border-slate-700">
         <button
            onClick={() => setTranscriptType('STREAMING')}
            disabled={isRecording}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold border transition-all ${
                transcriptType === 'STREAMING' 
                ? 'bg-access-info/20 text-access-info border-access-info shadow-sm' 
                : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800 hover:text-slate-300'
            }`}
         >
            Live Stream
         </button>
         <button
            onClick={() => setTranscriptType('BATCH')}
            disabled={isRecording}
            className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold border transition-all ${
                transcriptType === 'BATCH' 
                ? 'bg-access-info/20 text-access-info border-access-info shadow-sm' 
                : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-800 hover:text-slate-300'
            }`}
         >
            Record Segment
         </button>
      </div>

      {/* Transcript Area */}
      <div 
        ref={scrollRef}
        className="flex-1 bg-black rounded-2xl border-2 border-slate-700 p-4 overflow-y-auto space-y-4 scroll-smooth relative"
      >
        {messages.length === 0 && !isRecording && !isProcessingBatch && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-8 gap-4">
             <div className="bg-slate-900 p-4 rounded-full">
                <MicOff className="w-8 h-8 opacity-50" />
             </div>
            <div>
                <p className="text-lg font-bold text-slate-400 mb-2">Ready to Transcribe</p>
                <p className="text-sm max-w-xs mx-auto text-slate-500">
                    {transcriptType === 'STREAMING' 
                        ? 'I will provide a word-for-word real-time transcription using Gemini 3 Flash.'
                        : 'I will record a segment and provide a high-precision transcription using Gemini 3.'}
                </p>
            </div>
          </div>
        )}

        {/* Processing State for Batch */}
        {isProcessingBatch && (
           <div className="flex flex-col items-center justify-center py-8 gap-3 text-access-info animate-pulse">
               <Loader2 className="w-8 h-8 animate-spin" />
               <span className="font-bold tracking-wider text-sm uppercase">Transcribing Audio...</span>
           </div>
        )}

        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex flex-col ${msg.role === 'model' ? 'items-stretch' : 'items-start opacity-60'}`}
          >
            <div 
              className={`rounded-2xl p-5 ${
                msg.role === 'model' 
                  ? 'bg-slate-900 border-l-4 border-slate-700 text-white shadow-lg' 
                  : 'bg-slate-900/50 border border-slate-800 text-slate-500 text-sm max-w-[80%]'
              }`}
            >
              {msg.role === 'model' && (
                  <div className="text-xs uppercase font-bold tracking-widest mb-3 opacity-50 flex items-center gap-2 border-b border-slate-700 pb-2">
                    <div className="w-2 h-2 rounded-full bg-access-info"></div>
                    Transcript
                  </div>
              )}
              
              <div className="text-lg leading-relaxed whitespace-pre-wrap">
                 {msg.content}
              </div>
            </div>
          </div>
        ))}
        
        {isRecording && (
           <div className="sticky bottom-0 left-0 right-0 flex justify-center pb-2 pointer-events-none">
                <div className={`backdrop-blur-md px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg border animate-pulse ${
                    transcriptType === 'BATCH' 
                    ? 'bg-blue-900/80 text-blue-200 border-blue-500/30'
                    : 'bg-red-900/80 text-red-200 border-red-500/30'
                }`}>
                    <div className={`w-2 h-2 rounded-full ${
                         transcriptType === 'BATCH' ? 'bg-blue-500' : 'bg-red-500'
                    }`}></div>
                    {transcriptType === 'BATCH' ? 'Recording Segment...' : 'Listening...'}
                </div>
           </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500 rounded-xl flex items-center gap-3 text-red-300">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Controls */}
      <Button 
        label={
            isRecording 
              ? (transcriptType === 'BATCH' ? "Stop & Transcribe" : "Stop Transcription") 
              : (transcriptType === 'BATCH' ? "Record Segment" : "Start Transcription")
        }
        onClick={handleToggleAction}
        disabled={isProcessingBatch}
        variant={isRecording ? "danger" : "primary"}
        icon={isProcessingBatch ? <Loader2 className="animate-spin"/> : (isRecording ? <MicOff /> : <Mic />)}
        className="w-full"
      />
    </div>
  );
};

export default HearingAssistant;