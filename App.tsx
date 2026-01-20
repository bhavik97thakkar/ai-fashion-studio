
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SceneId, PhotoshootImage, UploadedGarment, ModelGender, ModelAge, ModelEthnicity, ModelBodyType, User, UsageLimit, HistoryEntry } from './types';
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
const DAILY_LIMIT = 5;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [hasKey, setHasKey] = useState(false);
  
  // Persistent Usage Logic - Resets based on date string
  const [usage, setUsage] = useState<UsageLimit>(() => {
    const saved = localStorage.getItem('usage_limit');
    const now = new Date();
    if (saved) {
      const parsed = JSON.parse(saved);
      const lastDate = new Date(parsed.lastReset).toDateString();
      if (now.toDateString() !== lastDate) {
        return { count: 0, lastReset: now.toISOString() };
      }
      return parsed;
    }
    return { count: 0, lastReset: now.toISOString() };
  });

  // Persistent History Logic
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem('photoshoot_history');
    return saved ? JSON.parse(saved) : [];
  });

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

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('usage_limit', JSON.stringify(usage));
  }, [usage]);

  useEffect(() => {
    localStorage.setItem('photoshoot_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
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
        setHasKey(true); // Optimistic proceed
      } catch (err) {
        setError("Could not open API Key selector.");
      }
    } else {
      setError("AI Studio environment not detected.");
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
            setError("API Key invalid. Please re-select.");
          } else {
            setError("Analysis failed. Try again.");
          }
          setGarments(prev => prev.map(item => item.id === g.id ? { ...item, isLoading: false } : item));
        }
      }
    };
    analyze();
  }, [garments]);

  const handleGenerate = async () => {
    if (usage.count >= DAILY_LIMIT) {
      setError("Your daily limit of 5 shoots is reached. Resets at midnight.");
      return;
    }
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
        (idx, total) => setLoadingMessage(`Crafting Model Shot ${idx} of ${total}...`)
      );

      setGeneratedImages(images);
      
      // Update Usage and History
      setUsage(prev => ({ ...prev, count: prev.count + 1 }));
      
      const newHistoryEntry: HistoryEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        garmentPreview: garments[0].preview,
        images: images,
        details: modelPrompt
      };
      
      setHistory(prev => [newHistoryEntry, ...prev].slice(0, 30));

    } catch (e: any) {
      if (e.message === "RESELECT_KEY") {
        setHasKey(false);
        setError("Please re-select your API key from a paid project.");
      } else {
        setError("Generation failed. Check your billing or prompt.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setGeneratedImages(entry.images);
    // Smooth scroll to results
    const resultsSection = document.getElementById('production-output');
    if (resultsSection) {
      resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-5xl font-black text-white mb-6 tracking-tighter uppercase">Activate <span className="text-cyan-500">PRO</span></h2>
        <p className="text-gray-400 max-w-md mb-8 leading-relaxed">Select a paid API key to access high-resolution model generation.</p>
        <button onClick={handleSelectKey} className="bg-cyan-500 hover:bg-cyan-400 text-white font-black py-4 px-10 rounded-2xl shadow-2xl uppercase tracking-widest text-xs transition-all">Select API Key</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Header 
        user={user} 
        usage={usage} 
        onSignIn={() => {}} 
        onSignOut={() => { authService.signOutGoogle(); setUser(null); }} 
        onUpgrade={() => {}} 
      />
      
      <main className="container mx-auto px-4 py-12 max-w-6xl">
        {isLoading && <Loader message={loadingMessage} />}
        
        {error && (
          <div className="mb-8 bg-red-900/20 border border-red-500/30 p-4 rounded-2xl text-red-400 text-xs flex justify-between items-center animate-pulse">
            <span className="font-bold">{error}</span>
            <button onClick={() => setError(null)} className="font-black uppercase text-[10px] bg-red-500/20 px-3 py-1 rounded-lg">Dismiss</button>
          </div>
        )}

        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-7xl font-black text-white mb-4 tracking-tighter uppercase italic">STUDIO<span className="text-cyan-500">PRO</span></h2>
            <p className="text-gray-500 text-[11px] font-black uppercase tracking-[0.4em] mb-12">Next-Gen Fashion Production</p>
            <div id="google-signin-container" className="scale-110" />
          </div>
        ) : (
          <div className="space-y-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-8">
                <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                  <h2 className="text-4xl font-black uppercase tracking-tighter">Moodboard</h2>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase text-cyan-500 hover:text-cyan-400 transition-colors">+ Add Garment</button>
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

                {/* Production History Carousel */}
                {history.length > 0 && (
                  <div className="pt-8 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Recent Productions</h3>
                      <span className="text-[9px] text-gray-700 font-bold">{history.length} Saved</span>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide snap-x">
                      {history.map(entry => (
                        <button 
                          key={entry.id} 
                          onClick={() => loadFromHistory(entry)}
                          className="flex-shrink-0 w-24 group relative snap-start"
                        >
                          <div className="aspect-[3/4] rounded-xl overflow-hidden border border-gray-800 group-hover:border-cyan-500/50 transition-all shadow-lg">
                            <img src={entry.garmentPreview} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                               <span className="text-[7px] font-black uppercase text-white truncate w-full">{new Date(entry.timestamp).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
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

                <div className="space-y-3">
                  <button 
                    onClick={handleGenerate} 
                    disabled={isLoading || garments.length === 0 || usage.count >= DAILY_LIMIT} 
                    className={`w-full font-black py-6 rounded-3xl shadow-2xl uppercase tracking-[0.3em] text-[11px] transition-all active:scale-[0.98] ${
                      usage.count >= DAILY_LIMIT 
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' 
                      : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/10'
                    }`}
                  >
                    {usage.count >= DAILY_LIMIT ? 'Daily Limit Exhausted' : 'Start Production'}
                  </button>
                  <div className="flex justify-between items-center px-2">
                    <p className="text-[9px] text-gray-600 uppercase font-black tracking-widest">
                      {DAILY_LIMIT - usage.count} Credits Remaining
                    </p>
                    <p className="text-[8px] text-gray-700 font-bold">Reset at Midnight</p>
                  </div>
                </div>
              </div>
            </div>

            {generatedImages.length > 0 && (
              <div id="production-output" className="pt-12 border-t border-gray-800 scroll-mt-24">
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-8 text-center">Final Renders</h2>
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
              setError("Refinement failed. Try a simpler description.");
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
