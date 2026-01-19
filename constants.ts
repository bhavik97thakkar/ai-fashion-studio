
import { Scene, SceneId, Animation, AnimationId } from './types';
import { StudioIcon, OutdoorIcon, BeachIcon, LuxuryIcon, StreetIcon, NatureIcon, AutoIcon, NoneIcon as SceneNoneIcon, CustomIcon } from './components/icons/SceneIcons';
import { PosingIcon, NoneIcon as AnimationNoneIcon, WalkingIcon, TwirlingIcon } from './components/icons/AnimationIcons';

export const SCENE_PRESETS: Scene[] = [
  { id: SceneId.Auto, name: 'AI Auto Scene', description: 'AI selects the best scene for the garment.', icon: AutoIcon },
  { id: SceneId.Custom, name: 'Custom Image', description: 'Upload your own background image.', icon: CustomIcon },
  { id: SceneId.None, name: 'None', description: 'No specific scene, just a plain background.', icon: SceneNoneIcon },
  { id: SceneId.Studio, name: 'Studio', description: 'Clean, minimal background for e-commerce.', icon: StudioIcon },
  { id: SceneId.Outdoor, name: 'Outdoor', description: 'Natural lighting in parks or nature trails.', icon: OutdoorIcon },
  { id: SceneId.Beach, name: 'Beach', description: 'Sunny coastal vibe with sand and sea.', icon: BeachIcon },
  { id: SceneId.Luxury, name: 'Luxury / Indoors', description: 'Opulent settings like villas or modern homes.', icon: LuxuryIcon },
  { id: SceneId.Street, name: 'Street / Urban', description: 'City backgrounds with an artistic tone.', icon: StreetIcon },
  { id: SceneId.Nature, name: 'Nature / Garden', description: 'Lush greenery, flowers, and sunlight.', icon: NatureIcon },
];

export interface PoseOption {
  id: string;
  label: string;
  description: string;
}

export const POSES: PoseOption[] = [
  { id: 'front', label: 'Front View', description: 'Full view, model looking at camera' },
  { id: 'three_quarters', label: '3/4 Angle', description: 'Classic editorial angle' },
  { id: 'side', label: 'Side Profile', description: 'Detailed view from the side' },
  { id: 'back', label: 'Back View', description: 'Showing the full back details' },
  { id: 'close_up', label: 'Close-up', description: 'Fabric texture and fine details' },
  { id: 'lifestyle', label: 'Lifestyle', description: 'Dynamic, natural interaction' }
];

export const ANIMATION_PRESETS: Animation[] = [
  { id: AnimationId.None, name: 'Still Image', description: 'A single, high-quality photograph.', icon: AnimationNoneIcon },
  { id: AnimationId.Posing, name: 'AI Posing', description: 'Model strikes a series of poses.', icon: PosingIcon },
  { id: AnimationId.Walking, name: 'Catwalk', description: 'Model walks down a virtual runway.', icon: WalkingIcon },
  { id: AnimationId.Twirling, name: 'Twirl', description: 'Model twirls to show fabric movement.', icon: TwirlingIcon },
];
