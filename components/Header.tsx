
import React from 'react';
import { User, UsageLimit } from '../types';

interface HeaderProps {
  user: User | null;
  usage: UsageLimit;
  onSignOut: () => void;
  onSignIn: () => void;
  onUpgrade: () => void;
}

const Header: React.FC<HeaderProps> = ({ user, usage, onSignOut }) => {
  const DAILY_LIMIT = 5;
  const percentage = Math.min(100, (usage.count / DAILY_LIMIT) * 100);

  return (
    <header className="bg-gray-900/80 backdrop-blur-md border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-cyan-500 w-8 h-8 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
          </div>
          <h1 className="text-lg font-black uppercase tracking-tighter text-white">
            Studio<span className="text-cyan-500">AI</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          {user && (
            <>
              <div className="flex items-center gap-4">
                 <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">DAILY LIMIT</span>
                  <span className="text-sm font-bold text-white leading-none mt-1">{usage.count}/{DAILY_LIMIT}</span>
                </div>
                <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
                  <div 
                    className={`h-full transition-all duration-700 ${usage.count >= DAILY_LIMIT ? 'bg-red-500' : 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 border-l border-gray-800 pl-6">
                <img 
                  src={user.photoUrl} 
                  alt={user.name} 
                  className="w-8 h-8 rounded-full border border-gray-700 shadow-sm" 
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={onSignOut}
                  className="text-[10px] font-black text-gray-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                >
                  Exit
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
