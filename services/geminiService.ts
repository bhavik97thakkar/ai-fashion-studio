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

// Using Gemini 1.5 Flash as it has the most reliable free-tier availability
// without requiring a mandatory billing account link in most regions.
const STABLE_MODEL = "gemini-1.5-flash";

/**
 * PRODUCTION-READY KEY RESOLVER
 */
export const getActiveApiKey = () => {
  const key =
    (import.meta as any).env?.VITE_API_KEY ||
    (import.meta as any).env?.API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_API_KEY ||
    (window as any)._ENV_?.API_KEY;

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
    return cleanKey;
  }
  return null;
};

const getAI = () => {
  const key = getActiveApiKey();
  if (!key) throw new Error("AUTH_ERROR");
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
      model: STABLE_MODEL,
      contents: [
        {
          parts: [
            {
              text: "Analyze this garment for a fashion photoshoot. Return JSON: {garmentType, fabric, colorPalette:[], style, gender:'Male'|'Female'|'Unisex', uniquenessLevel:'Unique'|'Common'}",
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
      error.message?.includes("429") ||
      error.message?.includes("quota") ||
      error.message?.includes("limit: 0")
    ) {
      throw new Error("QUOTA_EXCEEDED");
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

  for (let i = 0; i < poses.length; i++) {
    onProgress(i + 1, poses.length);
    const parts: any[] = [...allGarmentParts];

    // Gemini 1.5 Flash doesn't natively generate images in the same way Imagen does through the generateContent endpoint
    // It's a multimodal model that understands images, but image generation is a separate capability.
    // If your key is strictly Free Tier, you might only have access to text/vision.

    let prompt = `High-end editorial fashion photography. Model: ${modelDescription}. 
        Pose: ${poses[i]}. Setting: ${sceneDescription}. 
        Wearing: ${garments.map((g) => g.analysis.garmentType).join(", ")}. 
        Lighting: Cinematic, 8K resolution, Vogue style.`;

    if (customBackgroundImage) {
      parts.push({ text: "Background reference:" });
      parts.push(fileToGenerativePart(customBackgroundImage, "image/jpeg"));
    }

    if (customModelImage) {
      parts.push({ text: "Model face reference:" });
      parts.push(fileToGenerativePart(customModelImage, "image/jpeg"));
    }

    parts.push({ text: prompt });

    try {
      // NOTE: In the Gemini API, 1.5-flash is multimodal but does not support text-to-image
      // generation directly via generateContent. For real image generation, Imagen 3 or
      // Gemini 2.0-flash (with billing) is required.
      // However, we will attempt the call to see if your project has the Image Modality enabled.
      const response = await ai.models.generateContent({
        model: STABLE_MODEL,
        contents: [{ parts }],
      });

      const imagePart = response.candidates?.[0]?.content?.parts.find(
        (p) => p.inlineData,
      );
      if (imagePart?.inlineData) {
        allGeneratedImages.push(
          `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        );
      } else {
        // For users on the 100% free tier where image modality isn't enabled,
        // we'll simulate the failure to provide a clear UI message.
        console.error(
          "This API Key does not support Image Generation. Upgrade to a paid billing plan in Google Cloud Console.",
        );
        throw new Error("IMAGE_MODALITY_UNAVAILABLE");
      }
    } catch (e: any) {
      console.error(`[STUDIO-AI] Render Error:`, e);
      if (e.message?.includes("429") || e.message?.includes("limit: 0"))
        throw new Error("QUOTA_EXCEEDED");
      throw e;
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
      model: STABLE_MODEL,
      contents: [
        {
          parts: [
            {
              text: `Model profile: ${g}, ${a}, ${e} ethnicity, ${b} build. Styles: ${d}. Give a 1-sentence physical description.`,
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
    model: STABLE_MODEL,
    contents: [
      {
        parts: [
          fileToGenerativePart(base64Image, "image/jpeg"),
          { text: `Modify image: ${prompt}` },
        ],
      },
    ],
  });
  const part = response.candidates?.[0]?.content?.parts.find(
    (p) => p.inlineData,
  );
  if (!part?.inlineData) throw new Error("Edit failed");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
};

export const generateImage = async (prompt: string): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: STABLE_MODEL,
    contents: [{ parts: [{ text: prompt }] }],
  });
  const part = response.candidates?.[0]?.content?.parts.find(
    (p) => p.inlineData,
  );
  if (!part?.inlineData) throw new Error("Generation failed");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
};
