import { GoogleGenAI, Type } from "@google/genai";
import { GarmentAnalysis, SceneId, PhotoshootImage } from "../types";
import { SCENE_PRESETS } from "../constants";

const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  // Clean base64 data to prevent corruption or unnecessary overhead
  const data = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  return {
    inlineData: { data, mimeType: mimeType || "image/jpeg" },
  };
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const isRetryableError = (error: any): boolean => {
  const msg = error.message?.toLowerCase() || "";
  const status = error.status || 0;
  return (
    status === 503 ||
    status === 429 ||
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("deadline") ||
    msg.includes("resource exhausted") ||
    msg.includes("service unavailable")
  );
};

const handleGeminiError = (error: any) => {
  const msg = error.message?.toLowerCase() || "";
  if (
    msg.includes("not found") ||
    msg.includes("404") ||
    msg.includes("api_key") ||
    msg.includes("invalid")
  ) {
    throw new Error("RESELECT_KEY");
  }
  throw error;
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isRetryableError(error) && i < maxRetries - 1) {
        const waitTime = Math.min(10000, 2000 * Math.pow(2, i));
        console.warn(
          `Gemini 503/Retryable error. Retrying in ${waitTime}ms...`,
          error,
        );
        await delay(waitTime);
        continue;
      }
      throw handleGeminiError(error);
    }
  }
  throw lastError;
}

export const analyzeGarment = async (
  base64Image: string,
): Promise<GarmentAnalysis> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [
          {
            text: "JSON ONLY. Analyze garment: {garmentType, fabric, colorPalette:[], style, gender:'Male'|'Female'|'Unisex', uniquenessLevel:'Unique'|'Common'}",
          },
          imagePart,
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            garmentType: { type: Type.STRING },
            fabric: { type: Type.STRING },
            colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
            style: { type: Type.STRING },
            gender: { type: Type.STRING },
            uniquenessLevel: { type: Type.STRING },
          },
          required: [
            "garmentType",
            "fabric",
            "colorPalette",
            "style",
            "gender",
            "uniquenessLevel",
          ],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  });
};

export const generatePhotoshoot = async (
  garmentImage: string,
  analysis: GarmentAnalysis,
  sceneId: SceneId,
  modelPrompt: string,
  poses: string[],
  onProgress: (index: number, total: number, isRetrying?: boolean) => void,
): Promise<PhotoshootImage[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const scenePreset = SCENE_PRESETS.find((s) => s.id === sceneId);
  const sceneDescription =
    scenePreset?.description || "High-end fashion studio";
  const results: PhotoshootImage[] = [];

  const baseSystemPrompt = `Commercial fashion photography. ${modelPrompt}. Background: ${sceneDescription}. Garment: ${analysis.colorPalette[0]} ${analysis.garmentType}. 8k, photorealistic.`;

  let masterReferenceB64: string | null = null;

  for (let i = 0; i < poses.length; i++) {
    const image = await withRetry(async () => {
      onProgress(i + 1, poses.length, false);

      const parts: any[] = [fileToGenerativePart(garmentImage, "image/jpeg")];
      let promptText = "";

      if (i === 0 || !masterReferenceB64) {
        promptText = `${baseSystemPrompt} Pose: ${poses[i]}.`;
      } else {
        parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
        promptText = `${baseSystemPrompt} Pose: ${poses[i]}. MATCH MODEL IDENTITY FROM REFERENCE.`;
      }

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: { parts },
        config: {
          imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts.find(
        (p) => p.inlineData,
      );
      if (!imagePart?.inlineData)
        throw new Error("503: Model returned no image data.");

      const b64 = imagePart.inlineData.data;
      if (i === 0) masterReferenceB64 = b64;

      return {
        id: `img-${Date.now()}-${i}`,
        src: `data:image/png;base64,${b64}`,
      };
    });
    results.push(image);
  }
  return results;
};

export const editImage = async (
  base64Image: string,
  prompt: string,
): Promise<string> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          fileToGenerativePart(base64Image, "image/jpeg"),
          { text: `Refine: ${prompt}.` },
        ],
      },
      config: {
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
      },
    });
    const part = response.candidates?.[0]?.content?.parts.find(
      (p) => p.inlineData,
    );
    if (!part?.inlineData) throw new Error("Edit failed");
    return `data:image/png;base64,${part.inlineData.data}`;
  });
};

export const generateImage = async (prompt: string): Promise<string> => {
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: {
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
      },
    });
    const part = response.candidates?.[0]?.content?.parts.find(
      (p) => p.inlineData,
    );
    if (!part?.inlineData) throw new Error("Generation failed");
    return `data:image/png;base64,${part.inlineData.data}`;
  });
};
