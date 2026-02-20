import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { Item } from '../types';
import { ItemType, ItemCategory, ItemStatus, LostItemStatus, FoundItemStatus } from '../types';

import { Input } from '../components/UI';
import { deleteItemFromFirestore, updateItemStatusInFirestore } from '../services/itemService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { addPoints } from '../services/StorageService';
import { AdvancedSearchFilters, defaultFilters, type FilterState } from '../components/AdvancedSearchFilters';
import { emailService } from '../services/emailService';





// Custom hook for debouncing
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

interface BrowseViewProps {
  items: Item[];
  onItemClick: (item: Item) => void;
  onItemsChange?: () => void;
  onStatusChange?: () => void;
  searchQuery?: string;
  onStartChat?: (itemId: string, itemTitle: string, itemOwnerId: string) => void;
}

export const BrowseView: React.FC<BrowseViewProps> = React.memo(({ items, onItemClick, onItemsChange, onStatusChange, searchQuery, onStartChat }) => {
  const { user, isAdmin } = useAuth();
  const [search, setSearch] = useState(searchQuery || '');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [reporterName, setReporterName] = useState<string>('');


  const [filterType, setFilterType] = useState<ItemType | 'ALL'>('ALL');
  const [filterCat, setFilterCat] = useState<ItemCategory | 'ALL'>('ALL');
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>(defaultFilters);


  // Fetch reporter name when item is selected
  useEffect(() => {
    // Use reporterName from item if available, otherwise fetch from user document
    if (selectedItem?.reporterName) {
      setReporterName(selectedItem.reporterName);
    } else if (selectedItem?.reportedBy) {
      // Fallback: fetch from user document for legacy items
      const fetchReporterName = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', selectedItem.reportedBy!));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setReporterName(userData.displayName || userData.email || 'Unknown User');
          } else {
            setReporterName('Unknown User');
          }
        } catch (err) {
          console.error('Error fetching reporter:', err);
          setReporterName('Unknown User');
        }
      };
      fetchReporterName();
    } else {
      setReporterName('');
    }
  }, [selectedItem]);


  // Debounce search input for better performance
  const debouncedSearch = useDebounce(search, 300);

  // Helper to get date string in YYYY-MM-DD format
  // This ensures consistent comparison without timezone issues
  const getDateString = (dateInput: string | Date): string => {
    if (typeof dateInput === 'string') {
      // If it's already a string, extract just the date part
      return dateInput.includes('T') ? dateInput.split('T')[0] : dateInput;
    } else {
      // Date object - format as YYYY-MM-DD using UTC to avoid timezone shifts
      const year = dateInput.getUTCFullYear();
      const month = String(dateInput.getUTCMonth() + 1).padStart(2, '0');
      const day = String(dateInput.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  };




  // Memoize filtered items to avoid recalculation on every render
  const filteredItems = useMemo(() => {
    let result = items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(debouncedSearch.toLowerCase()) || item.description.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesType = filterType === 'ALL' || item.type === filterType;
      const matchesCat = filterCat === 'ALL' || item.category === filterCat;
      return matchesSearch && matchesType && matchesCat;
    });

    // Apply advanced filters
    if (advancedFilters.dateRange !== 'all' || advancedFilters.startDate || advancedFilters.endDate) {
      result = result.filter(item => {
        const itemDateStr = getDateString(item.date);
        const startStr = advancedFilters.startDate || null;
        const endStr = advancedFilters.endDate || null;
        
        if (startStr && itemDateStr < startStr) return false;
        if (endStr && itemDateStr > endStr) return false;
        return true;
      });
    }






    if (advancedFilters.locations.length > 0) {
      result = result.filter(item => advancedFilters.locations.includes(item.location));
    }

    if (advancedFilters.status.length > 0) {
      result = result.filter(item => advancedFilters.status.includes(item.status));
    }

    if (advancedFilters.categories.length > 0) {
      result = result.filter(item => advancedFilters.categories.includes(item.category));
    }

    if (advancedFilters.type !== 'ALL') {
      result = result.filter(item => item.type === advancedFilters.type);
    }

    // Sort results
    result = [...result].sort((a, b) => {
      switch (advancedFilters.sortBy) {
        case 'newest':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'oldest':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'alphabetical':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [items, debouncedSearch, filterType, filterCat, advancedFilters]);


  // Memoized callbacks to prevent unnecessary re-renders
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }, []);

  const handleTypeFilter = useCallback((type: ItemType | 'ALL') => {
    setFilterType(type);
  }, []);

  const handleCatFilter = useCallback((cat: ItemCategory) => {
    setFilterCat(prev => prev === cat ? 'ALL' : cat);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilterType('ALL');
    setFilterCat('ALL');
    setSearch('');
    setAdvancedFilters(defaultFilters);
  }, []);


  const handleClearSearch = useCallback(() => {
    setSearch('');
  }, []);

  const handleItemClick = useCallback((item: Item) => {
    setSelectedItem(item);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedItem(null);
  }, []);

  const canModifyItem = useCallback((item: Item | null) => {
    if (!item || !user) return false;
    return isAdmin || item.reportedBy === user.uid;
  }, [user, isAdmin]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (selectedItem) {
      if (!canModifyItem(selectedItem)) {
        alert('You can only change the status of items you reported.');
        return;
      }
      try {
        await updateItemStatusInFirestore(selectedItem.id, newStatus);
        setSelectedItem({ ...selectedItem, status: newStatus });
        
        // Award points when item is claimed/resolved
        if (newStatus === LostItemStatus.CLAIMED || newStatus === FoundItemStatus.RETURNED) {
          const stats = await addPoints(50); // Award 50 points for resolving an item
          alert(`🎉 Item resolved! You earned 50 points! Total: ${stats.points} points`);

          
          // Send email notification to item reporter
          if (selectedItem.reportedBy && user) {
            emailService.sendItemClaimedNotification(
              selectedItem.reportedBy,
              selectedItem.title,
              user.displayName || 'Anonymous'
            ).catch(err => console.error('Failed to send email notification:', err));
          }
        }
        
        onStatusChange?.();

      } catch (err) {
        console.error('Error updating status:', err);
        alert('Failed to update status. Please try again.');
      }
    }
  }, [selectedItem, onStatusChange, canModifyItem]);




  // Sync with external search query
  React.useEffect(() => {
    if (searchQuery) {
      setSearch(searchQuery);
    }
  }, [searchQuery]);

  const handleDelete = useCallback(async (e: React.MouseEvent, item: Item) => {
    e.stopPropagation();
    if (!canModifyItem(item)) {
      alert('You can only delete items you reported.');
      return;
    }
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteItemFromFirestore(item.id);
        onItemsChange?.();
      } catch (err) {
        console.error('Error deleting item:', err);
        alert('Failed to delete item. Please try again.');
      }
    }
  }, [onItemsChange, canModifyItem]);


  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Advanced Search Filters */}
      <AdvancedSearchFilters
        filters={advancedFilters}
        onChange={setAdvancedFilters}
        onReset={() => setAdvancedFilters(defaultFilters)}
        itemCount={filteredItems.length}
      />

      {/* Search & Filters */}
      <div className="top-0 bg-background-light pt-2 pb-4 space-y-4">
        <div className="relative max-w-xl">

          <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
          <Input 
            placeholder="Search all items..." 
            className="pl-10 pr-10 bg-white border-cream-accent" 
            value={search}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
          />
          {search && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search"
            >
              <span className="material-icons text-lg">close</span>
            </button>
          )}
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          <button 
            onClick={() => handleTypeFilter('ALL')}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
              filterType === 'ALL' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/50'
            }`}
          >
            All Items
          </button>
          <button 
            onClick={() => handleTypeFilter(ItemType.LOST)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
              filterType === ItemType.LOST ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:border-red-400'
            }`}
          >
            Lost
          </button>
          <button 
            onClick={() => handleTypeFilter(ItemType.FOUND)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
              filterType === ItemType.FOUND ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary'
            }`}
          >
            Found
          </button>
          <div className="w-[1px] h-8 bg-gray-300 mx-1 self-center"></div>
          {Object.values(ItemCategory).slice(0,4).map(cat => (
             <button 
                key={cat}
                onClick={() => handleCatFilter(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
                filterCat === cat ? 'bg-secondary text-primary-dark border-secondary' : 'bg-white text-gray-600 border-gray-200 hover:border-secondary'
                }`}
             >
                {cat}
             </button>
          ))}
        </div>
      </div>



      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.length > 0 ? (
          filteredItems.map(item => (
            <div 
              key={item.id} 
              className="group bg-surface-light rounded-xl overflow-hidden border border-cream-accent hover:border-primary/30 transition-all shadow-sm hover:shadow-soft flex flex-col h-full relative"
            >
               <div className="relative h-48 bg-gray-100 overflow-hidden cursor-pointer" onClick={() => handleItemClick(item)}>
                  {item.imageUrl ? (
                     <img 
                       src={item.imageUrl} 
                       alt={item.title} 
                       className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                       loading="lazy"
                     />
                  ) : (
                     <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <span className="material-icons text-5xl">image_not_supported</span>
                     </div>
                  )}
                  <div className={`absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded shadow-sm ${
                    item.type === ItemType.LOST ? 'bg-red-500 text-white' : 'bg-primary text-white'
                  }`}>
                    {item.type}
                  </div>
               </div>
               <div className="p-4 flex flex-col flex-1 cursor-pointer" onClick={() => handleItemClick(item)}>
                  <div className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">{item.category}</div>
                  <h3 className="font-bold text-gray-800 text-lg mb-1 line-clamp-1">{item.title}</h3>
                  <div className="mt-auto pt-3 flex items-center gap-1 text-xs text-gray-500">
                     <span className="material-icons text-sm text-secondary">location_on</span> 
                     <span className="truncate">{item.location}</span>
                  </div>
               </div>
               {canModifyItem(item) && (
                 <button
                    onClick={(e) => handleDelete(e, item)}
                    className="absolute bottom-3 right-3 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete item"
                 >
                    <span className="material-icons text-lg">delete</span>
                 </button>
               )}

            </div>
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="material-icons text-6xl mb-4 text-gray-200">search_off</span>
            <p className="text-lg font-medium text-gray-500">No items found matching your filters.</p>
            <button onClick={handleClearFilters} className="mt-4 text-primary font-medium hover:underline">
              Clear all filters
            </button>
          </div>
        )}


      </div>

      {/* Item Detail Modal */}
      {selectedItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="relative h-64 bg-gray-100 rounded-t-2xl overflow-hidden">

              {selectedItem.imageUrl ? (
                <img 
                  src={selectedItem.imageUrl} 
                  alt={selectedItem.title} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <span className="material-icons text-6xl">image_not_supported</span>
                </div>
              )}
              <button
                onClick={handleCloseModal}
                className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors"
              >
                <span className="material-icons text-gray-600">close</span>
              </button>


              <div className={`absolute top-4 left-4 text-sm font-bold px-3 py-1.5 rounded-lg shadow-lg ${
                selectedItem.type === ItemType.LOST ? 'bg-red-500 text-white' : 'bg-primary text-white'
              }`}>
                {selectedItem.type}
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div>
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{selectedItem.category}</span>
                <h2 className="text-2xl font-bold text-gray-800 mt-1">{selectedItem.title}</h2>

              </div>

              <p className="text-gray-600 leading-relaxed">{selectedItem.description}</p>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-cream-accent">


                <div className="flex items-center gap-3">
                  <span className="material-icons text-secondary">location_on</span>
                  <div>
                    <p className="text-xs text-gray-400">Location</p>
                    <p className="font-medium text-gray-800">{selectedItem.location}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="material-icons text-secondary">event</span>
                  <div>
                    <p className="text-xs text-gray-400">Date</p>
                    <p className="font-medium text-gray-800">

                      {new Date(selectedItem.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="material-icons text-secondary">tag</span>
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 mb-1">Status</p>
                    {canModifyItem(selectedItem) ? (
                      <select
                        value={selectedItem.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-cream-accent rounded-lg text-sm font-medium text-gray-800 focus:ring-2 focus:ring-primary/50 outline-none cursor-pointer"
                      >
                        {selectedItem.type === ItemType.LOST ? (
                          <>
                            <option value={LostItemStatus.STILL_LOST}>Still Lost</option>
                            <option value={LostItemStatus.MATCH_FOUND}>Match Found</option>
                            <option value={LostItemStatus.CLAIMED}>Claimed</option>
                            <option value={LostItemStatus.RECOVERED}>Recovered</option>
                          </>
                        ) : (
                          <>
                            <option value={FoundItemStatus.AVAILABLE}>Available</option>
                            <option value={FoundItemStatus.PENDING_CLAIM}>Pending Claim</option>
                            <option value={FoundItemStatus.RETURNED}>Returned</option>
                            <option value={FoundItemStatus.UNCLAIMED}>Unclaimed</option>
                          </>
                        )}
                      </select>
                    ) : (
                      <p className="px-3 py-1.5 bg-gray-100 border border-cream-accent rounded-lg text-sm font-medium text-gray-800">
                        {selectedItem.status === LostItemStatus.STILL_LOST || selectedItem.status === FoundItemStatus.AVAILABLE ? 'Still Looking' : 
                         selectedItem.status === LostItemStatus.CLAIMED || selectedItem.status === FoundItemStatus.RETURNED ? 'Resolved' : 
                         selectedItem.status}
                      </p>
                    )}
                  </div>
                </div>


                <div className="flex items-center gap-3">
                  <span className="material-icons text-secondary">person</span>
                  <div>
                    <p className="text-xs text-gray-400">Reported By</p>
                    <p className="font-medium text-gray-800">{reporterName || 'Loading...'}</p>
                  </div>
                </div>

              </div>


              <div className="flex gap-3 pt-2">
                {user?.uid !== selectedItem.reportedBy && (
                  <button
                    onClick={() => {
                      if (onStartChat) {
                        onStartChat(selectedItem.id, selectedItem.title, selectedItem.reportedBy || '');
                      }
                      handleCloseModal();
                    }}
                    className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="material-icons">chat</span>
                    Contact Reporter
                  </button>
                )}
                <button
                  onClick={handleCloseModal}
                  className={`px-6 py-3 border-2 border-gray-200 hover:border-primary text-gray-600 hover:text-primary font-bold rounded-lg transition-colors ${user?.uid === selectedItem.reportedBy ? 'flex-1' : ''}`}
                >
                  Close
                </button>


              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
});

BrowseView.displayName = 'BrowseView';
