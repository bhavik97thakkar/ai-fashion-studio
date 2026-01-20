
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SceneId, PhotoshootImage, UploadedGarment, GarmentAnalysis, ModelGender, ModelAge, ModelEthnicity, ModelBodyType, User, UsageLimit } from './types';
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

const DAILY_FREE_LIMIT = 5;
const GOOGLE_CLIENT_ID = "309212162577-8tjqu29ece6h0dv9q0bh5h8h80ki0mgn.apps.googleusercontent.com";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [usage, setUsage] = useState<UsageLimit>(() => {
    const saved = localStorage.getItem('usage_limit');
    const today = new Date().toDateString();
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.lastReset === today) return parsed;
    }
    return { count: DAILY_FREE_LIMIT, lastReset: today };
  });

  const [garments, setGarments] = useState<UploadedGarment[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<SceneId>(SceneId.Auto);
  const [selectedGender, setSelectedGender] = useState<ModelGender>('Female');
  const [selectedAge, setSelectedAge] = useState<ModelAge>('18-25');
  const [selectedEthnicity, setSelectedEthnicity] = useState<ModelEthnicity>('Any');
  const [selectedBodyType, setSelectedBodyType] = useState<ModelBodyType>('Any');
  const [selectedPoses, setSelectedPoses] = useState<string[]>(['front']);
  const [creativeDetails, setCreativeDetails] = useState<string>('');
  const [customBackgroundImage, setCustomBackgroundImage] = useState<string | null>(null);
  const [customModelImage, setCustomModelImage] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<PhotoshootImage[]>([]);
  const [editingImage, setEditingImage] = useState<PhotoshootImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('usage_limit', JSON.stringify(usage));
  }, [usage]);

  useEffect(() => {
    if (user) localStorage.setItem('auth_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    if ((window as any).google) {
      authService.initGoogleAuth(GOOGLE_CLIENT_ID, setUser);
      if (!user) authService.renderGoogleButton('google-signin-container');
    }
  }, [user]);

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
      if (pending.length === 0) return;
      setIsLoading(true);
      setLoadingMessage('Processing assets...');
      for (const g of pending) {
        try {
          const analysis = await geminiService.analyzeGarment(g.preview);
          setGarments(prev => prev.map(item => item.id === g.id ? { ...item, analysis, isLoading: false } : item));
        } catch (e: any) {
          if (e.message === "QUOTA_EXCEEDED") {
            setError("Google Quota Error: Ensure your Google Cloud Project has Billing enabled. Even the free tier requires an active billing account for many regions.");
          } else {
            setError(e.message === "AUTH_ERROR" ? "Missing or invalid API Key." : "Analysis failed.");
          }
          setGarments(prev => prev.map(item => item.id === g.id ? { ...item, isLoading: false } : item));
        }
      }
      setIsLoading(false);
    };
    analyze();
  }, [garments]);

  const handleGenerate = async () => {
    if (usage.count < selectedPoses.length) {
      setError("Daily limit reached.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setLoadingMessage('Directing photoshoot...');
      const modelPrompt = await geminiService.enhanceModelPrompt(selectedGender, selectedAge, selectedEthnicity, selectedBodyType, creativeDetails);
      const items = await geminiService.generatePhotoshoot(
        garments.filter(g => g.analysis).map(g => ({ analysis: g.analysis!, base64GarmentImage: g.preview })),
        selectedSceneId, selectedGender, modelPrompt,
        (p, t) => setLoadingMessage(`Frame ${p} of ${t}...`),
        customBackgroundImage, customModelImage,
        POSES.filter(p => selectedPoses.includes(p.id)).map(p => p.description)
      );
      if (items.length === 0) {
        setError("Generation produced no images. Note: Text-to-Image generation in Gemini often requires a Paid Billing account.");
      } else {
        setGeneratedImages(items);
        setUsage(prev => ({ ...prev, count: Math.max(0, prev.count - selectedPoses.length) }));
      }
    } catch (e: any) {
      if (e.message === "QUOTA_EXCEEDED") {
        setError("API Quota limit reached (Limit: 0). You must link a billing account to your Google Cloud project to use image features.");
      } else if (e.message === "IMAGE_MODALITY_UNAVAILABLE") {
        setError("Image generation is not enabled for this API Key. Please use a key from a project with billing enabled.");
      } else {
        setError("Generation failed. Check your API key permissions.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      <Header user={user} usage={usage} onSignIn={() => {}} onSignOut={() => setUser(null)} onUpgrade={() => {}} />
      
      <main className="container mx-auto px-4 py-12 max-w-6xl">
        {isLoading && <Loader message={loadingMessage} />}
        {error && (
          <div className="mb-8 bg-red-500/10 border border-red-500/20 p-6 rounded-[2rem] shadow-2xl backdrop-blur-md">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-red-400 text-[10px] font-black uppercase tracking-widest mb-2">System Error</p>
                <p className="text-white text-sm font-medium leading-relaxed max-w-2xl">{error}</p>
                <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-cyan-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">Setup Google Billing →</a>
              </div>
              <button onClick={() => setError(null)} className="text-red-500 font-bold p-2 text-xl hover:text-white transition-colors">×</button>
            </div>
          </div>
        )}

        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-7xl font-black text-white mb-4 tracking-tighter uppercase">STUDIO<span className="text-cyan-500">PRO</span></h2>
            <p className="text-gray-500 text-[11px] font-black uppercase tracking-[0.4em] mb-12">AI Fashion Photography</p>
            <div className="bg-gray-900/50 p-16 rounded-[4rem] border border-gray-800 shadow-2xl flex flex-col items-center gap-8 backdrop-blur-xl">
              <div id="google-signin-container" className="scale-110" />
            </div>
          </div>
        ) : (
          <div className="space-y-16">
            {garments.length === 0 ? (
              <ImageUploader onImageUpload={handleImageUpload} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <h2 className="text-4xl font-black uppercase tracking-tighter">Deck</h2>
                  <div className="grid grid-cols-3 gap-6">
                    {garments.map(g => (
                      <div key={g.id} className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-gray-800 shadow-2xl group">
                        <img src={g.preview} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" />
                        <button onClick={() => setGarments(prev => prev.filter(i => i.id !== g.id))} className="absolute top-4 right-4 bg-black/50 w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center font-bold">×</button>
                        {g.isLoading && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                      </div>
                    ))}
                    <button onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] border-2 border-dashed border-gray-800 rounded-3xl text-gray-800 hover:text-cyan-500 flex items-center justify-center text-5xl transition-all">+</button>
                    <input type="file" multiple ref={fileInputRef} onChange={(e) => e.target.files && handleImageUpload(Array.from(e.target.files))} className="hidden" accept="image/*" />
                  </div>
                </div>

                <div className="bg-gray-900/50 border border-gray-800 p-10 rounded-[3rem] space-y-10 shadow-2xl backdrop-blur-xl">
                  <ModelOptions selectedGender={selectedGender} onGenderChange={setSelectedGender} selectedAge={selectedAge} onAgeChange={setSelectedAge} selectedEthnicity={selectedEthnicity} onEthnicityChange={setSelectedEthnicity} selectedBodyType={selectedBodyType} onBodyTypeChange={setSelectedBodyType} creativeDetails={creativeDetails} onCreativeDetailsChange={setCreativeDetails} customModelImage={customModelImage} onCustomModelImageChange={(f) => fileToBase64(f).then(setCustomModelImage)} />
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Scene Architecture</h3>
                    <div className="flex flex-wrap gap-2">
                      {POSES.map(p => (
                        <button key={p.id} onClick={() => setSelectedPoses(prev => prev.includes(p.id) ? (prev.length > 1 ? prev.filter(i => i !== p.id) : prev) : [...prev, p.id])} className={`px-5 py-2 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${selectedPoses.includes(p.id) ? 'bg-cyan-500 border-cyan-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-600'}`}>{p.label}</button>
                      ))}
                    </div>
                    <SceneSelector selectedSceneId={selectedSceneId} onSelectScene={setSelectedSceneId} customBackgroundImage={customBackgroundImage} onCustomBackgroundChange={(f) => fileToBase64(f).then(setCustomBackgroundImage)} />
                  </div>
                  <button onClick={handleGenerate} disabled={isLoading} className="w-full bg-cyan-500 hover:bg-cyan-400 text-white font-black py-6 rounded-3xl shadow-2xl uppercase tracking-[0.3em] text-[11px] transition-all active:scale-95">Execute Render</button>
                </div>
              </div>
            )}
            {generatedImages.length > 0 && <PhotoshootGallery images={generatedImages} onEditRequest={setEditingImage} isPro={true} />}
          </div>
        )}
        {editingImage && <ImageEditor image={editingImage} onClose={() => setEditingImage(null)} onEdit={async (p) => { setIsLoading(true); try { const src = await geminiService.editImage(editingImage.src, p); setGeneratedImages(prev => prev.map(img => img.id === editingImage.id ? { ...img, src } : img)); setEditingImage(null); } catch(e) { setError("Edit failed."); } finally { setIsLoading(false); } }} isLoading={isLoading} />}
      </main>
    </div>
  );
};

export default App;
