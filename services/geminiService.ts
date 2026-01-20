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

  // The Master Prompt ensures initial direction is high quality
  const baseSystemPrompt = `
        High-end professional fashion editorial photography. 
        Model: ${modelPrompt}. 
        Setting: ${sceneDescription}. 
        Garment: ${analysis.style} ${analysis.garmentType} in ${analysis.colorPalette.join(", ")}.
        Quality: 8k resolution, photorealistic, sharp focus, magazine quality.
    `;

  let firstGeneratedImageBase64: string | null = null;

  for (let i = 0; i < poses.length; i++) {
    onProgress(i + 1, poses.length);

    try {
      const parts: any[] = [fileToGenerativePart(garmentImage, "image/jpeg")];

      let promptText = "";

      if (i === 0) {
        // First image: establish the "Master Look"
        promptText = `
                    ${baseSystemPrompt}
                    ACTION: Full body shot, ${poses[i]}.
                    Establish a definitive model face, hair, and lighting style.
                `.trim();
      } else if (firstGeneratedImageBase64) {
        // Subsequent images: Use the first image as a visual reference
        parts.push(
          fileToGenerativePart(firstGeneratedImageBase64, "image/png"),
        );
        promptText = `
                    ${baseSystemPrompt}
                    STRICT VISUAL CONSISTENCY: 
                    1. Use the EXACT SAME PERSON (face, features, hair) as seen in the second reference image.
                    2. Use the EXACT SAME BACKGROUND and lighting as the second reference image.
                    3. The only change is the pose.
                    ACTION: Current pose is ${poses[i]}.
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

        // Save the very first result to use as the visual anchor for all other poses
        if (i === 0) {
          firstGeneratedImageBase64 = b64;
        }
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
