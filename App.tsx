
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SceneId, PhotoshootImage, UploadedGarment, ModelGender, ModelAge, ModelEthnicity, ModelBodyType, User } from './types';
import * as geminiService from './services/geminiService';
import * as authService from './services/authService';
import { fileToBase64 } from './utils/fileUtils';
import { POSES } from './constants';

import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import SceneSelector from './components/SceneSelector';
import PhotoshootGallery from './components/PhotoshootGallery';
import ImageEditor from './components/ImageEditor';
import Loader from './components/Loader';
import ModelOptions from './components/ModelOptions';

const GOOGLE_CLIENT_ID = "309212162577-8tjqu29ece6h0dv9q0bh5h8h80ki0mgn.apps.googleusercontent.com";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [hasKey, setHasKey] = useState(false);
  const [garments, setGarments] = useState<UploadedGarment[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<SceneId>(SceneId.Auto);
  const [selectedGender, setSelectedGender] = useState<ModelGender>('Female');
  const [selectedAge, setSelectedAge] = useState<ModelAge>('18-25');
  const [selectedEthnicity, setSelectedEthnicity] = useState<ModelEthnicity>('Any');
  const [selectedBodyType, setSelectedBodyType] = useState<ModelBodyType>('Any');
  const [selectedPoses, setSelectedPoses] = useState<string[]>(['front']);
  const [creativeDetails, setCreativeDetails] = useState<string>('');
  const [generatedImages, setGeneratedImages] = useState<PhotoshootImage[]>([]);
  const [editingImage, setEditingImage] = useState<PhotoshootImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if API Key is already selected on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // If not in the specialized environment, we check if process.env.API_KEY is present
        setHasKey(!!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem('auth_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    if (window.google) {
      authService.initGoogleAuth(GOOGLE_CLIENT_ID, setUser);
      if (!user) authService.renderGoogleButton('google-signin-container');
    }
  }, [user]);

  const handleSelectKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        // Optimistically proceed as per guidelines to avoid race condition
        setHasKey(true);
      } catch (err) {
        console.error("Failed to open key selector", err);
        setError("Could not open API Key selector.");
      }
    } else {
      setError("AI Studio environment not detected. Ensure you are running in the correct sandbox.");
    }
  };

  const handleImageUpload = useCallback(async (files: File[]) => {
    if (!user) return;
    setError(null);
    const newGarments = await Promise.all(files.map(async file => ({
      id: `${file.name}-${Date.now()}`,
      file,
      preview: await fileToBase64(file),
      analysis: null,
      isLoading: true,
    })));
    setGarments(prev => [...prev, ...newGarments]);
  }, [user]);

  useEffect(() => {
    const analyze = async () => {
      const pending = garments.filter(g => g.isLoading && !g.analysis);
      for (const g of pending) {
        try {
          const analysis = await geminiService.analyzeGarment(g.preview);
          setGarments(prev => prev.map(item => item.id === g.id ? { ...item, analysis, isLoading: false } : item));
        } catch (e: any) {
          if (e.message === "RESELECT_KEY") {
            setHasKey(false);
            setError("API Key invalid or not found. Please re-select a key from a paid project.");
          } else {
            setError("Garment analysis failed. Check your billing status.");
          }
          setGarments(prev => prev.map(item => item.id === g.id ? { ...item, isLoading: false } : item));
        }
      }
    };
    analyze();
  }, [garments]);

  const handleGenerate = async () => {
    if (garments.length === 0 || !garments[0].analysis) return;
    setIsLoading(true);
    setError(null);
    try {
      const modelPrompt = `${selectedGender}, age ${selectedAge}, ${selectedEthnicity} ethnicity, ${selectedBodyType} build. ${creativeDetails}`;
      const poseDescriptions = POSES.filter(p => selectedPoses.includes(p.id)).map(p => p.description);
      
      const images = await geminiService.generatePhotoshoot(
        garments[0].preview,
        garments[0].analysis,
        selectedSceneId,
        modelPrompt,
        poseDescriptions,
        (idx, total) => setLoadingMessage(`Crafting Frame ${idx} of ${total}...`)
      );
      setGeneratedImages(images);
    } catch (e: any) {
      if (e.message === "RESELECT_KEY") {
        setHasKey(false);
        setError("Please re-select a valid API key from a paid project.");
      } else {
        setError("Photoshoot generation failed. Ensure your billing is active.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-8 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-full animate-pulse">
           <svg className="w-12 h-12 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" />
           </svg>
        </div>
        <h2 className="text-5xl font-black text-white mb-6 tracking-tighter uppercase">Activate <span className="text-cyan-500">PRO</span></h2>
        <p className="text-gray-400 max-w-md mb-8 leading-relaxed font-medium">To access Gemini 3 Pro and high-resolution imaging, you must select an API key from a <span className="text-white">paid GCP project</span> with billing enabled.</p>
        <button onClick={handleSelectKey} className="bg-cyan-500 hover:bg-cyan-400 text-white font-black py-4 px-10 rounded-2xl shadow-2xl uppercase tracking-widest text-xs transition-all active:scale-95">Select API Key</button>
        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="mt-6 text-gray-600 text-[10px] uppercase font-bold hover:text-cyan-500 transition-colors">Billing Documentation</a>
        {error && <p className="mt-8 text-red-500 text-xs font-bold uppercase">{error}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Header user={user} usage={{count: 5, lastReset: ''}} onSignIn={() => {}} onSignOut={() => { authService.signOutGoogle(); setUser(null); }} onUpgrade={() => {}} />
      
      <main className="container mx-auto px-4 py-12 max-w-6xl">
        {isLoading && <Loader message={loadingMessage} />}
        {error && (
          <div className="mb-8 bg-red-900/20 border border-red-500/30 p-4 rounded-2xl text-red-400 text-xs flex justify-between items-center animate-shake">
            <span className="font-bold">{error}</span>
            <button onClick={() => setError(null)} className="font-black uppercase text-[10px] bg-red-500/20 px-3 py-1 rounded-lg">Dismiss</button>
          </div>
        )}

        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-7xl font-black text-white mb-4 tracking-tighter uppercase italic">STUDIO<span className="text-cyan-500">PRO</span></h2>
            <p className="text-gray-500 text-[11px] font-black uppercase tracking-[0.4em] mb-12">Next-Gen Fashion Photography</p>
            <div id="google-signin-container" className="scale-110" />
          </div>
        ) : (
          <div className="space-y-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-8">
                <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                  <h2 className="text-4xl font-black uppercase tracking-tighter">Moodboard</h2>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase text-cyan-500 hover:text-cyan-400 transition-colors">+ Upload Garment</button>
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && handleImageUpload(Array.from(e.target.files))} className="hidden" accept="image/*" />
                </div>
                
                {garments.length === 0 ? (
                  <ImageUploader onImageUpload={handleImageUpload} />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {garments.map(g => (
                      <div key={g.id} className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-gray-800 group bg-black shadow-xl">
                        <img src={g.preview} className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-700" />
                        {g.isLoading && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                        <button onClick={() => setGarments([])} className="absolute top-4 right-4 bg-black/50 text-white w-8 h-8 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-900/40 border border-gray-800/50 p-10 rounded-[3rem] space-y-10 shadow-2xl backdrop-blur-3xl">
                <ModelOptions 
                  selectedGender={selectedGender} onGenderChange={setSelectedGender} 
                  selectedAge={selectedAge} onAgeChange={setSelectedAge} 
                  selectedEthnicity={selectedEthnicity} onEthnicityChange={setSelectedEthnicity} 
                  selectedBodyType={selectedBodyType} onBodyTypeChange={setSelectedBodyType} 
                  creativeDetails={creativeDetails} onCreativeDetailsChange={setCreativeDetails}
                  customModelImage={null} onCustomModelImageChange={() => {}}
                />
                
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Pose Architecture</h3>
                  <div className="flex flex-wrap gap-2">
                    {POSES.map(p => (
                      <button key={p.id} onClick={() => setSelectedPoses(prev => prev.includes(p.id) ? (prev.length > 1 ? prev.filter(i => i !== p.id) : prev) : [...prev, p.id])} className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${selectedPoses.includes(p.id) ? 'bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-600'}`}>{p.label}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Atmosphere</h3>
                  <SceneSelector selectedSceneId={selectedSceneId} onSelectScene={setSelectedSceneId} customBackgroundImage={null} onCustomBackgroundChange={() => {}} />
                </div>

                <button onClick={handleGenerate} disabled={isLoading || garments.length === 0} className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-gray-800 text-white font-black py-6 rounded-3xl shadow-2xl shadow-cyan-500/10 uppercase tracking-[0.3em] text-[11px] transition-all active:scale-[0.98]">Start Production</button>
              </div>
            </div>

            {generatedImages.length > 0 && (
              <div className="pt-12 border-t border-gray-800">
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-8 text-center">Finished Renders</h2>
                <PhotoshootGallery images={generatedImages} onEditRequest={setEditingImage} isPro={true} />
              </div>
            )}
          </div>
        )}
      </main>
      
      {editingImage && (
        <ImageEditor 
          image={editingImage} 
          onClose={() => setEditingImage(null)} 
          isLoading={isLoading}
          onEdit={async (p) => {
            setIsLoading(true);
            try {
              const src = await geminiService.editImage(editingImage.src, p);
              setGeneratedImages(prev => prev.map(img => img.id === editingImage.id ? { ...img, src } : img));
              setEditingImage(null);
            } catch (e) {
              setError("Edit failed. Describe the change differently.");
            } finally {
              setIsLoading(false);
            }
          }} 
        />
      )}
    </div>
  );
};

export default App;
