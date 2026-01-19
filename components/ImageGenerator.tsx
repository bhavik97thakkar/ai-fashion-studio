import React, { useState, useCallback } from 'react';
import * as geminiService from '../services/geminiService';
import Loader from './Loader';
import { DownloadIcon } from './icons/FeatureIcons';

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    try {
      const imageUrl = await geminiService.generateImage(prompt);
      setGeneratedImage(imageUrl);
    } catch (e) {
      console.error(e);
      setError('Failed to generate image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [prompt]);

  const handleDownload = (src: string) => {
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    const mimeType = src.match(/data:(image\/\w+);/)?.[1] || 'image/jpeg';
    const extension = mimeType.split('/')[1] || 'jpg';
    const filename = prompt.substring(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'ai-generated-image';
    link.download = `${filename}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-4 text-cyan-400 text-center">Image Generator</h2>
      <p className="text-gray-400 mb-8 text-center">Describe any image you can imagine, and our AI will create it for you.</p>

      <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., A photorealistic image of a cat astronaut floating in space, 4K"
          className="w-full p-3 bg-gray-900 border border-gray-700 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y min-h-[100px]"
          rows={3}
        />
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full mt-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-transform transform hover:scale-105 duration-300"
        >
          {isLoading ? 'Generating...' : 'Generate Image'}
        </button>
      </div>

      {isLoading && <Loader message="Creating your image..." />}
      
      {error && (
        <div className="mt-6 bg-red-800 border border-red-600 text-white px-4 py-3 rounded-lg text-center" role="alert">
          {error}
        </div>
      )}

      {generatedImage && (
        <div className="mt-8">
          <h3 className="text-2xl font-bold mb-4 text-cyan-400 text-center">Result</h3>
          <div className="flex flex-col items-center gap-4">
            <img src={generatedImage} alt="Generated from prompt" className="rounded-xl shadow-lg max-w-full lg:max-w-lg object-contain aspect-[3/4]" />
            <button
              onClick={() => handleDownload(generatedImage)}
              className="flex items-center gap-2 mt-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-transform transform hover:scale-105 duration-300"
            >
              <DownloadIcon className="w-6 h-6" />
              Download Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGenerator;