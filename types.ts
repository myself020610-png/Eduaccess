export enum AppMode {
  HOME = 'HOME',
  VISION = 'VISION',
  HEARING = 'HEARING'
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
  type?: 'transcript' | 'summary' | 'analysis';
}

export interface AudioSessionState {
  isConnected: boolean;
  isRecording: boolean;
  error: string | null;
}

export interface VisionState {
  isAnalyzing: boolean;
  image: string | null;
  analysis: string | null;
  error: string | null;
}
