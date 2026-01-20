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
 * Efficiently analyzes the garment using a concise structured prompt.
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
            text: "Fashion Expert: Analyze this garment. Provide high-accuracy details for commercial AI photoshoot generation. Focus on texture, silhouette, and primary brand colors.",
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
    if (isRetryableError(error) && retryCount < 3) {
      await delay(1500 * Math.pow(2, retryCount));
      return analyzeGarment(base64Image, retryCount + 1);
    }
    return handleGeminiError(error);
  }
};

/**
 * Generates the photoshoot with strict visual consistency using a Master Reference image.
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
    "Professional studio lighting";
  const results: PhotoshootImage[] = [];

  // Prompt engineering focused on consistency and professional quality
  const baseVisualRules = `
        Fashion Campaign Photography.
        Model Identity: ${modelPrompt}.
        Background: ${sceneDescription}.
        Item: ${analysis.style} ${analysis.garmentType} (${analysis.fabric}).
        Tech Specs: 8k resolution, cinematic lighting, sharp focus on fabric texture.
    `;

  // The Master Reference anchors the model's face and the specific background environment
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

        // Add the garment as the product reference
        parts.push(fileToGenerativePart(garmentImage, "image/jpeg"));

        // If we've already generated the first image, use it to lock model & background
        if (masterReferenceB64) {
          parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
        }

        const frameSpecificInstruction = `
                    Current Pose: ${poses[i]}.
                    Consistency Requirements:
                    1. USE THE EXACT SAME MODEL FACE, HAIR STYLE, AND SKIN TONE AS THE REFERENCE IMAGE.
                    2. KEEP THE BACKGROUND ENVIRONMENT AND LIGHTING IDENTICAL.
                    3. Only update the character's pose and orientation.
                `;

        const finalPrompt = masterReferenceB64
          ? `${baseVisualRules}\n${frameSpecificInstruction}`
          : `${baseVisualRules}\nInitial Shot: Establish model face and background atmosphere. Pose: ${poses[i]}.`;

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
            id: `shot-${Date.now()}-${i}`,
            src: `data:image/png;base64,${b64}`,
          });

          if (!masterReferenceB64) {
            masterReferenceB64 = b64;
          }
          success = true;
        } else {
          throw new Error("API failed to return image data");
        }
      } catch (error: any) {
        if (isRetryableError(error)) {
          attempts++;
          if (attempts < maxAttempts) {
            await delay(2000);
            continue;
          }
        }
        return handleGeminiError(error);
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
            text: `Refine fashion image. Prompt: ${prompt}. Do not change the model identity or the garment structure.`,
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
    if (!part?.inlineData) throw new Error("Edit operation failed");
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
