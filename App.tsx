
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SceneId, PhotoshootImage, UploadedGarment, ModelGender, ModelAge, ModelEthnicity, ModelBodyType, User, UsageLimit, HistoryEntry } from './types';
import * as geminiService from './services/geminiService';
import * as authService from './services/authService';
import * as cloudDB from './services/supabaseService';
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
  const [usage, setUsage] = useState<UsageLimit>({ count: 0, lastReset: new Date().toISOString() });
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const syncAllUserData = useCallback(async (email: string) => {
    const cloudUsage = await cloudDB.syncUsageFromCloud(email);
    const usageKey = `usage_limit_${email}`;
    const historyKey = `history_${email}`;
    const savedUsage = localStorage.getItem(usageKey);
    const savedHistory = localStorage.getItem(historyKey);
    const now = new Date();
    
    let currentUsage: UsageLimit;

    if (cloudUsage) {
      currentUsage = { count: cloudUsage.count, lastReset: cloudUsage.last_reset };
    } else if (savedUsage) {
      currentUsage = JSON.parse(savedUsage);
    } else {
      currentUsage = { count: 0, lastReset: now.toISOString() };
    }

    const lastDate = new Date(currentUsage.lastReset).toDateString();
    if (now.toDateString() !== lastDate) {
      currentUsage = { count: 0, lastReset: now.toISOString() };
      cloudDB.updateUsageInCloud(email, 0, now.toISOString());
    }
    
    setUsage(currentUsage);
    localStorage.setItem(usageKey, JSON.stringify(currentUsage));

    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch { setHistory([]); }
    }
  }, []);

  useEffect(() => {
    if (user) {
      syncAllUserData(user.email);
    }
  }, [user, syncAllUserData]);

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

  const checkKey = useCallback(async () => {
    if (window.aistudio?.hasSelectedApiKey) {
      const active = await window.aistudio.hasSelectedApiKey();
      setHasKey(active);
      return active;
    }
    const envKey = !!process.env.API_KEY;
    setHasKey(envKey);
    return envKey;
  }, []);

  useEffect(() => {
    checkKey();
  }, [checkKey]);

  useEffect(() => {
    if (window.google) {
      authService.initGoogleAuth(GOOGLE_CLIENT_ID, (u) => {
        setUser(u);
        localStorage.setItem('auth_user', JSON.stringify(u));
        syncAllUserData(u.email);
      });
      if (!user) authService.renderGoogleButton('google-signin-container');
    }
  }, [user, syncAllUserData]);

  const handleGenerate = async () => {
    if (!user) {
      setError("Please sign in to generate images.");
      return;
    }

    const remaining = DAILY_LIMIT - usage.count;
    if (remaining <= 0) {
      setError("Daily limit reached.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const modelPrompt = `${selectedGender}, age ${selectedAge}, ${selectedEthnicity} ethnicity, ${selectedBodyType} build. ${creativeDetails}`;
      const poseDescriptions = POSES.filter(p => selectedPoses.includes(p.id)).map(p => p.description);
      
      const images = await geminiService.generatePhotoshoot(
        garments[0].preview,
        garments[0].analysis!,
        selectedSceneId,
        modelPrompt,
        poseDescriptions,
        (idx, total) => setLoadingMessage(`Crafting View ${idx}/${total}...`)
      );

      if (images.length > 0) {
        setGeneratedImages(images);
        const newCount = usage.count + images.length;
        const newUsage = { ...usage, count: newCount };
        setUsage(newUsage);
        localStorage.setItem(`usage_limit_${user.email}`, JSON.stringify(newUsage));
        await cloudDB.updateUsageInCloud(user.email, newCount, usage.lastReset);
        
        const newEntry: HistoryEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          garmentPreview: garments[0].preview, 
          images: images,
          details: modelPrompt
        };
        const newHistory = [newEntry, ...history].slice(0, 15);
        setHistory(newHistory);
        localStorage.setItem(`history_${user.email}`, JSON.stringify(newHistory));
      }
    } catch (e: any) {
      if (e.message === "RESELECT_KEY") {
        setError("Your API key session expired. Please re-select your key.");
        window.aistudio?.openSelectKey();
      } else {
        setError("Production interrupted. Ensure you have a paid API key.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const togglePose = (poseId: string) => {
    const remaining = DAILY_LIMIT - usage.count;
    setSelectedPoses(prev => {
      if (prev.includes(poseId)) {
        return prev.length > 1 ? prev.filter(i => i !== poseId) : prev;
      } else {
        if (prev.length >= 5) return prev;
        if (prev.length + 1 > remaining) {
          setError(`Limit reached. ${remaining} credits left.`);
          return prev;
        }
        return [...prev, poseId];
      }
    });
  };

  const isOverLimit = usage.count >= DAILY_LIMIT;
  const willExceedLimit = (usage.count + selectedPoses.length) > DAILY_LIMIT;

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-4xl font-black text-white mb-6 uppercase italic tracking-tighter">API KEY REQUIRED</h2>
        <p className="text-gray-500 mb-8 max-w-md uppercase text-[10px] tracking-widest font-bold">Paid API key required for Gemini 3 Pro Vision.</p>
        <button onClick={() => window.aistudio?.openSelectKey()} className="bg-cyan-500 hover:bg-cyan-400 text-white font-black py-4 px-10 rounded-2xl shadow-2xl uppercase tracking-widest text-xs transition-all hover:scale-105 active:scale-95">Select API Key</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-cyan-500/30">
      <Header 
        user={user} 
        usage={usage} 
        onSignOut={() => { authService.signOutGoogle(); setUser(null); localStorage.removeItem('auth_user'); }} 
        onSignIn={() => {}} 
        onUpgrade={() => {}} 
      />
      
      <main className="container mx-auto px-4 py-12 max-w-6xl">
        {isLoading && <Loader message={loadingMessage} />}
        
        {error && (
          <div className="mb-8 bg-red-500/10 border border-red-500/40 p-5 rounded-[2rem] text-red-400 text-[11px] font-black uppercase tracking-widest flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="bg-red-500/20 px-4 py-1.5 rounded-xl hover:bg-red-500/40">Dismiss</button>
          </div>
        )}

        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-8xl font-black text-white mb-6 tracking-tighter uppercase italic">STUDIO<span className="text-cyan-500 text-glow">PRO</span></h2>
            <p className="text-gray-500 uppercase tracking-[0.5em] text-[11px] mb-14 font-bold max-w-sm leading-relaxed">Identity-Synced Professional Fashion Production</p>
            <div id="google-signin-container" className="scale-125 transition-all" />
          </div>
        ) : (
          <div className="space-y-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
              <div className="space-y-10">
                <div className="flex justify-between items-end border-b border-gray-800 pb-6">
                  <h2 className="text-5xl font-black uppercase tracking-tighter italic">Moodboard</h2>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[11px] font-black uppercase text-cyan-500 hover:text-cyan-300 transition-colors tracking-[0.2em]">+ Add Reference</button>
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && (async () => {
                    const files = Array.from(e.target.files!);
                    const newGarments = await Promise.all(files.map(async file => ({
                      id: `${file.name}-${Date.now()}`,
                      file,
                      preview: await fileToBase64(file),
                      analysis: null,
                      isLoading: true,
                    })));
                    setGarments(newGarments);
                    
                    if (newGarments.length > 0) {
                      try {
                        const analysis = await geminiService.analyzeGarment(newGarments[0].preview);
                        setGarments(prev => prev.map(g => g.id === newGarments[0].id ? { ...g, analysis, isLoading: false } : g));
                      } catch (err: any) {
                        setGarments(prev => prev.map(g => g.id === newGarments[0].id ? { ...g, isLoading: false, error: "Analysis failed" } : g));
                        if (err.message === "RESELECT_KEY") window.aistudio?.openSelectKey();
                      }
                    }
                  })()} className="hidden" accept="image/*" />
                </div>
                
                {garments.length === 0 ? (
                  <ImageUploader onImageUpload={async (files) => {
                    const newGarments = await Promise.all(files.map(async file => ({
                      id: `${file.name}-${Date.now()}`,
                      file,
                      preview: await fileToBase64(file),
                      analysis: null,
                      isLoading: true,
                    })));
                    setGarments(newGarments);
                    if (newGarments.length > 0) {
                      try {
                        const analysis = await geminiService.analyzeGarment(newGarments[0].preview);
                        setGarments(prev => prev.map(g => g.id === newGarments[0].id ? { ...g, analysis, isLoading: false } : g));
                      } catch (err: any) {
                        setGarments(prev => prev.map(g => g.id === newGarments[0].id ? { ...g, isLoading: false, error: "Analysis failed" } : g));
                      }
                    }
                  }} />
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {garments.map(g => (
                      <div key={g.id} className="relative aspect-[3/4] rounded-[2.5rem] overflow-hidden border border-gray-800 bg-black shadow-2xl">
                        <img src={g.preview} className="w-full h-full object-cover" />
                        {g.isLoading && (
                          <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-md">
                            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                        <button onClick={() => setGarments([])} className="absolute top-6 right-6 bg-black/50 text-white w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-500">×</button>
                      </div>
                    ))}
                  </div>
                )}
                
                {history.length > 0 && (
                  <div className="pt-10 space-y-8">
                    <h3 className="text-[12px] font-black text-gray-400 uppercase tracking-[0.4em] px-2 flex items-center gap-3">
                      <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></span>
                      Studio Vault
                    </h3>
                    <div className="grid grid-cols-1 gap-12">
                      {history.map(entry => (
                        <div key={entry.id} className="group/session">
                           <div className="flex justify-between items-center px-2 mb-4">
                              <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{new Date(entry.timestamp).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
                              <span className="text-[9px] font-black text-cyan-500/60 uppercase tracking-widest group-hover/session:text-cyan-400 transition-colors">{entry.images.length} Perspectives</span>
                           </div>
                           <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x px-1">
                            {entry.images.map((img, idx) => (
                              <button 
                                key={img.id} 
                                onClick={() => {
                                  setGeneratedImages(entry.images);
                                  document.getElementById('production-output')?.scrollIntoView({ behavior: 'smooth' });
                                }} 
                                className="flex-shrink-0 w-36 aspect-[3/4] rounded-[2rem] overflow-hidden border border-gray-800 hover:border-cyan-500 transition-all bg-gray-900 snap-start shadow-xl hover:shadow-cyan-500/10 hover:-translate-y-1 duration-500"
                              >
                                <img src={img.src} className="w-full h-full object-cover" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gray-900/30 border border-gray-800/40 p-10 rounded-[3.5rem] space-y-10 shadow-3xl backdrop-blur-3xl h-fit sticky top-28">
                <ModelOptions 
                  selectedGender={selectedGender} onGenderChange={setSelectedGender} 
                  selectedAge={selectedAge} onAgeChange={setSelectedAge} 
                  selectedEthnicity={selectedEthnicity} onEthnicityChange={setSelectedEthnicity} 
                  selectedBodyType={selectedBodyType} onBodyTypeChange={setSelectedBodyType} 
                  creativeDetails={creativeDetails} onCreativeDetailsChange={setCreativeDetails}
                  customModelImage={null} onCustomModelImageChange={() => {}}
                />
                
                <div className="space-y-6">
                  <div className="flex justify-between items-center px-1">
                    <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Shoot Profile</h3>
                    <span className="text-[10px] font-black text-cyan-500 uppercase bg-cyan-500/10 px-3 py-1 rounded-full">{selectedPoses.length}/5 Selected</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {POSES.map(p => (
                      <button 
                        key={p.id} 
                        onClick={() => togglePose(p.id)} 
                        className={`px-5 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${selectedPoses.includes(p.id) ? 'bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-gray-950 border-gray-800 text-gray-600 hover:border-gray-500'}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-[11px] font-black text-gray-500 uppercase tracking-widest px-1">Atmosphere</h3>
                  <SceneSelector selectedSceneId={selectedSceneId} onSelectScene={setSelectedSceneId} customBackgroundImage={null} onCustomBackgroundChange={() => {}} />
                </div>

                <div className="pt-6 space-y-6">
                  <button 
                    onClick={handleGenerate} 
                    disabled={isLoading || garments.length === 0 || isOverLimit || willExceedLimit || !garments[0]?.analysis} 
                    className={`w-full font-black py-7 rounded-[2rem] shadow-2xl uppercase tracking-[0.5em] text-[11px] italic transition-all ${
                      (isOverLimit || willExceedLimit)
                      ? 'bg-gray-800/50 text-gray-700 cursor-not-allowed border border-gray-800' 
                      : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/30'
                    }`}
                  >
                    {isOverLimit ? 'Daily Limit Reached' : willExceedLimit ? 'Insufficient Credits' : 'Launch Production'}
                  </button>
                  <div className="flex justify-between items-center px-6">
                    <div className="flex flex-col">
                      <p className="text-[10px] text-gray-600 uppercase font-black tracking-[0.2em]">Balance</p>
                      <p className="text-base font-black text-cyan-500 tracking-tighter">{Math.max(0, DAILY_LIMIT - usage.count)} Remaining</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-600 uppercase font-black tracking-[0.2em]">Account Status</p>
                      <p className="text-[11px] font-bold text-gray-400 truncate max-w-[140px] lowercase">{user.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {generatedImages.length > 0 && (
              <div id="production-output" className="pt-20 border-t border-gray-800 animate-in fade-in slide-in-from-bottom-12 duration-1000">
                <h2 className="text-5xl font-black uppercase tracking-tighter mb-16 text-center italic">Final <span className="text-cyan-500">Renders</span></h2>
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
            } catch (err: any) {
              if (err.message === "RESELECT_KEY") window.aistudio?.openSelectKey();
              setError("Refinement failed.");
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
