
import React, { useRef } from 'react';
import { ModelGender, ModelAge, ModelEthnicity, ModelBodyType } from '../types';
import { UploadIcon } from './icons/FeatureIcons';

interface ModelOptionsProps {
  selectedGender: ModelGender;
  onGenderChange: (gender: ModelGender) => void;
  selectedAge: ModelAge;
  onAgeChange: (age: ModelAge) => void;
  selectedEthnicity: ModelEthnicity;
  onEthnicityChange: (ethnicity: ModelEthnicity) => void;
  selectedBodyType: ModelBodyType;
  onBodyTypeChange: (bodyType: ModelBodyType) => void;
  creativeDetails: string;
  onCreativeDetailsChange: (details: string) => void;
  customModelImage: string | null;
  onCustomModelImageChange: (file: File) => void;
}

const GENDERS: ModelGender[] = ['Male', 'Female', 'Unisex'];
const AGES: ModelAge[] = ['18-25', '26-35', '36-45', '46+'];
const ETHNICITIES: ModelEthnicity[] = ['Any', 'Asian', 'Black', 'Caucasian', 'Hispanic', 'Middle Eastern', 'South Asian', 'Mixed'];
const BODY_TYPES: ModelBodyType[] = ['Any', 'Slim', 'Athletic', 'Average', 'Curvy', 'Plus-size'];

const ModelOptions: React.FC<ModelOptionsProps> = ({
  selectedGender,
  onGenderChange,
  selectedAge,
  onAgeChange,
  selectedEthnicity,
  onEthnicityChange,
  selectedBodyType,
  onBodyTypeChange,
  creativeDetails,
  onCreativeDetailsChange,
  customModelImage,
  onCustomModelImageChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onCustomModelImageChange(e.target.files[0]);
    }
  };

  const getButtonClass = (gender: ModelGender) => {
    const base = "flex-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 text-center truncate";
    if (selectedGender === gender) {
      return `${base} bg-cyan-500 text-white shadow-[0_0_15px_-5px_rgba(6,182,212,0.5)]`;
    }
    return `${base} bg-gray-900 border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200`;
  };

  const selectClass = "w-full p-2 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none text-xs text-gray-200 cursor-pointer appearance-none";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Gender</label>
          <div className="flex gap-2 p-1 bg-gray-900/50 rounded-xl border border-gray-700/50">
            {GENDERS.map(gender => (
              <button key={gender} onClick={() => onGenderChange(gender)} className={getButtonClass(gender)}>
                {gender}
              </button>
            ))}
          </div>
        </div>
        
        <div className="space-y-2">
          <label htmlFor="age-select" className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Age Range</label>
          <div className="relative">
            <select id="age-select" value={selectedAge} onChange={(e) => onAgeChange(e.target.value as ModelAge)} className={selectClass}>
              {AGES.map(age => <option key={age} value={age}>{age}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="ethnicity-select" className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Ethnicity</label>
          <div className="relative">
            <select id="ethnicity-select" value={selectedEthnicity} onChange={(e) => onEthnicityChange(e.target.value as ModelEthnicity)} className={selectClass}>
              {ETHNICITIES.map(ethnicity => <option key={ethnicity} value={ethnicity}>{ethnicity}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="body-type-select" className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Body Type</label>
          <div className="relative">
            <select id="body-type-select" value={selectedBodyType} onChange={(e) => onBodyTypeChange(e.target.value as ModelBodyType)} className={selectClass}>
              {BODY_TYPES.map(bodyType => <option key={bodyType} value={bodyType}>{bodyType}</option>)}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>
        </div>
      </div>
      
      <div className="pt-2">
        <label htmlFor="creative-prompt" className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Creative Details (Optional)</label>
        <textarea
          id="creative-prompt"
          value={creativeDetails}
          onChange={(e) => onCreativeDetailsChange(e.target.value)}
          placeholder="e.g., short blonde hair, editorial look"
          className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:outline-none text-xs text-gray-200 resize-none"
          rows={2}
        />
      </div>

       <div className="pt-2">
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Reference Model</label>
         <div 
            onClick={() => fileInputRef.current?.click()}
            className="border border-gray-700 bg-gray-900/30 rounded-xl p-3 flex flex-row items-center gap-4 cursor-pointer hover:border-cyan-500 transition-colors"
          >
             <div className="w-12 h-12 bg-gray-900 border border-gray-700 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
               {customModelImage ? (
                  <img src={customModelImage} alt="Reference" className="w-full h-full object-cover" />
               ) : (
                  <UploadIcon className="w-5 h-5 text-gray-500" />
               )}
             </div>
             <div className="flex-grow">
               <p className="text-xs font-bold text-gray-300">{customModelImage ? 'Ref Loaded' : 'Upload Person Ref'}</p>
               <p className="text-[9px] text-gray-500 font-medium">Replicates this face</p>
             </div>
             <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*" 
            />
          </div>
      </div>
    </div>
  );
};

export default ModelOptions;
