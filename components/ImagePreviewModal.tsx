
import React from 'react';
import { PhotoshootImage } from '../types';
import { DownloadIcon } from './icons/FeatureIcons';

interface ImagePreviewModalProps {
  image: PhotoshootImage;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasMultiple: boolean;
  isPro?: boolean;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ image, onClose, onNext, onPrev, hasMultiple }) => {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = image.src;
    link.download = `studio-ai-full-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className="fixed inset-0 z-[60] bg-black/98 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 text-white/50 hover:text-white z-10 p-3 bg-white/5 rounded-full transition-all border border-white/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {hasMultiple && (
          <>
            <button 
              onClick={onPrev}
              className="absolute left-0 lg:-left-24 text-white/20 hover:text-cyan-500 p-4 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button 
              onClick={onNext}
              className="absolute right-0 lg:-right-24 text-white/20 hover:text-cyan-500 p-4 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        <div className="relative max-h-full max-w-full">
          <img 
            src={image.src} 
            alt="Fashion Preview" 
            className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl animate-scale-in"
          />
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-gray-900/60 backdrop-blur-2xl px-8 py-4 rounded-3xl border border-white/10 shadow-2xl">
          <div className="flex flex-col">
             <p className="text-white font-black text-xs uppercase tracking-[0.2em]">Studio AI</p>
             <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Ultra-HD Master</p>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <button 
            onClick={handleDownload}
            className="flex items-center gap-2 transition-all font-black text-[10px] uppercase tracking-widest text-cyan-400 hover:text-cyan-300"
          >
            <DownloadIcon className="w-4 h-4" />
            Save High-Res
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
