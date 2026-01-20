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
 * Optimized to identify subtle textures, complex color palettes, and unique 3D embellishments.
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
            text: `TECHNICAL FASHION AUDIT:
                        Analyze this garment for 1:1 photorealistic digital replication.
                        1. GARMENT TYPE: Exact terminology (e.g., Kalidar Lehanga, Double-Breasted Blazer).
                        2. COLOR MAPPING: Define the absolute PRIMARY fabric color and a list of all SECONDARY accent colors (embroidery threads, prints, beadwork).
                        3. TEXTURE & WEAVE: Identify fabric weight, sheen (matte vs glossy), and weave type (e.g., silk, linen, heavy cotton).
                        4. SUBTLE EMBELLISHMENTS: Detail mirror work, sequins, thread-work density, and unique 3D textures.
                        5. PATTERN COMPLEXITY: Describe the geometric or floral layout, including motif scale and repetition.
                        6. SILHOUETTE: Describe the structured fit or drape behavior.
                        Return as precise JSON.`,
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
                "Index 0 is the primary base color. Subsequent indices are accent/thread colors.",
            },
            style: { type: Type.STRING },
            gender: { type: Type.STRING },
            uniquenessLevel: {
              type: Type.STRING,
              description:
                "Exhaustive breakdown of intricate patterns, 3D embellishments, and unique textile features.",
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
 * Generates a photoshoot using a visual 'Master Anchor'.
 * After the first frame, every subsequent image is anchored to the first's identity and environment.
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

  const productionDirectives = `
        PROFESSIONAL E-COMMERCE PRODUCTION.
        UNIFORMITY MANDATE: The model identity, hair texture, and room lighting MUST be identical across all frames.
        GARMENT FIDELITY: Model is wearing the EXACT ${analysis.garmentType} from the reference.
        COLOR SYSTEM: Primary: ${analysis.colorPalette[0]}, Secondary/Accents: ${analysis.colorPalette.slice(1).join(", ")}.
        PATTERN CLONING: Precise replication of: ${analysis.uniquenessLevel}.
        MODEL SPECS: ${modelPrompt}.
        ENVIRONMENT: ${sceneDescription}.
        TECHNICAL: 8k, ultra-sharp focus on textile fibers, professional lighting, zero stylistic variation.
    `;

  // The Master Frame is our visual 'Source of Truth' for model face and room geometry.
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

        // Reference 1: The original garment product shot.
        parts.push(fileToGenerativePart(garmentImage, "image/jpeg"));

        // Reference 2: The Master Identity Frame (starting from shot 2).
        if (masterFrameB64) {
          parts.push(fileToGenerativePart(masterFrameB64, "image/png"));
        }

        const visualLock = masterFrameB64
          ? `
                        STRICT IDENTITY & ENVIRONMENT LOCK:
                        1. FACE & HAIR: Use the EXACT face, hairstyle, hair color, and skin tone from the second reference image. NO IDENTITY SHIFT.
                        2. BACKGROUND & LIGHTING: Replicate the EXACT room geometry, wall color, and lighting direction/intensity from the second reference image.
                        3. GARMENT: Outfit design must match the first reference image 100%.
                        4. ACTION: Position the model in this pose: ${poses[i]}.
                      `
          : `Initialize Campaign. Establish the model identity and environment. Model wearing outfit from Reference 1. Pose: ${poses[i]}.`;

        parts.push({ text: `${productionDirectives}\n${visualLock}` });

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
            id: `shot-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
            src: `data:image/png;base64,${b64}`,
          });

          // The very first image generated becomes the permanent Master Reference for this session.
          if (!masterFrameB64) {
            masterFrameB64 = b64;
          }
          success = true;
        } else {
          throw new Error("Empty production frame.");
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
            text: `Apply professional retouching while strictly maintaining garment patterns and model identity: ${prompt}`,
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
    if (!part?.inlineData) throw new Error("Retouching failed");
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
