import React from 'react';

export enum SceneId {
  Studio = "studio",
  Outdoor = "outdoor",
  Beach = "beach",
  Luxury = "luxury",
  Street = "street",
  Nature = "nature",
  Auto = "auto",
  None = "none",
  Custom = "custom",
}

export type Scene = {
  id: SceneId;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

export enum AnimationId {
  Posing = "posing",
  None = "none",
  Walking = "walking",
  Twirling = "twirling",
}

export type Animation = {
  id: AnimationId;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

export interface GarmentAnalysis {
  garmentType: string;
  fabric: string;
  colorPalette: string[];
  style: string;
  gender: 'Male' | 'Female' | 'Unisex';
  uniquenessLevel: 'Unique' | 'Common';
}

export interface PhotoshootImage {
  id: string;
  src: string;
}

export type ImageQuality = 'standard' | 'hd';

export interface UploadedGarment {
  id: string;
  file: File;
  preview: string;
  analysis: GarmentAnalysis | null;
  isLoading: boolean;
  error?: string;
}

export type ModelGender = 'Male' | 'Female' | 'Unisex';
export type ModelAge = '18-25' | '26-35' | '36-45' | '46+';
export type ModelEthnicity = 'Any' | 'Asian' | 'Black' | 'Caucasian' | 'Hispanic' | 'Middle Eastern' | 'South Asian' | 'Mixed';
export type ModelBodyType = 'Any' | 'Slim' | 'Athletic' | 'Average' | 'Curvy' | 'Plus-size';

export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
}

export interface UsageLimit {
  count: number;
  lastReset: string;
}
