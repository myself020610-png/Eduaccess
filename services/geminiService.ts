import { GoogleGenAI } from "@google/genai";

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