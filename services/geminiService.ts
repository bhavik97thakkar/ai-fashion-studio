import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GarmentAnalysis, SceneId, PhotoshootImage } from "../types";
import { SCENE_PRESETS } from "../constants";

// Professional tier models
const TEXT_MODEL = "gemini-3-pro-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";
const BASIC_IMAGE_MODEL = "gemini-2.5-flash-image";

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
            text: "Act as a world-class fashion director. Analyze this garment and return JSON according to the schema.",
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
            gender: { type: Type.STRING, enum: ["Male", "Female", "Unisex"] },
            uniquenessLevel: { type: Type.STRING, enum: ["Unique", "Common"] },
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
    if (error.message?.includes("Requested entity was not found"))
      throw new Error("RESELECT_KEY");
    throw error;
  }
};

/**
 * Generates a standard image from a prompt using gemini-2.5-flash-image.
 */
export const generateImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: BASIC_IMAGE_MODEL,
    contents: prompt,
  });

  const imagePart = response.candidates?.[0]?.content?.parts.find(
    (p) => p.inlineData,
  );
  if (!imagePart?.inlineData) throw new Error("Image generation failed");
  return `data:image/png;base64,${imagePart.inlineData.data}`;
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
  const scene =
    SCENE_PRESETS.find((s) => s.id === sceneId)?.description || "Studio";
  const results: PhotoshootImage[] = [];

  for (let i = 0; i < poses.length; i++) {
    onProgress(i + 1, poses.length);

    try {
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: {
          parts: [
            fileToGenerativePart(garmentImage, "image/jpeg"),
            {
              text: `High-end fashion editorial. A professional model with ${modelPrompt} wearing EXACTLY this ${analysis.garmentType}. Pose: ${poses[i]}. Setting: ${scene}. Photorealistic, 8k, fashion magazine style.`,
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
      if (error.message?.includes("Requested entity was not found"))
        throw new Error("RESELECT_KEY");
      console.error("Frame generation failed", error);
    }
  }
  return results;
};

export const generateCreativeBrief = async (
  analysis: GarmentAnalysis,
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: `Create a professional photography brief for a ${analysis.style} ${analysis.garmentType}. Max 3 bullet points.`,
  });
  return response.text || "";
};

export const editImage = async (
  base64Image: string,
  prompt: string,
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: BASIC_IMAGE_MODEL,
    contents: {
      parts: [
        fileToGenerativePart(base64Image, "image/jpeg"),
        { text: prompt },
      ],
    },
  });
  const part = response.candidates?.[0]?.content?.parts.find(
    (p) => p.inlineData,
  );
  if (!part?.inlineData) throw new Error("Edit failed");
  return `data:image/png;base64,${part.inlineData.data}`;
};
