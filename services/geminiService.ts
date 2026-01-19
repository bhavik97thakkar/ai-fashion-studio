import { GoogleGenAI, Type } from "@google/genai";
import {
  GarmentAnalysis,
  SceneId,
  PhotoshootImage,
  ModelGender,
  ModelAge,
  ModelEthnicity,
  ModelBodyType,
} from "../types";
import { SCENE_PRESETS } from "../constants";

const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";

/**
 * PRODUCTION-READY KEY RESOLVER
 * Specifically tuned for GitHub Pages (Vite) and Vercel/Netlify.
 */
export const getActiveApiKey = () => {
  // 1. Check for Vite-specific prefix (Required for GitHub Pages/Vercel/Netlify static builds)
  // 2. Check for standard API_KEY (Fallback)
  const key =
    (import.meta as any).env?.VITE_API_KEY ||
    (import.meta as any).env?.API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_API_KEY ||
    (window as any)._ENV_?.API_KEY; // Support for runtime config injection

  if (
    key &&
    typeof key === "string" &&
    key.length > 30 &&
    !key.includes("PLACEHOLDER")
  ) {
    const cleanKey = key
      .replace(/['"‘“’”]+/g, "")
      .replace(/\s/g, "")
      .trim();

    // Safety Log: Only visible in DevTools to confirm the key is loaded
    console.log(
      `[STUDIO-AI] API Key Loaded Successfully (${cleanKey.substring(0, 4)}...${cleanKey.substring(cleanKey.length - 4)})`,
    );
    return cleanKey;
  }

  console.warn(
    "[STUDIO-AI] WARNING: No valid API Key found. If hosting on GitHub, ensure VITE_API_KEY is set in your Secrets.",
  );
  return null;
};

const getAI = () => {
  const key = getActiveApiKey();
  if (!key) throw new Error("AUTH_ERROR");
  // Always initialize fresh to catch any runtime changes
  return new GoogleGenAI({ apiKey: key });
};

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  const data = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  return {
    inlineData: {
      data,
      mimeType: mimeType || "image/jpeg",
    },
  };
};

export const analyzeGarment = async (
  base64Image: string,
): Promise<GarmentAnalysis> => {
  try {
    const ai = getAI();
    const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          parts: [
            {
              text: "Detailed fashion analysis for AI photoshoot. Return valid JSON only.",
            },
            imagePart,
          ],
        },
      ],
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

    const content = response.text;
    if (!content) throw new Error("Empty AI response");
    return JSON.parse(content) as GarmentAnalysis;
  } catch (error: any) {
    console.error("[STUDIO-AI] Analysis Error:", error);
    if (
      error.message?.includes("key not valid") ||
      error.message?.includes("INVALID_ARGUMENT")
    ) {
      throw new Error("AUTH_ERROR");
    }
    throw new Error("ANALYSIS_FAILED");
  }
};

export const generatePhotoshoot = async (
  garments: { analysis: GarmentAnalysis; base64GarmentImage: string }[],
  sceneId: SceneId,
  gender: "Male" | "Female" | "Unisex",
  modelDescription: string,
  onProgress: (progress: number, total: number) => void,
  customBackgroundImage?: string | null,
  customModelImage?: string | null,
  poses: string[] = [],
): Promise<PhotoshootImage[]> => {
  const ai = getAI();
  let sceneDescription =
    SCENE_PRESETS.find((s) => s.id === sceneId)?.description ||
    "Professional fashion studio";

  const allGarmentParts = garments.map((g) =>
    fileToGenerativePart(g.base64GarmentImage, "image/jpeg"),
  );
  const allGeneratedImages: string[] = [];

  // Process each pose sequentially
  for (let i = 0; i < poses.length; i++) {
    onProgress(i + 1, poses.length);
    const parts: any[] = [...allGarmentParts];

    // Construct detailed prompt
    let prompt = `High-end editorial fashion photography of a model: ${modelDescription}. 
        Pose: ${poses[i]}. Setting: ${sceneDescription}. 
        The model is wearing the uploaded garment perfectly. 
        Lighting: Cinematic, 8K resolution, photorealistic, Vogue style.`;

    if (customBackgroundImage) {
      parts.push({ text: "Use this background image for the scene:" });
      parts.push(fileToGenerativePart(customBackgroundImage, "image/jpeg"));
    }

    if (customModelImage) {
      parts.push({
        text: "The model should have the facial features of this person:",
      });
      parts.push(fileToGenerativePart(customModelImage, "image/jpeg"));
    }

    parts.push({ text: prompt });

    try {
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ parts }],
        config: {
          imageConfig: {
            aspectRatio: "3:4",
          },
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts.find(
        (p) => p.inlineData,
      );
      if (imagePart?.inlineData) {
        allGeneratedImages.push(
          `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        );
      }
    } catch (e) {
      console.error(`[STUDIO-AI] Failed to render pose: ${poses[i]}`, e);
    }
  }

  return allGeneratedImages.map((src, i) => ({
    id: `res-${Date.now()}-${i}`,
    src,
  }));
};

export const enhanceModelPrompt = async (
  g: ModelGender,
  a: ModelAge,
  e: ModelEthnicity,
  b: ModelBodyType,
  d: string,
): Promise<string> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [
        {
          parts: [
            {
              text: `Create a professional modeling description for: ${g} model, ${a} years old, ${e} ethnicity, ${b} build. Additional styling: ${d}`,
            },
          ],
        },
      ],
    });
    return response.text?.trim() || "A professional fashion model";
  } catch {
    return `A ${g} model, ${a}, ${e} ethnicity`;
  }
};

export const editImage = async (
  base64Image: string,
  prompt: string,
): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        parts: [
          fileToGenerativePart(base64Image, "image/jpeg"),
          { text: `Modify this image: ${prompt}` },
        ],
      },
    ],
  });
  const part = response.candidates?.[0]?.content?.parts.find(
    (p) => p.inlineData,
  );
  if (!part?.inlineData) throw new Error("Image editing failed");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
  });
  const part = response.candidates?.[0]?.content?.parts.find(
    (p) => p.inlineData,
  );
  if (!part?.inlineData) throw new Error("Image generation failed");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
};
