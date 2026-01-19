import React, { useCallback } from 'react';
import { UploadIcon } from './icons/FeatureIcons';

interface ImageUploaderProps {
  onImageUpload: (files: File[]) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onImageUpload(Array.from(files));
    }
  }, [onImageUpload]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.files;
     if (files && files.length > 0) {
      onImageUpload(Array.from(files));
    }
  }, [onImageUpload]);

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="w-full max-w-2xl mx-auto text-center">
      <h2 className="text-3xl font-bold mb-4 text-cyan-400">Start Your Photoshoot</h2>
      <p className="text-gray-400 mb-8">Upload one or more garment images to create a collection.</p>
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="flex justify-center w-full h-64 px-4 transition bg-gray-800 border-2 border-gray-600 border-dashed rounded-xl appearance-none cursor-pointer hover:border-cyan-400 focus:outline-none"
      >
        <span className="flex items-center space-x-2">
          <UploadIcon className="w-8 h-8 text-gray-500" />
          <span className="font-medium text-gray-400">
            Drop files to attach, or <span className="text-cyan-400 underline">browse</span>
          </span>
        </span>
        <input type="file" name="file_upload" className="hidden" multiple accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
      </label>
    </div>
  );
};

export default ImageUploader;
