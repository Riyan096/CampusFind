/**
 * Advanced Search Filters Component
 * Provides date range, location, status, and category filters
 */

import React, { useState, useCallback } from 'react';
import { ItemType, ItemCategory, ItemStatus, CampusLocation } from '../types';

interface FilterState {
  dateRange: 'all' | 'today' | 'week' | 'month';
  startDate: string;
  endDate: string;
  locations: CampusLocation[];
  status: ItemStatus[];
  categories: ItemCategory[];
  type: ItemType | 'ALL';
  sortBy: 'newest' | 'oldest' | 'alphabetical';
}

interface AdvancedSearchFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  itemCount: number;
}

const defaultFilters: FilterState = {
  dateRange: 'all',
  startDate: '',
  endDate: '',
  locations: [],
  status: [],
  categories: [],
  type: 'ALL',
  sortBy: 'newest'
};

export const AdvancedSearchFilters: React.FC<AdvancedSearchFiltersProps> = ({
  filters,
  onChange,
  onReset,
  itemCount
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDateRangeChange = useCallback((dateRange: FilterState['dateRange']) => {
    const today = new Date();
    let startDate = '';
    let endDate = '';

    switch (dateRange) {
      case 'today':
        startDate = today.toISOString().split('T')[0];
        endDate = startDate;
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
        break;
    }

    onChange({
      ...filters,
      dateRange,
      startDate,
      endDate
    });
  }, [filters, onChange]);

  const handleLocationToggle = useCallback((location: CampusLocation) => {
    const newLocations = filters.locations.includes(location)
      ? filters.locations.filter(l => l !== location)
      : [...filters.locations, location];
    
    onChange({
      ...filters,
      locations: newLocations
    });
  }, [filters, onChange]);

  const handleStatusToggle = useCallback((status: ItemStatus) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    
    onChange({
      ...filters,
      status: newStatus
    });
  }, [filters, onChange]);

  const handleCategoryToggle = useCallback((category: ItemCategory) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];
    
    onChange({
      ...filters,
      categories: newCategories
    });
  }, [filters, onChange]);

  const handleTypeChange = useCallback((type: ItemType | 'ALL') => {
    onChange({
      ...filters,
      type
    });
  }, [filters, onChange]);

  const handleSortChange = useCallback((sortBy: FilterState['sortBy']) => {
    onChange({
      ...filters,
      sortBy
    });
  }, [filters, onChange]);

  const activeFilterCount = 
    (filters.dateRange !== 'all' ? 1 : 0) +
    filters.locations.length +
    filters.status.length +
    filters.categories.length +
    (filters.type !== 'ALL' ? 1 : 0);

  const locationGroups = {
    'Libraries': [CampusLocation.KRESGE_LIBRARY, CampusLocation.UNDERGRAD_LIBRARY, CampusLocation.LAW_LIBRARY],
    'Academic': [CampusLocation.ART_BUILDING, CampusLocation.SCIENCE_HALL, CampusLocation.ENGINEERING, CampusLocation.BUSINESS_SCHOOL, CampusLocation.LAW_SCHOOL, CampusLocation.CHEMISTRY, CampusLocation.BIOLOGICAL_SCIENCES, CampusLocation.WILSON_HALL, CampusLocation.OLD_MAIN, CampusLocation.STEM_SILC],
    'Student Centers': [CampusLocation.STUDENT_CENTER, CampusLocation.UNIVERSITY_AUDITORIUM, CampusLocation.DETROIT_OPERA_HOUSE],
    'Residence': [CampusLocation.ANTHONY_APARTMENTS, CampusLocation.ATCHISON_HALL, CampusLocation.TOWERS_RESIDENCES, CampusLocation.CHATSWORTH_SUITES, CampusLocation.YOUSIF_GHAFAIRI_HALL],
    'Fitness': [CampusLocation.FITNESS_CENTER, CampusLocation.MATTHAEI_PE_CENTER, CampusLocation.WAYNE_STATE_FIELDHOUSE],
    'Parking': [CampusLocation.PARKING_1, CampusLocation.PARKING_2, CampusLocation.PARKING_3, CampusLocation.PARKING_4, CampusLocation.PARKING_5, CampusLocation.PARKING_6, CampusLocation.PARKING_7, CampusLocation.PARKING_8]
  };

  return (
    <div className="bg-white rounded-xl border border-cream-accent shadow-sm mb-4">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="material-icons text-primary">tune</span>
          <div>
            <h3 className="font-semibold text-gray-800">Advanced Filters</h3>
            <p className="text-sm text-gray-500">

              {activeFilterCount > 0 
                ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active • ${itemCount} result${itemCount !== 1 ? 's' : ''}`
                : `Click to filter by date, location, status, and more`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
              className="text-sm text-red-500 hover:text-red-700 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
            >
              Clear All
            </button>
          )}
          <span className="material-icons text-gray-400 transform transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>

            expand_more
          </span>
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4 space-y-6">

          {/* Date Range */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-gray-400">calendar_today</span>

              Date Range
            </h4>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'All Time' },
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'Last 7 Days' },
                { value: 'month', label: 'Last 30 Days' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleDateRangeChange(option.value as FilterState['dateRange'])}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filters.dateRange === option.value
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}

                >
                  {option.label}
                </button>
              ))}
            </div>
            
            {/* Custom Date Range */}
            <div className="flex gap-3 mt-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">From</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none bg-white text-gray-900"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">To</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none bg-white text-gray-900"
                />
              </div>
            </div>

          </div>


          {/* Item Type */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-gray-400">category</span>

              Item Type
            </h4>
            <div className="flex gap-2">
              {[
                { value: 'ALL', label: 'All Items' },
                { value: ItemType.LOST, label: 'Lost', color: 'red' },
                { value: ItemType.FOUND, label: 'Found', color: 'primary' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleTypeChange(option.value as ItemType | 'ALL')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    filters.type === option.value
                      ? option.value === 'ALL' 
                        ? 'bg-primary text-white border-primary'
                        : option.value === ItemType.LOST
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}

                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>


          {/* Status */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-gray-400">flag</span>

              Status
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.values(ItemStatus).map(status => (
                <button
                  key={status}
                  onClick={() => handleStatusToggle(status)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    filters.status.includes(status)
                      ? 'bg-secondary text-primary-dark border-secondary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}

                >
                  {status === ItemStatus.OPEN ? 'Still Looking' : 
                   status === ItemStatus.PENDING ? 'Pending' :
                   status === ItemStatus.CLAIMED ? 'Claimed' :
                   status === ItemStatus.RESOLVED ? 'Resolved' : status}
                </button>
              ))}
            </div>
          </div>


          {/* Categories */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-gray-400">folder</span>

              Categories
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.values(ItemCategory).map(category => (
                <button
                  key={category}
                  onClick={() => handleCategoryToggle(category)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    filters.categories.includes(category)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}

                >
                  {category}
                </button>
              ))}
            </div>
          </div>


          {/* Locations */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-gray-400">location_on</span>

              Locations
            </h4>
            <div className="space-y-3">
              {Object.entries(locationGroups).map(([group, locations]) => (
                <div key={group} className="border border-gray-100 rounded-lg p-3">
                  <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">{group}</h5>

                  <div className="flex flex-wrap gap-2">
                    {locations.map(location => (
                      <button
                        key={location}
                        onClick={() => handleLocationToggle(location)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                          filters.locations.includes(location)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}

                        title={location}
                      >
                        {location.length > 25 ? location.substring(0, 25) + '...' : location}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>


          {/* Sort By */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-gray-400">sort</span>

              Sort By
            </h4>
            <div className="flex gap-2">
              {[
                { value: 'newest', label: 'Newest First', icon: 'arrow_downward' },
                { value: 'oldest', label: 'Oldest First', icon: 'arrow_upward' },
                { value: 'alphabetical', label: 'A-Z', icon: 'sort_by_alpha' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleSortChange(option.value as FilterState['sortBy'])}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filters.sortBy === option.value
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}

                >
                  <span className="material-icons text-sm">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export { defaultFilters };
export type { FilterState };
