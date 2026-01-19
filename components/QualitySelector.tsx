import React from 'react';
import { ImageQuality } from '../types';

interface QualitySelectorProps {
  selectedQuality: ImageQuality;
  onSelectQuality: (quality: ImageQuality) => void;
}

const QUALITY_OPTIONS: { id: ImageQuality; name: string; description: string }[] = [
  { id: 'standard', name: 'Standard', description: 'Faster generation' },
  { id: 'hd', name: 'HD', description: 'Best quality' },
];

const QualitySelector: React.FC<QualitySelectorProps> = ({ selectedQuality, onSelectQuality }) => {
  const getButtonClass = (quality: ImageQuality) => {
    const base = "flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-300 text-center";
    if (selectedQuality === quality) {
      return `${base} bg-cyan-500 text-white shadow-md`;
    }
    return `${base} bg-gray-700 hover:bg-gray-600`;
  };

  return (
    <div className="flex gap-4">
      {QUALITY_OPTIONS.map(opt => (
        <button key={opt.id} onClick={() => onSelectQuality(opt.id)} className={getButtonClass(opt.id)}>
          <span className="font-bold">{opt.name}</span>
          <span className="block text-xs opacity-80">{opt.description}</span>
        </button>
      ))}
    </div>
  );
};

export default QualitySelector;
