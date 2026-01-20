import { GoogleGenAI, Type } from "@google/genai";
import { GarmentAnalysis, SceneId, PhotoshootImage } from "../types";
import { SCENE_PRESETS } from "../constants";

// Use Gemini 3 Flash for complex reasoning/analysis and Gemini 2.5 Flash for image generation
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
 * Robust analysis to extract primary/secondary colors and intricate patterns.
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
            text: "AI Fashion Photographer: Analyze this garment image. Identify and describe: 1. Garment Type. 2. Primary Color. 3. List of Secondary Colors. 4. Fabric Texture. 5. Detailed description of unique patterns, embroidery, or embellishments. 6. Overall fit and style. Return valid JSON.",
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
              description: "Primary color first, then all secondary colors.",
            },
            style: { type: Type.STRING },
            gender: { type: Type.STRING },
            uniquenessLevel: {
              type: Type.STRING,
              description:
                "Exhaustive description of patterns, embroidery, and design details.",
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
 * Generates the photoshoot with strict visual consistency using a Master Identity Anchor.
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
    SCENE_PRESETS.find((s) => s.id === sceneId)?.description || "Studio";
  const results: PhotoshootImage[] = [];

  // Prompt core focuses on garment design replication
  const baseVisualRules = `
        PROFESSIONAL E-COMMERCE CAMPAIGN.
        GARMENT FIDELITY: The model MUST wear the EXACT same ${analysis.garmentType} from the first reference image.
        DETAILS: Primary color: ${analysis.colorPalette[0]}, Secondary colors: ${analysis.colorPalette.slice(1).join(", ")}. 
        STRICTLY REPLICATE: ${analysis.uniquenessLevel}.
        Model Details: ${modelPrompt}.
        Scene Atmosphere: ${sceneDescription}.
        Quality: 8k, photorealistic, sharp focus on textile details, neutral professional lighting.
    `;

  // masterReferenceB64 is the identity anchor (face, hair, lighting, background)
  let masterReferenceB64: string | null = null;

  for (let i = 0; i < poses.length; i++) {
    let attempts = 0;
    const maxAttempts = 2;
    let success = false;

    while (attempts < maxAttempts && !success) {
      onProgress(i + 1, poses.length, attempts > 0);

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
        const parts: any[] = [];

        // PART 1: The Product Reference (Always first)
        parts.push(fileToGenerativePart(garmentImage, "image/jpeg"));

        // PART 2: The Identity Anchor (Starting from the 2nd frame)
        if (masterReferenceB64) {
          parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
        }

        const visualAnchorInstruction = masterReferenceB64
          ? `
                        STRICT VISUAL ANCHORING REQUIREMENTS:
                        1. MODEL IDENTITY: Clone the EXACT face, hairstyle, hair color, and features from the second reference image.
                        2. BACKGROUND & LIGHTING: Replicate the EXACT room, floor, wall texture, and light sources from the second reference image. DO NOT CHANGE THE ENVIRONMENT.
                        3. GARMENT IDENTITY: The outfit MUST match the design/pattern of the first reference image 100%.
                        4. POSE CHANGE: Position the same model in this specific pose: ${poses[i]}.
                      `
          : `Establish a definitive model identity and background environment. Use the provided garment reference image for the outfit design. Pose: ${poses[i]}.`;

        parts.push({ text: `${baseVisualRules}\n${visualAnchorInstruction}` });

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

          // The very first image generated becomes the permanent "Master Frame" for identity/background
          if (!masterReferenceB64) {
            masterReferenceB64 = b64;
          }
          success = true;
        } else {
          throw new Error("Generation failure: No image data returned.");
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
            text: `Refine this fashion image: ${prompt}. DO NOT change the garment design or the model's identity.`,
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
