
import React, { useState } from 'react';
import { PhotoshootImage } from '../types';

interface ImageEditorProps {
  image: PhotoshootImage;
  onClose: () => void;
  onEdit: (prompt: string) => void;
  isLoading: boolean;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ image, onClose, onEdit, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onEdit(prompt);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col md:flex-row gap-4 p-6">
        <div className="flex-shrink-0 w-full md:w-1/2">
          <img src={image.src} alt="Editing preview" className="rounded-xl w-full object-contain aspect-[3/4]" />
        </div>
        <div className="flex flex-col flex-grow">
          <h2 className="text-2xl font-bold mb-4 text-cyan-400">Edit Image</h2>
          <p className="text-gray-400 mb-4">Describe the change you want to make. For example, "Add a retro filter" or "Change the background to a forest."</p>
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Make the lighting more dramatic"
              className="w-full flex-grow p-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-none"
              rows={5}
            />
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="w-full sm:w-auto px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !prompt.trim()}
                className="w-full sm:w-auto flex-grow px-6 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 text-white font-bold rounded-lg transition-colors"
              >
                {isLoading ? 'Applying...' : 'Apply Edit'}
              </button>
            </div>
          </form>
        </div>
      </div>
       <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-cyan-400 transition-colors"
        aria-label="Close editor"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
};

export default ImageEditor;