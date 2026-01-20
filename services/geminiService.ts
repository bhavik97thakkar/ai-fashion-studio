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
            text: "Analyze garment for photoshoot. JSON: {garmentType, fabric, colorPalette:[], style, gender:'Male'|'Female'|'Unisex', uniquenessLevel:'Unique'|'Common'}",
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
    "Professional fashion studio background";
  const results: PhotoshootImage[] = [];

  // Concise, high-impact instructions for faster generation
  const baseSystemPrompt = `
        Professional high-end fashion photography. 
        Subject: ${modelPrompt}. 
        Setting: ${sceneDescription}. 
        Apparel: The specific ${analysis.style} ${analysis.garmentType} provided in reference.
        Style: Commercial, 8k resolution, photorealistic, cinematic lighting.
    `;

  let masterReferenceB64: string | null = null;

  for (let i = 0; i < poses.length; i++) {
    onProgress(i + 1, poses.length);

    try {
      const parts: any[] = [fileToGenerativePart(garmentImage, "image/jpeg")];

      let promptText = "";

      if (i === 0) {
        promptText = `${baseSystemPrompt} Pose: ${poses[i]}. Keep garment details sharp and accurate.`;
      } else if (masterReferenceB64) {
        // Pass previous result to maintain character/background consistency
        parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
        promptText = `${baseSystemPrompt} Pose: ${poses[i]}. MAINTAIN SAME MODEL FACE AND LIGHTING as the reference.`;
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

        // Track first result for consistency across poses
        if (i === 0) masterReferenceB64 = b64;
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
            text: `Apply fashion edit: ${prompt}. Keep model identity and background identical.`,
          },
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
      config: {
        imageConfig: { aspectRatio: "3:4", imageSize: "1K" },
      },
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
