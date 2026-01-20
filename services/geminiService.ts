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
 * Efficiently analyzes the garment with a focus on color accuracy and unique embellishments.
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
            text: "AI Fashion Expert: Analyze this garment image for professional photoshoot replication. Identify the garment type, fabric texture, primary color, all secondary colors, and specifically describe unique patterns, prints, or embellishments (like embroidery, sequins, or unique textures). Ensure the analysis is precise for image generation grounding.",
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
              description: "Primary color first, followed by secondary colors.",
            },
            style: {
              type: Type.STRING,
              description: "Detailed fit and silhouette description.",
            },
            gender: { type: Type.STRING },
            uniquenessLevel: {
              type: Type.STRING,
              description:
                "Detailed description of patterns, embroidery, or unique embellishments.",
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

    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    if (isRetryableError(error) && retryCount < 3) {
      await delay(1000 * Math.pow(2, retryCount));
      return analyzeGarment(base64Image, retryCount + 1);
    }
    return handleGeminiError(error);
  }
};

/**
 * Generates the photoshoot with strict visual consistency using the first generated image as a permanent anchor.
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

  const baseVisualRules = `
        PROFESSIONAL E-COMMERCE PHOTOGRAPHY.
        GARMENT FIDELITY: The model MUST wear the EXACT ${analysis.garmentType} from the source. 
        MANDATORY: Replicate the primary color (${analysis.colorPalette[0]}), secondary colors (${analysis.colorPalette.slice(1).join(", ")}), 
        and the specific pattern/embellishment details: ${analysis.uniquenessLevel}.
        Model Description: ${modelPrompt}.
        Atmosphere: ${sceneDescription}.
        Quality: 8k, photorealistic, sharp focus on fabric texture, professional lighting.
    `;

  // masterReferenceB64 acts as the "Identity Anchor" for model face, hair, and lighting.
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

        // Always provide the original garment as the primary product reference
        parts.push(fileToGenerativePart(garmentImage, "image/jpeg"));

        // After the first image, provide it back to the model to LOCK the identity
        if (masterReferenceB64) {
          parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
        }

        const frameSpecificInstruction = `
                    CRITICAL - IDENTITY SYNC:
                    1. CLONE THE MODEL: You MUST reuse the EXACT same face, eye shape, hair color, and hair style from the reference image.
                    2. LOCK THE SCENE: The background, floor, wall texture, and lighting direction MUST be identical to the reference image.
                    3. REPLICATE GARMENT: The clothing pattern and colors must be 100% consistent with the original product reference.
                    4. ACTION: Position the model in the following pose: ${poses[i]}.
                `;

        const finalPrompt = masterReferenceB64
          ? `${baseVisualRules}\n${frameSpecificInstruction}`
          : `${baseVisualRules}\nEstablish the permanent Model Identity and Background. Pose: ${poses[i]}. The model's outfit must match the provided garment image exactly.`;

        parts.push({ text: finalPrompt });

        const response = await ai.models.generateContent({
          model: IMAGE_MODEL,
          contents: { parts },
          config: {
            imageConfig: { aspectRatio: "3:4" },
          },
        });

        const imagePart = response.candidates?.[0]?.content?.parts.find(
          (part) => part.inlineData,
        );
        if (imagePart?.inlineData) {
          const b64 = imagePart.inlineData.data;
          results.push({
            id: `shot-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
            src: `data:image/png;base64,${b64}`,
          });

          // Capture the first image as the "Master Anchor" for all future frames in this batch
          if (!masterReferenceB64) {
            masterReferenceB64 = b64;
          }
          success = true;
        } else {
          throw new Error("API failed to generate visual part");
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
            text: `Refine this fashion asset: ${prompt}. Maintain the exact garment design and model face.`,
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
