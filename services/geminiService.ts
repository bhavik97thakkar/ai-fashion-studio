import { GoogleGenAI, Type } from "@google/genai";
import { GarmentAnalysis, SceneId, PhotoshootImage } from "../types";
import { SCENE_PRESETS } from "../constants";

// Updated to correct Gemini 3 models as per latest technical guidelines
const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  const data = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  return {
    inlineData: { data, mimeType: mimeType || "image/jpeg" },
  };
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
    if (
      error.message?.toLowerCase().includes("not found") ||
      error.message?.includes("404")
    ) {
      throw new Error("RESELECT_KEY");
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
    "Professional Studio";
  const results: PhotoshootImage[] = [];

  // Visual Consistency Anchor: We define the identity and environment once to be reused exactly for every pose
  const photoshootIdentity = `
        CONSISTENCY PROTOCOL:
        1. MODEL IDENTITY: Use the EXACT same person with identical facial features, hair style, and skin tone for every image.
        2. ENVIRONMENT: Use the EXACT same background setting, lighting setup, and color grading for every image.
        3. PRODUCT: The model must be wearing the garment shown in the reference image.
        
        SESSION SPECS:
        - Model: ${modelPrompt}
        - Setting: ${sceneDescription}
        - Garment: ${analysis.style} ${analysis.garmentType} in ${analysis.colorPalette.join(", ")}
    `;

  for (let i = 0; i < poses.length; i++) {
    onProgress(i + 1, poses.length);

    try {
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [
            fileToGenerativePart(garmentImage, "image/jpeg"),
            {
              text: `
                                ${photoshootIdentity}
                                CURRENT POSE: ${poses[i]}.
                                High-end professional fashion editorial photography, 8k resolution, photorealistic, sharp focus on fabric texture, magazine quality.
                            `.trim(),
            },
          ],
        },
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
        results.push({
          id: `img-${Date.now()}-${i}`,
          src: `data:image/png;base64,${imagePart.inlineData.data}`,
        });
      }
    } catch (error: any) {
      if (
        error.message?.toLowerCase().includes("not found") ||
        error.message?.includes("404")
      )
        throw new Error("RESELECT_KEY");
      console.error("Frame failed", error);
    }
  }
  return results;
};

export const editImage = async (
  base64Image: string,
  prompt: string,
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [
        fileToGenerativePart(base64Image, "image/jpeg"),
        {
          text: `Refine this fashion photograph: ${prompt}. Maintain model identity and background consistency.`,
        },
      ],
    },
  });
  const part = response.candidates?.[0]?.content?.parts.find(
    (p) => p.inlineData,
  );
  if (!part?.inlineData) throw new Error("Edit failed");
  return `data:image/png;base64,${part.inlineData.data}`;
};

export const generateImage = async (prompt: string): Promise<string> => {
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
};
