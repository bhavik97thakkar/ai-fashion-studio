
import React, { useRef } from 'react';
import { SceneId } from '../types';
import { SCENE_PRESETS } from '../constants';
import { UploadIcon } from './icons/FeatureIcons';

interface SceneSelectorProps {
  selectedSceneId: SceneId;
  onSelectScene: (sceneId: SceneId) => void;
  customBackgroundImage: string | null;
  onCustomBackgroundChange: (file: File) => void;
}

const SceneSelector: React.FC<SceneSelectorProps> = ({ 
  selectedSceneId, 
  onSelectScene,
  customBackgroundImage,
  onCustomBackgroundChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onCustomBackgroundChange(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {SCENE_PRESETS.map((scene) => (
          <button
            key={scene.id}
            onClick={() => onSelectScene(scene.id)}
            className={`p-4 rounded-xl text-left transition-all duration-300 transform hover:scale-105 ${
              selectedSceneId === scene.id 
                ? 'bg-cyan-500 text-white shadow-lg ring-2 ring-cyan-300' 
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <scene.icon className="w-6 h-6" />
              <h3 className="font-bold text-base">{scene.name}</h3>
            </div>
            <p className="text-xs opacity-80">{scene.description}</p>
          </button>
        ))}
      </div>

      {selectedSceneId === SceneId.Custom && (
        <div className="mt-4 p-4 bg-gray-800 rounded-xl border border-gray-700 animate-fade-in">
          <h4 className="font-bold text-cyan-400 mb-2">Upload Background Image</h4>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-400 transition-colors"
          >
            {customBackgroundImage ? (
              <div className="relative w-full h-32">
                <img src={customBackgroundImage} alt="Custom Background" className="w-full h-full object-cover rounded-md" />
                <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-md">
                  <span className="text-white font-bold">Change Image</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-gray-400">
                <UploadIcon className="w-8 h-8 mb-2" />
                <span>Click to upload background</span>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/png, image/jpeg, image/webp" 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SceneSelector;
