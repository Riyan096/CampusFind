import React, { useState, useEffect, useCallback } from 'react';
import { getLeaderboard, getUserRank } from '../services/gamificationService';
import type { LeaderboardEntry } from '../types';
import { useAuth } from '../context/AuthContext';

type TimePeriod = 'weekly' | 'alltime';

export const LeaderboardView: React.FC = () => {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number>(0);
  const [period, setPeriod] = useState<TimePeriod>('alltime');
  const [loading, setLoading] = useState(true);
  
  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await getLeaderboard(10);
      setLeaderboard(entries);
      
      if (user) {
        const rank = await getUserRank(user.uid);
        setUserRank(rank);
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);
  
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);
  
  const getRankIcon = (rank: number): string => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '';
    }
  };
  
  const getRankStyle = (rank: number): string => {
    switch (rank) {
      case 1: return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-lg scale-105';
      case 2: return 'bg-gradient-to-r from-gray-300 to-gray-400 text-white shadow-md';
      case 3: return 'bg-gradient-to-r from-orange-400 to-orange-500 text-white shadow-md';
      default: return 'bg-white hover:bg-gray-50';
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">🏆 Leaderboard</h1>
        <p className="text-gray-500">Top contributors helping reunite items with their owners</p>
      </div>
      
      {/* Period toggle */}
      <div className="flex justify-center mb-6">
        <div className="bg-gray-100 p-1 rounded-lg inline-flex">
          <button
            onClick={() => setPeriod('weekly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              period === 'weekly'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setPeriod('alltime')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              period === 'alltime'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            All Time
          </button>
        </div>
      </div>
      
      {/* User's rank card (if logged in and not in top 10) */}
      {user && userRank > 10 && (
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-4 border border-primary/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">
              {userRank}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-800">Your Position</div>
              <div className="text-sm text-gray-500">
                Keep helping to climb the ranks!
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">--</div>
              <div className="text-xs text-gray-500">points</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading state */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {leaderboard.length >= 3 && (
            <div className="flex justify-center items-end gap-4 mb-8">
              {/* 2nd place */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-3xl shadow-lg mb-2">
                  🥈
                </div>
                <div className="font-semibold text-gray-700 text-sm truncate max-w-[100px]">
                  {leaderboard[1].displayName}
                </div>
                <div className="text-primary font-bold">{leaderboard[1].points} pts</div>
              </div>
              
              {/* 1st place - taller */}
              <div className="text-center -mt-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-500 flex items-center justify-center text-4xl shadow-xl mb-2 animate-pulse">
                  🥇
                </div>
                <div className="font-bold text-gray-800 text-base truncate max-w-[120px]">
                  {leaderboard[0].displayName}
                </div>
                <div className="text-primary font-bold text-lg">{leaderboard[0].points} pts</div>
                <div className="text-xs text-gray-500">
                  {leaderboard[0].itemsReturned} returns
                </div>
              </div>
              
              {/* 3rd place */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-3xl shadow-lg mb-2">
                  🥉
                </div>
                <div className="font-semibold text-gray-700 text-sm truncate max-w-[100px]">
                  {leaderboard[2].displayName}
                </div>
                <div className="text-primary font-bold">{leaderboard[2].points} pts</div>
              </div>
            </div>
          )}
          
          {/* Full list */}
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.userId}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${getRankStyle(index + 1)} ${
                  entry.userId === user?.uid ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                }`}
              >
                {/* Rank */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                  index < 3 
                    ? 'bg-white/30 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {getRankIcon(index + 1) || (index + 1)}
                </div>
                
                {/* Avatar & Name */}
                <div className="flex items-center gap-3 flex-1">
                  {entry.photoURL ? (
                    <img 
                      src={entry.photoURL} 
                      alt={entry.displayName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                      {entry.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className={`font-semibold truncate max-w-[150px] ${
                      index < 3 ? 'text-white' : 'text-gray-800'
                    }`}>
                      {entry.displayName}
                      {entry.userId === user?.uid && (
                        <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </div>
                    <div className={`text-xs ${
                      index < 3 ? 'text-white/80' : 'text-gray-500'
                    }`}>
                      {entry.itemsReported} reported · {entry.itemsReturned} returned
                    </div>
                  </div>
                </div>
                
                {/* Points */}
                <div className="text-right">
                  <div className={`text-xl font-bold ${
                    index < 3 ? 'text-white' : 'text-primary'
                  }`}>
                    {entry.points.toLocaleString()}
                  </div>
                  <div className={`text-xs ${
                    index < 3 ? 'text-white/70' : 'text-gray-500'
                  }`}>
                    points
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Empty state */}
          {leaderboard.length === 0 && (
            <div className="text-center py-12">
              <span className="material-icons text-6xl text-gray-300 mb-4">emoji_events</span>
              <p className="text-gray-500">No leaderboard data yet. Start helping to be the first!</p>
            </div>
          )}
          
          {/* Encouragement message */}
          <div className="bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-600">
              💡 <span className="font-medium">Tip:</span> Report lost items, return found items, and maintain your streak to earn more points and climb the leaderboard!
            </p>
          </div>
        </>
      )}
    </div>
  );
};
