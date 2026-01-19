
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { User, UploadedGarment } from './types';
import * as geminiService from './services/geminiService';
import * as authService from './services/authService';
import { fileToBase64 } from './utils/fileUtils';

import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import Loader from './components/Loader';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [garments, setGarments] = useState<UploadedGarment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creativeBriefs, setCreativeBriefs] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) localStorage.setItem('auth_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    if ((window as any).google) {
      authService.initGoogleAuth("309212162577-8tjqu29ece6h0dv9q0bh5h8h80ki0mgn.apps.googleusercontent.com", setUser);
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
    const process = async () => {
      const pending = garments.filter(g => g.isLoading && !g.analysis);
      if (pending.length === 0) return;
      
      for (const g of pending) {
        try {
          const analysis = await geminiService.analyzeGarment(g.preview);
          const brief = await geminiService.generateCreativeBrief(analysis);
          
          setGarments(prev => prev.map(item => item.id === g.id ? { ...item, analysis, isLoading: false } : item));
          setCreativeBriefs(prev => ({ ...prev, [g.id]: brief }));
        } catch (e: any) {
          setError(e.message === "QUOTA_EXCEEDED" ? "Google Free Tier Limit: Please link a billing account to your project to unlock full vision features." : "Processing failed.");
          setGarments(prev => prev.map(item => item.id === g.id ? { ...item, isLoading: false } : item));
        }
      }
    };
    process();
  }, [garments]);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      <Header user={user} usage={{count: 0, lastReset: ''}} onSignIn={() => {}} onSignOut={() => setUser(null)} onUpgrade={() => {}} />
      
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {error && (
          <div className="mb-8 bg-red-900/20 border border-red-500/30 p-4 rounded-2xl text-red-400 text-xs">
            {error}
          </div>
        )}

        {!user ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-5xl font-black mb-4">DIRECTOR<span className="text-cyan-500">AI</span></h2>
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-12">AI Fashion Stylist & Vision Lab</p>
            <div id="google-signin-container" />
          </div>
        ) : (
          <div className="space-y-12">
            {garments.length === 0 ? (
              <ImageUploader onImageUpload={handleImageUpload} />
            ) : (
              <div className="space-y-8">
                <div className="flex justify-between items-end border-b border-gray-800 pb-4">
                  <h2 className="text-2xl font-black uppercase">Collection Analysis</h2>
                  <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black uppercase text-cyan-500">+ Add Piece</button>
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && handleImageUpload(Array.from(e.target.files))} className="hidden" />
                </div>
                
                <div className="grid grid-cols-1 gap-12">
                  {garments.map(g => (
                    <div key={g.id} className="bg-gray-900/40 rounded-[2rem] border border-gray-800 p-8 flex flex-col md:flex-row gap-8">
                      <div className="w-full md:w-64 aspect-[3/4] rounded-2xl overflow-hidden bg-black flex-shrink-0">
                        <img src={g.preview} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-grow space-y-6">
                        {g.isLoading ? (
                          <div className="animate-pulse space-y-4">
                            <div className="h-4 bg-gray-800 rounded w-1/4"></div>
                            <div className="h-20 bg-gray-800 rounded"></div>
                          </div>
                        ) : g.analysis ? (
                          <>
                            <div>
                              <h3 className="text-cyan-500 text-[10px] font-black uppercase tracking-widest mb-1">Item Identity</h3>
                              <p className="text-2xl font-bold">{g.analysis.garmentType} <span className="text-gray-500 text-lg">({g.analysis.fabric})</span></p>
                            </div>
                            <div>
                              <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-2">Creative Direction Brief</h3>
                              <div className="bg-black/40 p-6 rounded-2xl text-sm text-gray-300 italic border border-gray-800/50 leading-relaxed">
                                {creativeBriefs[g.id]}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {g.analysis.colorPalette.map(c => (
                                <span key={c} className="px-3 py-1 bg-gray-800 rounded-full text-[9px] font-bold uppercase tracking-tight text-gray-400 border border-gray-700">{c}</span>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-gray-500 italic">Vision analysis failed for this item.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
