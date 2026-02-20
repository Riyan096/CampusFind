import React, { useEffect, useRef, useCallback, useMemo, useState } from "react";
import type { Item } from '../types';
import { ItemType, ItemCategory, LostItemStatus, FoundItemStatus } from '../types';


interface HomeViewProps {
  items: Item[];
  stats: any;
  onChangeTab: (tab: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = React.memo(({ items, onChangeTab }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Memoize recent items to prevent recalculation
  const recentItems = useMemo(() => items.slice(0, 4), [items]);

  // Calculate enhanced statistics
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayItems = items.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= today;
    });
    
    const itemsFoundToday = todayItems.filter(item => item.type === ItemType.FOUND).length;
    const itemsLostToday = todayItems.filter(item => item.type === ItemType.LOST).length;
    
    // Enhanced return rate calculation - includes all resolved statuses
    const resolvedStatuses = [
      LostItemStatus.CLAIMED, 
      LostItemStatus.RECOVERED,
      FoundItemStatus.RETURNED
    ];
    const resolvedItems = items.filter(item => resolvedStatuses.includes(item.status as any));
    const returnRate = items.length > 0 ? Math.round((resolvedItems.length / items.length) * 100) : 0;
    
    // Category breakdown
    const categoryStats = Object.values(ItemCategory).map(category => {
      const categoryItems = items.filter(item => item.category === category);
      const resolved = categoryItems.filter(item => resolvedStatuses.includes(item.status as any));
      return {
        category,
        total: categoryItems.length,
        resolved: resolved.length,
        rate: categoryItems.length > 0 ? Math.round((resolved.length / categoryItems.length) * 100) : 0
      };
    }).filter(stat => stat.total > 0).sort((a, b) => b.rate - a.rate);

    // Trend calculation (compare last 7 days vs previous 7 days)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const lastWeekItems = items.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= sevenDaysAgo && itemDate < today;
    });
    const previousWeekItems = items.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= fourteenDaysAgo && itemDate < sevenDaysAgo;
    });
    
    const lastWeekResolved = lastWeekItems.filter(item => resolvedStatuses.includes(item.status as any)).length;
    const previousWeekResolved = previousWeekItems.filter(item => resolvedStatuses.includes(item.status as any)).length;
    
    const lastWeekRate = lastWeekItems.length > 0 ? (lastWeekResolved / lastWeekItems.length) * 100 : 0;
    const previousWeekRate = previousWeekItems.length > 0 ? (previousWeekResolved / previousWeekItems.length) * 100 : 0;
    
    const trend = lastWeekRate > previousWeekRate ? 'up' : lastWeekRate < previousWeekRate ? 'down' : 'stable';
    const trendValue = previousWeekRate > 0 ? Math.round(((lastWeekRate - previousWeekRate) / previousWeekRate) * 100) : 0;
    
    return {
      itemsFoundToday,
      itemsLostToday,
      returnRate,
      categoryStats,
      trend,
      trendValue,
      totalItems: items.length,
      resolvedCount: resolvedItems.length,
      avgReturnTime: items.length > 0 ? '24h' : '-'
    };
  }, [items]);

  // Get color based on return rate
  const getRateColor = (rate: number) => {
    if (rate >= 70) return 'text-green-600';
    if (rate >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRateBgColor = (rate: number) => {
    if (rate >= 70) return 'bg-green-500';
    if (rate >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };



  // Dynamic greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Good morning! ☀️', subtext: 'Start your day by checking what\'s been found on campus.' };
    if (hour < 17) return { text: 'Good afternoon! 👋', subtext: 'Here\'s what\'s happening on campus today.' };
    return { text: 'Good evening! 🌙', subtext: 'Wind down by checking the latest lost & found updates.' };
  }, []);

  // Memoize time ago calculation

  const getTimeAgo = useCallback((dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours} hrs ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  }, []);

  // Memoized tab change handlers
  const handleViewMap = useCallback(() => onChangeTab('map'), [onChangeTab]);
  const handleViewBrowse = useCallback(() => onChangeTab('browse'), [onChangeTab]);


  useEffect(() => {
    // Mini Map Initialization
    const L = (window as any).L;
    if (!L || !mapRef.current || mapInstance.current) return;

    // Initialize Map centered on campus
    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false
    }).setView([42.3550, -83.0700], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      opacity: 0.8,
    }).addTo(map);

    //icon markers using theme colors
    const lostIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #dc2626; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });

    const foundIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #0C5449; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });

    mapInstance.current = map;

    //dummy markers
    L.marker([42.3575, -83.0722], { icon: lostIcon }).addTo(map); // Undergrad Library
    L.marker([42.3538, -83.0730], { icon: foundIcon }).addTo(map); // Fitness Center
    L.marker([42.3565, -83.0715], { icon: foundIcon }).addTo(map); // Chemistry Building

    // Cleanup on unmount
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">{greeting.text}</h1>
        <p className="text-gray-500 mt-1">{greeting.subtext}</p>

      </div>




      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-cream-accent shadow-sm">
          <div className="text-2xl font-bold text-primary">{stats.itemsFoundToday}</div>
          <div className="text-sm text-gray-500">Items Found Today</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-cream-accent shadow-sm">
          <div className="text-2xl font-bold text-red-500">{stats.itemsLostToday}</div>
          <div className="text-sm text-gray-500">Items Lost Today</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-cream-accent shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowBreakdown(!showBreakdown)}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-2xl font-bold ${getRateColor(stats.returnRate)}`}>
                {stats.returnRate}%
                {stats.totalItems >= 10 && (
                  <span className="text-sm ml-2">
                    {stats.trend === 'up' ? '📈' : stats.trend === 'down' ? '📉' : '➡️'}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">Return Rate</div>
            </div>
            {stats.totalItems >= 5 && (
              <span className="material-icons text-gray-400 text-sm">
                {showBreakdown ? 'expand_less' : 'expand_more'}
              </span>
            )}
          </div>
          
          {/* Progress bar */}
          {stats.totalItems > 0 && (
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${getRateBgColor(stats.returnRate)} transition-all duration-500`}
                style={{ width: `${stats.returnRate}%` }}
              />
            </div>
          )}
          
          {/* Mini breakdown */}
          {stats.totalItems > 0 && !showBreakdown && (
            <div className="mt-2 text-xs text-gray-500">
              {stats.resolvedCount} of {stats.totalItems} items returned
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-cream-accent shadow-sm">
          <div className="text-2xl font-bold text-primary">{stats.avgReturnTime}</div>
          <div className="text-sm text-gray-500">Avg. Return Time</div>
        </div>

      </div>

      {/* Return Rate Breakdown Panel */}
      {showBreakdown && stats.totalItems >= 5 && (
        <div className="bg-white p-6 rounded-xl border border-cream-accent shadow-sm animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800">Return Rate Breakdown</h3>
            <button 
              onClick={() => setShowBreakdown(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <span className="material-icons">close</span>
            </button>
          </div>
          
          {/* Overall stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{stats.totalItems}</div>
              <div className="text-xs text-gray-500">Total Items</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.resolvedCount}</div>
              <div className="text-xs text-gray-500">Returned</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {stats.trend === 'up' ? '+' : stats.trend === 'down' ? '-' : ''}{stats.trendValue}%
              </div>
              <div className="text-xs text-gray-500">vs Last Week</div>
            </div>
          </div>
          
          {/* Category breakdown */}
          {stats.categoryStats.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">By Category</h4>
              <div className="space-y-3">
                {stats.categoryStats.slice(0, 5).map((stat) => (
                  <div key={stat.category} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-gray-600 truncate">{stat.category}</div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                      <div 
                        className={`h-full ${getRateBgColor(stat.rate)} transition-all duration-500`}
                        style={{ width: `${stat.rate}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                        {stat.rate}%
                      </span>
                    </div>
                    <div className="w-16 text-xs text-gray-500 text-right">
                      {stat.resolved}/{stat.total}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Performance indicator */}
          <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="material-icons text-primary">lightbulb</span>
              <span className="text-sm text-gray-700">
                {stats.returnRate >= 70 
                  ? "Excellent! The community is doing great at returning items."
                  : stats.returnRate >= 40
                  ? "Good progress! Keep reporting found items to improve this rate."
                  : "Let's work together! Report any items you find to help others."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Items Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Recent Items</h2>

          <button onClick={handleViewBrowse} className="text-primary hover:text-primary-dark text-sm font-semibold hover:underline">
            View All
          </button>
        </div>

        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {recentItems.map((item) => (
            <div 
              key={item.id} 
              className="group bg-surface-light rounded-xl overflow-hidden border border-cream-accent hover:border-primary/30 transition-all shadow-sm hover:shadow-soft cursor-pointer flex flex-col"
              onClick={handleViewBrowse}
            >
              <div className="relative h-40 bg-gray-100 overflow-hidden">


                {item.imageUrl ? (
                  <img 
                    src={item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 bg-primary-light/30">
                    <span className="material-icons text-4xl text-primary/40">inventory_2</span>
                  </div>
                )}
                <div className={`absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded shadow-sm ${
                  item.type === ItemType.LOST ? 'bg-red-500 text-white' : 'bg-primary text-white'
                }`}>
                  {item.type}
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                  <p className="text-xs text-white/90 font-medium flex items-center">
                    <span className="material-icons text-[10px] mr-1">schedule</span>
                    {getTimeAgo(item.date)}
                  </p>
                </div>
              </div>
              <div className="p-4 flex flex-col flex-1">
                  <div className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">{item.category}</div>
                  <h3 className="font-bold text-gray-800 text-base mb-1 line-clamp-1 group-hover:text-primary transition-colors">{item.title}</h3>
                  <div className="mt-auto pt-3 flex items-center gap-1 text-xs text-gray-500">


                  <span className="material-icons text-sm text-secondary">location_on</span> 
                  <span className="truncate">{item.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map Preview Section */}
      <div className="mt-10 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Recent Activity Map</h2>

          <button onClick={handleViewMap} className="text-primary hover:text-primary-dark text-sm font-semibold hover:underline">
            View Full Map
          </button>
        </div>
        <div 
          onClick={handleViewMap}
          className="w-full h-64 bg-cream-accent rounded-xl border border-cream-accent relative overflow-hidden group shadow-inner cursor-pointer"

        >

          {/* Leaflet Map Container */}
          <div 
            ref={mapRef} 
            className="w-full h-full z-0 opacity-80 group-hover:opacity-60 transition-opacity"
            style={{ pointerEvents: 'none' }}
          />
          
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button className="bg-white/90 text-primary-dark px-5 py-2 rounded-lg shadow-soft opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium transform translate-y-2 group-hover:translate-y-0">
              Explore Interactive Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

HomeView.displayName = 'HomeView';
