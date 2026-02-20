import React, { useState } from 'react';
import { getAchievementProgress, getAchievementColor, getCategoryLabel, ACHIEVEMENTS } from '../services/gamificationService';
import type { UserStats, Achievement } from '../types';

interface AchievementsPanelProps {
  stats: UserStats;
  onClose?: () => void;
}

export const AchievementsPanel: React.FC<AchievementsPanelProps> = ({ stats, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<Achievement['category'] | 'all'>('all');
  const [selectedAchievement, setSelectedAchievement] = useState<(Achievement & { progress: number; unlocked: boolean; unlockedAt?: string }) | null>(null);
  
  const achievements = getAchievementProgress(stats);
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalCount = achievements.length;
  const progressPercent = Math.round((unlockedCount / totalCount) * 100);
  
  const filteredAchievements = selectedCategory === 'all' 
    ? achievements 
    : achievements.filter(a => a.category === selectedCategory);
  
  const categories: { id: Achievement['category'] | 'all'; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: achievements.length },
    { id: 'bronze', label: 'Bronze', count: achievements.filter(a => a.category === 'bronze').length },
    { id: 'silver', label: 'Silver', count: achievements.filter(a => a.category === 'silver').length },
    { id: 'gold', label: 'Gold', count: achievements.filter(a => a.category === 'gold').length },
    { id: 'platinum', label: 'Platinum', count: achievements.filter(a => a.category === 'platinum').length },
  ];
  
  return (
    <div className="bg-white rounded-xl border border-cream-accent shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-secondary/5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Achievements</h3>
            <p className="text-sm text-gray-500">
              {unlockedCount} of {totalCount} unlocked ({progressPercent}%)
            </p>
          </div>
          {onClose && (
            <button 
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            >
              <span className="material-icons">close</span>
            </button>
          )}
        </div>
        
        {/* Progress bar */}
        <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      
      {/* Category tabs */}
      <div className="flex gap-1 p-2 border-b border-gray-100 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
            <span className="ml-1 opacity-70">({cat.count})</span>
          </button>
        ))}
      </div>
      
      {/* Achievement grid */}
      <div className="p-4 max-h-96 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredAchievements.map(achievement => (
            <button
              key={achievement.id}
              onClick={() => setSelectedAchievement(achievement)}
              className={`relative p-3 rounded-xl border-2 transition-all text-left ${
                achievement.unlocked
                  ? 'border-transparent bg-gradient-to-br shadow-sm hover:shadow-md'
                  : 'border-gray-200 bg-gray-50 opacity-70 hover:opacity-100'
              } ${achievement.unlocked ? getAchievementBgClass(achievement.category) : ''}`}
              style={achievement.unlocked ? {
                background: `linear-gradient(135deg, ${getAchievementColor(achievement.category)}15, ${getAchievementColor(achievement.category)}05)`
              } : {}}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${
                achievement.unlocked 
                  ? 'bg-white/80 shadow-sm' 
                  : 'bg-gray-200'
              }`}>
                <span className={`material-icons ${
                  achievement.unlocked ? '' : 'text-gray-400'
                }`} style={achievement.unlocked ? { color: getAchievementColor(achievement.category) } : {}}>
                  {achievement.icon}
                </span>
              </div>
              
              {/* Name */}
              <div className={`text-xs font-semibold line-clamp-2 ${
                achievement.unlocked ? 'text-gray-800' : 'text-gray-500'
              }`}>
                {achievement.name}
              </div>
              
              {/* Progress or unlocked indicator */}
              {!achievement.unlocked ? (
                <div className="mt-2">
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gray-400 rounded-full"
                      style={{ width: `${achievement.progress}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {Math.round(achievement.progress)}%
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-1">
                  <span className="material-icons text-xs text-green-500">check_circle</span>
                  <span className="text-[10px] text-green-600 font-medium">+{achievement.pointsBonus} pts</span>
                </div>
              )}
              
              {/* Category badge */}
              <div 
                className="absolute top-2 right-2 w-2 h-2 rounded-full"
                style={{ backgroundColor: getAchievementColor(achievement.category) }}
              />
            </button>
          ))}
        </div>
      </div>
      
      {/* Achievement detail modal */}
      {selectedAchievement && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedAchievement(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              {/* Icon */}
              <div 
                className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg"
                style={{ 
                  background: selectedAchievement.unlocked 
                    ? `linear-gradient(135deg, ${getAchievementColor(selectedAchievement.category)}, ${getAchievementColor(selectedAchievement.category)}88)`
                    : '#e5e7eb'
                }}
              >
                <span className="material-icons text-4xl text-white">
                  {selectedAchievement.icon}
                </span>
              </div>
              
              {/* Category */}
              <div 
                className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-2"
                style={{ 
                  backgroundColor: `${getAchievementColor(selectedAchievement.category)}20`,
                  color: getAchievementColor(selectedAchievement.category)
                }}
              >
                {getCategoryLabel(selectedAchievement.category)}
              </div>
              
              {/* Name */}
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {selectedAchievement.name}
              </h3>
              
              {/* Description */}
              <p className="text-gray-600 text-sm mb-4">
                {selectedAchievement.description}
              </p>
              
              {/* Status */}
              {selectedAchievement.unlocked ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center justify-center gap-2 text-green-700">
                    <span className="material-icons">emoji_events</span>
                    <span className="font-semibold">Unlocked!</span>
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    {selectedAchievement.unlockedAt && 
                      new Date(selectedAchievement.unlockedAt).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-green-700 mt-2 font-medium">
                    +{selectedAchievement.pointsBonus} bonus points earned
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-sm text-gray-600 mb-2">Progress</div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${selectedAchievement.progress}%`,
                        backgroundColor: getAchievementColor(selectedAchievement.category)
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    {Math.round(selectedAchievement.progress)}% complete
                  </div>
                </div>
              )}
              
              {/* Close button */}
              <button
                onClick={() => setSelectedAchievement(null)}
                className="mt-4 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function for background classes
const getAchievementBgClass = (category: Achievement['category']): string => {
  switch (category) {
    case 'bronze': return 'from-orange-50 to-amber-50';
    case 'silver': return 'from-gray-50 to-slate-50';
    case 'gold': return 'from-yellow-50 to-amber-50';
    case 'platinum': return 'from-purple-50 to-indigo-50';
    default: return 'from-gray-50 to-gray-100';
  }
};
