import React from 'react';
import type { StreakInfo } from '../types';

interface StreakDisplayProps {
  streaks: StreakInfo;
  compact?: boolean;
}

export const StreakDisplay: React.FC<StreakDisplayProps> = ({ streaks, compact = false }) => {
  const currentStreak = streaks?.currentStreak || 0;
  const longestStreak = streaks?.longestStreak || 0;
  const weeklyActivity = streaks?.weeklyActivity || [false, false, false, false, false, false, false];
  
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  
  // Get flame color based on streak
  const getFlameColor = () => {
    if (currentStreak >= 30) return 'text-purple-500';
    if (currentStreak >= 7) return 'text-orange-500';
    if (currentStreak >= 3) return 'text-yellow-500';
    return 'text-gray-400';
  };
  
  // Get flame animation intensity
  const getFlameAnimation = () => {
    if (currentStreak >= 30) return 'animate-pulse';
    if (currentStreak >= 7) return '';
    return '';
  };
  
  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-gradient-to-r from-orange-50 to-red-50 px-3 py-2 rounded-lg border border-orange-200">
        <span className={`material-icons ${getFlameColor()} ${getFlameAnimation()}`}>
          local_fire_department
        </span>
        <div>
          <div className="text-sm font-bold text-gray-800">
            {currentStreak} day{currentStreak !== 1 ? 's' : ''}
          </div>
          <div className="text-xs text-gray-500">current streak</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-xl border border-cream-accent p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-full bg-gradient-to-br from-orange-100 to-red-100 ${getFlameAnimation()}`}>
            <span className={`material-icons text-3xl ${getFlameColor()}`}>
              local_fire_department
            </span>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-800">
              {currentStreak} Day{currentStreak !== 1 ? 's' : ''}
            </div>
            <div className="text-sm text-gray-500">Current Streak 🔥</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Best</div>
          <div className="text-lg font-semibold text-gray-700">
            {longestStreak} day{longestStreak !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      
      {/* Weekly Activity Calendar */}
      <div className="mt-4">
        <div className="text-xs text-gray-500 mb-2">Last 7 Days</div>
        <div className="flex gap-1">
          {dayLabels.map((label, index) => (
            <div
              key={index}
              className={`flex-1 h-8 rounded-md flex items-center justify-center text-xs font-medium transition-all ${
                weeklyActivity[index]
                  ? 'bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-400'
              }`}
              title={weeklyActivity[index] ? 'Active' : 'No activity'}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      
      {/* Motivational message */}
      <div className="mt-3 text-xs text-center text-gray-600 italic">
        {currentStreak === 0 
          ? "Start your streak today by reporting an item!"
          : currentStreak < 3
          ? "Keep it going! You're building momentum."
          : currentStreak < 7
          ? "Nice streak! You're becoming a regular helper."
          : currentStreak < 30
          ? "Impressive dedication! You're a campus hero."
          : "LEGENDARY! You're unstoppable! 🔥"}
      </div>
    </div>
  );
};
