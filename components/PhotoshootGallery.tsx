
import React, { useState } from 'react';
import { PhotoshootImage } from '../types';
import { EditIcon, DownloadIcon } from './icons/FeatureIcons';
import ImagePreviewModal from './ImagePreviewModal';

interface PhotoshootGalleryProps {
  images: PhotoshootImage[];
  onEditRequest: (image: PhotoshootImage) => void;
  isPro?: boolean;
}

const ArrowLeftIcon: React.FC<{ className?: string }> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ArrowRightIcon: React.FC<{ className?: string }> = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const PhotoshootGallery: React.FC<PhotoshootGalleryProps> = ({ images, onEditRequest }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  if (!images.length) return null;

  const handleDownload = (src: string, id: string) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `studio-ai-${id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const goToPrevious = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const currentImage = images[currentIndex];

  return (
    <div className="flex flex-col items-center w-full py-12">
      <div className="w-full max-w-xl group mb-6 cursor-zoom-in" onClick={() => setShowPreview(true)}>
        <div className="relative overflow-hidden rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-gray-800 bg-gray-900">
          <img
              src={currentImage.src}
              alt="Generated Fashion"
              className="w-full h-auto object-contain aspect-[3/4]"
            />
          
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center">
            <div className="flex gap-4">
                <button
                onClick={(e) => { e.stopPropagation(); onEditRequest(currentImage); }}
                className="bg-white text-black font-black py-3 px-6 rounded-2xl hover:bg-cyan-400 transition-all flex items-center gap-2 uppercase text-[10px] tracking-widest shadow-xl"
                >
                <EditIcon className="w-4 h-4" />
                Refine
                </button>
                <button
                onClick={(e) => { e.stopPropagation(); handleDownload(currentImage.src, currentImage.id); }}
                className="bg-cyan-500 text-white font-black py-3 px-6 rounded-2xl hover:bg-cyan-400 transition-all flex items-center gap-2 uppercase text-[10px] tracking-widest shadow-xl shadow-cyan-500/20"
                >
                <DownloadIcon className="w-4 h-4" />
                Download HD
                </button>
            </div>
          </div>

          {images.length > 1 && (
              <>
              <button onClick={goToPrevious} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-cyan-500 transition-all backdrop-blur-md">
                  <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <button onClick={goToNext} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-cyan-500 transition-all backdrop-blur-md">
                  <ArrowRightIcon className="w-5 h-5" />
              </button>
              </>
          )}
        </div>
      </div>

      {images.length > 1 && (
          <div className="flex gap-3 px-4">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => setCurrentIndex(index)}
                className={`w-16 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                  currentIndex === index ? 'border-cyan-500 scale-110 shadow-lg shadow-cyan-500/20' : 'border-transparent opacity-40 hover:opacity-100'
                }`}
              >
                  <img src={image.src} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
      )}

      {showPreview && (
        <ImagePreviewModal 
          image={currentImage} 
          onClose={() => setShowPreview(false)}
          onNext={() => goToNext()}
          onPrev={() => goToPrevious()}
          hasMultiple={images.length > 1}
          isPro={true} 
        />
      )}
    </div>
  );
};

export default PhotoshootGallery;
