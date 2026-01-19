import React from 'react';
import { AnimationId } from '../types';
import { ANIMATION_PRESETS } from '../constants';

interface AnimationSelectorProps {
  selectedAnimationId: AnimationId;
  onSelectAnimation: (animationId: AnimationId) => void;
}

const AnimationSelector: React.FC<AnimationSelectorProps> = ({ selectedAnimationId, onSelectAnimation }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
      {ANIMATION_PRESETS.map((anim) => (
        <button
          key={anim.id}
          onClick={() => onSelectAnimation(anim.id)}
          className={`p-4 rounded-xl text-left transition-all duration-300 transform hover:scale-105 ${
            selectedAnimationId === anim.id 
              ? 'bg-cyan-500 text-white shadow-lg ring-2 ring-cyan-300' 
              : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <anim.icon className="w-6 h-6" />
            <h3 className="font-bold text-base">{anim.name}</h3>
          </div>
          <p className="text-xs opacity-80">{anim.description}</p>
        </button>
      ))}
    </div>
  );
};

export default AnimationSelector;