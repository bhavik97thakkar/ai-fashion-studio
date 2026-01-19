import { GoogleGenAI, Type } from "@google/genai";
import { GarmentAnalysis } from "../types";

// Using the recommended models from the guidelines
const TEXT_MODEL = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";

export const getActiveApiKey = () => {
  const key = process.env.API_KEY;
  return key?.replace(/['"]+/g, "").trim() || null;
};

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  const data = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  return {
    inlineData: { data, mimeType: mimeType || "image/jpeg" },
  };
};

// Function to analyze garment using vision capabilities
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
            text: "Act as a world-class fashion director. Analyze this garment and return JSON according to the schema.",
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

    const text = response.text;
    return JSON.parse(text || "{}");
  } catch (error: any) {
    if (error.message?.includes("429") || error.message?.includes("limit")) {
      throw new Error("QUOTA_EXCEEDED");
    }
    throw new Error("ANALYSIS_FAILED");
  }
};

// Function to generate creative brief based on analysis
export const generateCreativeBrief = async (
  analysis: GarmentAnalysis,
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const prompt = `Write a professional photography creative brief for a ${analysis.style} ${analysis.garmentType}. 
    Mention lighting (soft/hard), setting (urban/nature), and styling tips. Keep it to 3 punchy bullet points.`;

  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  });
  return response.text || "No brief generated.";
};

// Implementation of generateImage to fix the reported error
export const generateImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  // Find the image part in the response
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image data returned from model");
};
