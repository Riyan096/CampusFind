import { ItemType, ItemCategory, LostItemStatus, FoundItemStatus } from '../types';

export interface FilterState {
  dateRange: 'all' | 'today' | 'week' | 'month';
  startDate: string;
  endDate: string;
  locations: string[];
  status: (LostItemStatus | FoundItemStatus)[];
  categories: ItemCategory[];
  type: ItemType | 'ALL';
  sortBy: 'newest' | 'oldest' | 'alphabetical';
}

export const defaultFilters: FilterState = {
  dateRange: 'all',
  startDate: '',
  endDate: '',
  locations: [],
  status: [],
  categories: [],
  type: 'ALL',
  sortBy: 'newest'
};
