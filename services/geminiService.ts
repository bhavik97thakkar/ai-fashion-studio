import { GoogleGenAI, Type } from "@google/genai";
import { GarmentAnalysis, SceneId, PhotoshootImage } from "../types";
import { SCENE_PRESETS } from "../constants";

const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  const data = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  return {
    inlineData: { data, mimeType: mimeType || "image/jpeg" },
  };
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

export const analyzeGarment = async (
  base64Image: string,
): Promise<GarmentAnalysis> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: {
        parts: [
          {
            text: "Analyze this garment and return JSON: {garmentType, fabric, colorPalette:[], style, gender:'Male'|'Female'|'Unisex', uniquenessLevel:'Unique'|'Common'}",
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
  } catch (error: any) {
    return handleGeminiError(error);
  }
};

export const generatePhotoshoot = async (
  garmentImage: string,
  analysis: GarmentAnalysis,
  sceneId: SceneId,
  modelPrompt: string,
  poses: string[],
  onProgress: (index: number, total: number) => void,
): Promise<PhotoshootImage[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const sceneDescription =
    SCENE_PRESETS.find((s) => s.id === sceneId)?.description ||
    "Professional Studio";
  const results: PhotoshootImage[] = [];

  const baseSystemPrompt = `
        HIGH-END FASHION EDITORIAL. 
        Model characteristics: ${modelPrompt}. 
        Setting: ${sceneDescription}. 
        Product: ${analysis.style} ${analysis.garmentType} in ${analysis.colorPalette.join(", ")}.
        Photography style: Photorealistic, 8k, sharp focus, magazine quality, consistent lighting.
    `;

  let masterReferenceB64: string | null = null;

  for (let i = 0; i < poses.length; i++) {
    onProgress(i + 1, poses.length);

    try {
      const parts: any[] = [fileToGenerativePart(garmentImage, "image/jpeg")];

      let promptText = "";

      if (i === 0) {
        promptText = `
                    ${baseSystemPrompt}
                    ACTION: Full body fashion shot, ${poses[i]}.
                    IMPORTANT: This is the reference frame. Create a distinct, high-quality model face and environment.
                `.trim();
      } else if (masterReferenceB64) {
        parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
        promptText = `
                    ${baseSystemPrompt}
                    STRICT CHARACTER AND ENVIRONMENT LOCK:
                    1. CLONE THE MODEL: Use the EXACT SAME face, features, hairstyle, and skin tone as seen in the second reference image.
                    2. CLONE THE BACKGROUND: Use the EXACT SAME background, props, and lighting conditions as the second reference image.
                    3. CHANGE ONLY THE POSE: The model is now in this specific pose: ${poses[i]}.
                    Everything else must remain identical to maintain professional catalog consistency.
                `.trim();
      }

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "3:4",
            imageSize: "1K",
          },
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts.find(
        (p) => p.inlineData,
      );
      if (imagePart?.inlineData) {
        const b64 = imagePart.inlineData.data;
        results.push({
          id: `img-${Date.now()}-${i}`,
          src: `data:image/png;base64,${b64}`,
        });

        if (i === 0) {
          masterReferenceB64 = b64;
        }
      }
    } catch (error: any) {
      return handleGeminiError(error);
    }
  }
  return results;
};

export const editImage = async (
  base64Image: string,
  prompt: string,
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          fileToGenerativePart(base64Image, "image/jpeg"),
          {
            text: `Refine this fashion photograph: ${prompt}. Maintain strict model identity and background consistency.`,
          },
        ],
      },
    });
    const part = response.candidates?.[0]?.content?.parts.find(
      (p) => p.inlineData,
    );
    if (!part?.inlineData) throw new Error("Edit failed");
    return `data:image/png;base64,${part.inlineData.data}`;
  } catch (error: any) {
    return handleGeminiError(error);
  }
};

export const generateImage = async (prompt: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
    });
    const part = response.candidates?.[0]?.content?.parts.find(
      (p) => p.inlineData,
    );
    if (!part?.inlineData) throw new Error("Generation failed");
    return `data:image/png;base64,${part.inlineData.data}`;
  } catch (error: any) {
    return handleGeminiError(error);
  }
};
