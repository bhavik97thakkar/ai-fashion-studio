import { GoogleGenAI, Type } from "@google/genai";
import { GarmentAnalysis, SceneId, PhotoshootImage } from "../types";
import { SCENE_PRESETS } from "../constants";

// Specialized models for reasoning vs generation
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
 * Deep Technical Garment Analysis.
 * Specifically requests primary/secondary colors and unique pattern identifiers.
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
            text: `TECHNICAL FASHION ANALYSIS:
                        Analyze the provided garment image for high-fidelity reproduction.
                        1. Identify the Garment Type.
                        2. Define the PRIMARY color (dominant fabric base).
                        3. List all SECONDARY colors (found in patterns, embroidery, or buttons).
                        4. Describe the FABRIC texture and sheen.
                        5. EXHAUSTIVE PATTERN DESCRIPTION: Describe embroidery style, mirror work, prints, and density of detail. 
                        6. SILHOUETTE: Describe the fit and cut.
                        Return the results in a precise JSON format.`,
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
                "Array where index 0 is primary, following indices are secondary colors.",
            },
            style: { type: Type.STRING },
            gender: { type: Type.STRING },
            uniquenessLevel: {
              type: Type.STRING,
              description:
                "Detailed breakdown of patterns, motifs, and embellishments for visual cloning.",
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
 * Generates a photoshoot using a Master Anchor logic.
 * Every frame after the first uses the first frame as a visual reference for face, hair, and lighting.
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

  const campaignRules = `
        HIGH-END FASHION EDITORIAL.
        IDENTITY SYNC: The model face, hair, and lighting MUST be identical across all frames.
        GARMENT FIDELITY: The model is wearing the EXACT ${analysis.garmentType} from the reference image.
        COLOR SPECS: Primary: ${analysis.colorPalette[0]}, Secondary: ${analysis.colorPalette.slice(1).join(", ")}.
        PATTERN CLONING: Replicate ${analysis.uniquenessLevel} exactly.
        MODEL: ${modelPrompt}.
        ENVIRONMENT: ${sceneDescription}.
        TECHNICAL: 8k, sharp focus, professional fashion lighting, neutral contrast.
    `;

  // The Master Frame is our visual source of truth for the model's face and the specific room/lighting.
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

        // ALWAYS reference the original garment image for pattern details
        parts.push(fileToGenerativePart(garmentImage, "image/jpeg"));

        // From the second shot onwards, we inject the Master Frame as the anchor for face/background.
        if (masterFrameB64) {
          parts.push(fileToGenerativePart(masterFrameB64, "image/png"));
        }

        const visualLockDirective = masterFrameB64
          ? `
                        STRICT VISUAL ANCHORING:
                        1. FACE & HAIR: Use the EXACT face, hairstyle, and hair color from the second reference image. DO NOT change the person's identity.
                        2. BACKGROUND & LIGHTING: Replicate the EXACT room, wall texture, floor, and lighting setup from the second reference image.
                        3. GARMENT: The outfit must match the design of the first reference image 100%.
                        4. POSE: Transition the model to this pose: ${poses[i]}.
                      `
          : `Initialize the campaign. Model is wearing the garment from the first reference image. Pose: ${poses[i]}.`;

        parts.push({ text: `${campaignRules}\n${visualLockDirective}` });

        const response = await ai.models.generateContent({
          model: IMAGE_MODEL,
          contents: { parts },
          config: {
            imageConfig: { aspectRatio: "3:4" },
          },
        });

        const imgPart = response.candidates?.[0]?.content?.parts.find(
          (p) => p.inlineData,
        );
        if (imgPart?.inlineData) {
          const b64 = imgPart.inlineData.data;
          results.push({
            id: `shot-${Date.now()}-${i}`,
            src: `data:image/png;base64,${b64}`,
          });

          // Capture the very first successful shot as the anchor for all others.
          if (!masterFrameB64) {
            masterFrameB64 = b64;
          }
          success = true;
        } else {
          throw new Error("Missing image in API response.");
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
            text: `Refine this fashion photograph while preserving garment patterns and model identity: ${prompt}`,
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
