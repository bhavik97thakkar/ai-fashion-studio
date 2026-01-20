import { GoogleGenAI, Type } from "@google/genai";
import { GarmentAnalysis, SceneId, PhotoshootImage } from "../types";
import { SCENE_PRESETS } from "../constants";

// Models used for specialized tasks
const ANALYSIS_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  const data = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  return {
    inlineData: { data, mimeType: mimeType || "image/jpeg" },
  };
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const isRetryableError = (error: any): boolean => {
  const msg = error.message?.toLowerCase() || "";
  return (
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

/**
 * Enhanced analysis to extract granular garment details including primary/secondary colors
 * and intricate embellishments/patterns.
 */
export const analyzeGarment = async (
  base64Image: string,
  retryCount = 0,
): Promise<GarmentAnalysis> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const imagePart = fileToGenerativePart(base64Image, "image/jpeg");

    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: {
        parts: [
          {
            text: `AI Fashion Director: Perform a technical analysis of this garment. 
                        EXTRACT:
                        1. Garment Type (e.g., Anarkali, Blazer, Tunic).
                        2. Primary Color (The dominant hue).
                        3. Secondary Colors (List all accent hues, embroidery colors, or print shades).
                        4. Fabric Texture & Material.
                        5. Unique Embellishments: Detail any mirror work, thread embroidery, beads, or specific prints.
                        6. Style & Silhouette: Fit and cut details.
                        Return as valid JSON.`,
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
            colorPalette: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                "Primary color at index 0, followed by all secondary/accent colors.",
            },
            style: { type: Type.STRING },
            gender: { type: Type.STRING },
            uniquenessLevel: {
              type: Type.STRING,
              description:
                "Exhaustive description of patterns, embroidery, and unique design elements.",
            },
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

    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (error: any) {
    if (isRetryableError(error) && retryCount < 3) {
      await delay(1000 * Math.pow(2, retryCount));
      return analyzeGarment(base64Image, retryCount + 1);
    }
    return handleGeminiError(error);
  }
};

/**
 * Generates the photoshoot using gemini-2.5-flash-image while maintaining
 * strict visual consistency via a Master Identity Anchor logic.
 */
export const generatePhotoshoot = async (
  garmentImage: string,
  analysis: GarmentAnalysis,
  sceneId: SceneId,
  modelPrompt: string,
  poses: string[],
  onProgress: (index: number, total: number, isRetrying?: boolean) => void,
): Promise<PhotoshootImage[]> => {
  const sceneDescription =
    SCENE_PRESETS.find((s) => s.id === sceneId)?.description ||
    "Professional Studio";
  const results: PhotoshootImage[] = [];

  const baseProductionRules = `
        PROFESSIONAL FASHION CAMPAIGN. 
        GARMENT FIDELITY: Model MUST wear the EXACT ${analysis.garmentType} from the product reference.
        COLOR LOCK: Primary: ${analysis.colorPalette[0]}, Accents: ${analysis.colorPalette.slice(1).join(", ")}.
        DETAIL LOCK: Replicate this EXACT design/embroidery: ${analysis.uniquenessLevel}.
        MODEL ATTRIBUTES: ${modelPrompt}.
        SCENE: ${sceneDescription}.
        TECHNICAL: 8k, photorealistic, sharp focus, high-end commercial studio lighting.
    `;

  // masterFrameB64 serves as the permanent reference for the model's face, hair, and the room lighting.
  let masterFrameB64: string | null = null;

  for (let i = 0; i < poses.length; i++) {
    let attempts = 0;
    const maxAttempts = 2;
    let success = false;

    while (attempts < maxAttempts && !success) {
      onProgress(i + 1, poses.length, attempts > 0);

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
        const parts: any[] = [];

        // PART 1: The original product reference
        parts.push(fileToGenerativePart(garmentImage, "image/jpeg"));

        // PART 2: The Master Frame Anchor (from shot 2 onwards)
        if (masterFrameB64) {
          parts.push(fileToGenerativePart(masterFrameB64, "image/png"));
        }

        const frameInstruction = masterFrameB64
          ? `
                        STRICT VISUAL CONSISTENCY MANDATE:
                        1. CLONE THE MODEL: You MUST use the EXACT same face, eyes, hair texture, and hairstyle from the second reference image. No variations allowed.
                        2. CLONE THE BACKGROUND: The background geometry, lighting direction, shadows, and environment MUST be identical to the second reference image.
                        3. GARMENT PERSPECTIVE: Maintain the garment design from the first reference image, but adjusted for this pose: ${poses[i]}.
                      `
          : `Establish the definitive model identity and background environment. The model is wearing the outfit from the first reference image. Pose: ${poses[i]}.`;

        parts.push({ text: `${baseProductionRules}\n${frameInstruction}` });

        const response = await ai.models.generateContent({
          model: IMAGE_MODEL,
          contents: { parts },
          config: {
            imageConfig: { aspectRatio: "3:4" },
          },
        });

        const imagePart = response.candidates?.[0]?.content?.parts.find(
          (p) => p.inlineData,
        );
        if (imagePart?.inlineData) {
          const b64 = imagePart.inlineData.data;
          results.push({
            id: `shot-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
            src: `data:image/png;base64,${b64}`,
          });

          // Lock the first successful shot as the Master Reference for identity and background
          if (!masterFrameB64) {
            masterFrameB64 = b64;
          }
          success = true;
        } else {
          throw new Error("Empty image response");
        }
      } catch (error: any) {
        if (isRetryableError(error)) {
          attempts++;
          if (attempts < maxAttempts) {
            await delay(2000);
            continue;
          }
        }
        throw error;
      }
    }
  }
  return results;
};

export const editImage = async (
  base64Image: string,
  prompt: string,
  retryCount = 0,
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: {
        parts: [
          fileToGenerativePart(base64Image, "image/jpeg"),
          {
            text: `Refine this fashion image while strictly maintaining the garment design and model identity: ${prompt}`,
          },
        ],
      },
      config: {
        imageConfig: { aspectRatio: "3:4" },
      },
    });
    const part = response.candidates?.[0]?.content?.parts.find(
      (p) => p.inlineData,
    );
    if (!part?.inlineData) throw new Error("Edit failed");
    return `data:image/png;base64,${part.inlineData.data}`;
  } catch (error: any) {
    if (isRetryableError(error) && retryCount < 2) {
      await delay(2000);
      return editImage(base64Image, prompt, retryCount + 1);
    }
    return handleGeminiError(error);
  }
};

export const generateImage = async (
  prompt: string,
  retryCount = 0,
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: {
        imageConfig: { aspectRatio: "3:4" },
      },
    });
    const part = response.candidates?.[0]?.content?.parts.find(
      (p) => p.inlineData,
    );
    if (!part?.inlineData) throw new Error("Generation failed");
    return `data:image/png;base64,${part.inlineData.data}`;
  } catch (error: any) {
    if (isRetryableError(error) && retryCount < 2) {
      await delay(2000);
      return generateImage(prompt, retryCount + 1);
    }
    return handleGeminiError(error);
  }
};
