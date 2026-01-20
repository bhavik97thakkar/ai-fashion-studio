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
            text: "AI Fashion Expert: Analyze the attached garment image for a professional digital photoshoot. Identify: 1. Garment Type. 2. Fabric and Texture. 3. Primary Color. 4. Secondary Colors. 5. Unique patterns or embellishments (e.g., floral print, sequins, embroidery). 6. Overall style and fit. Return the data strictly in JSON format matching the schema.",
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
                "List containing primary color first, then secondary colors.",
            },
            style: {
              type: Type.STRING,
              description:
                "Detailed description of style, fit, and silhouette.",
            },
            gender: { type: Type.STRING },
            uniquenessLevel: {
              type: Type.STRING,
              description:
                "Specifically mention any patterns, prints, or unique embellishments found.",
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
    SCENE_PRESETS.find((s) => s.id === sceneId)?.description || "Studio";
  const results: PhotoshootImage[] = [];

  // Prompt engineering focused on garment accuracy and model/scene consistency
  const baseVisualRules = `
        PROFESSIONAL E-COMMERCE PHOTOGRAPHY.
        GARMENT ACCURACY: The model MUST wear the EXACT same ${analysis.garmentType} shown in the first reference image. 
        MANDATORY: Replicate the primary color (${analysis.colorPalette[0]}), secondary colors (${analysis.colorPalette.slice(1).join(", ")}), 
        and specifically these details: ${analysis.uniquenessLevel}.
        Model: ${modelPrompt}.
        Scene: ${sceneDescription}.
        Quality: Photorealistic, 8k, neutral professional lighting, high clarity.
    `;

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

        // PART 1: The Product (Garment) Source - ALWAYS PRESENT
        parts.push(fileToGenerativePart(garmentImage, "image/jpeg"));

        // PART 2: The Visual Anchor (First shot generated) - Locking model and background
        if (masterReferenceB64) {
          parts.push(fileToGenerativePart(masterReferenceB64, "image/png"));
        }

        const frameSpecificInstruction = `
                    STRICT ANCHORING REQUIREMENTS:
                    1. PRODUCT IDENTITY: The model's outfit MUST match the garment reference image exactly in color, texture, and pattern. No design variations allowed.
                    2. MODEL IDENTITY: REUSE the exact same face, hair style, hair color, and skin tone from the second reference image.
                    3. BACKGROUND IDENTITY: REUSE the exact same background environment, floor, walls, and lighting setup from the second reference image.
                    4. ACTION: Position the model in the following pose: ${poses[i]}.
                `;

        const finalPrompt = masterReferenceB64
          ? `${baseVisualRules}\n${frameSpecificInstruction}`
          : `${baseVisualRules}\nEstablish Model Identity and Scene. Pose: ${poses[i]}. Use the provided garment image as the ONLY source for the model's outfit.`;

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

          if (!masterReferenceB64) {
            masterReferenceB64 = b64;
          }
          success = true;
        } else {
          throw new Error("Image Generation Failed");
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
            text: `Refine: ${prompt}. Preserve the garment design and model identity exactly.`,
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
