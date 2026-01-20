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

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
  if (
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("deadline")
  ) {
    return "RETRY";
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
            text: "Analyze this garment for a professional photoshoot. Return JSON: {garmentType, fabric, colorPalette:[], style, gender:'Male'|'Female'|'Unisex', uniquenessLevel:'Unique'|'Common'}",
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
    const action = handleGeminiError(error);
    if (action === "RETRY") {
      await delay(2000);
      return analyzeGarment(base64Image);
    }
    throw error;
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

  const baseSystemPrompt = `
        High-end commercial fashion photography. 
        Model: ${modelPrompt}. 
        Set: ${sceneDescription}. 
        Garment: A ${analysis.style} ${analysis.garmentType} in ${analysis.colorPalette.join(", ")}.
        Quality: 8k resolution, cinematic lighting, sharp focus on garment texture.
    `;

  let masterReferenceB64: string | null = null;

  for (let i = 0; i < poses.length; i++) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      onProgress(i + 1, poses.length);
      try {
        const parts: any[] = [fileToGenerativePart(garmentImage, "image/jpeg")];
        let promptText = "";

        if (i === 0) {
          promptText = `${baseSystemPrompt} Pose: ${poses[i]}. Focus on high-fidelity facial features and fabric details.`;
        } else if (masterReferenceB64) {
          parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
          promptText = `${baseSystemPrompt} Pose: ${poses[i]}. CLONE MODEL IDENTITY AND LIGHTING from reference image.`;
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
        if (imagePart?.inlineData) {
          const b64 = imagePart.inlineData.data;
          results.push({
            id: `img-${Date.now()}-${i}`,
            src: `data:image/png;base64,${b64}`,
          });
          if (i === 0) masterReferenceB64 = b64;
          break;
        }
        throw new Error("Empty response");
      } catch (error: any) {
        const action = handleGeminiError(error);
        if (action === "RETRY") {
          attempts++;
          await delay(1000 * Math.pow(2, attempts));
        } else {
          throw error;
        }
      }
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
            text: `Fashion Refinement: ${prompt}. Maintain model face and environment.`,
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
    throw error;
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
    throw error;
  }
};
