/**
 * Core type definitions for CampusFind application
 * @module types
 */

/** Represents the type of item being reported */
export enum ItemType {
  LOST = 'LOST',
  FOUND = 'FOUND'
}

/** Represents the current status of an item */
export enum ItemStatus {
  OPEN = 'OPEN',
  CLAIMED = 'CLAIMED',
  RETURNED = 'RETURNED',
  CLOSED = 'CLOSED'
}

/** Categories for organizing items */
export enum ItemCategory {
  ELECTRONICS = 'Electronics',
  CLOTHING = 'Clothing',
  ACCESSORIES = 'Accessories',
  BOOKS = 'Books',
  KEYS = 'Keys',
  WALLET = 'Wallet',
  ID_CARD = 'ID Card',
  JEWELRY = 'Jewelry',
  SPORTS = 'Sports Equipment',
  OTHER = 'Other'
}

/** Campus locations where items can be found or lost */
export enum CampusLocation {
  KRESGE_LIBRARY = 'Kresge Library',
  UNDERGRAD_LIBRARY = 'Undergrad Library',
  LAW_LIBRARY = 'Law Library',
  ART_BUILDING = 'Art Building',
  SCIENCE_HALL = 'Science Hall',
  ENGINEERING = 'Engineering Building',
  BUSINESS_SCHOOL = 'Business School',
  LAW_SCHOOL = 'Law School',
  CHEMISTRY = 'Chemistry Building',
  BIOLOGICAL_SCIENCES = 'Biological Sciences',
  WILSON_HALL = 'Wilson Hall',
  OLD_MAIN = 'Old Main',
  STEM_SILC = 'STEM SILC',
  STUDENT_CENTER = 'Student Center',
  UNIVERSITY_AUDITORIUM = 'University Auditorium',
  ANTHONY_APARTMENTS = 'Anthony Apartments',

  ATCHISON_HALL = 'Atchison Hall',
  TOWERS_RESIDENCES = 'Towers Residences',
  CHATSWORTH_SUITES = 'Chatsworth Suites',
  YOUSIF_GHAFAIRI_HALL = 'Yousif Ghafari Hall',
  FITNESS_CENTER = 'Fitness Center',
  MATTHAEI_PE_CENTER = 'Matthaei PE Center',
  WAYNE_STATE_FIELDHOUSE = 'Wayne State Fieldhouse',
  TOWERS_CAFE = 'Towers Cafe',
  PARKING_1 = 'Parking Structure 1',
  PARKING_2 = 'Parking Structure 2',
  PARKING_3 = 'Parking Structure 3',
  PARKING_4 = 'Parking Structure 4',
  PARKING_5 = 'Parking Structure 5',
  PARKING_6 = 'Parking Structure 6',
  PARKING_7 = 'Parking Structure 7',
  PARKING_8 = 'Parking Structure 8',
  TECHTOWN = 'TechTown',
  OTHER = 'Other Location'
}

/** Represents a lost or found item in the system */
export interface Item {
  /** Unique identifier for the item */
  id: string;
  /** Whether the item was lost or found */
  type: ItemType;
  /** Short title describing the item */
  title: string;
  /** Detailed description of the item */
  description: string;
  /** Category the item belongs to */
  category: ItemCategory;
  /** Location where the item was lost or found */
  location: CampusLocation;
  /** ISO date string when the item was reported */
  date: string;
  /** Current status of the item */
  status: ItemStatus;
  /** Optional URL to the item's image */
  imageUrl?: string;
  /** AI-generated tags for better searchability */
  aiTags?: string[];
  /** ID of the user who reported the item */
  reportedBy?: string;
  /** Name of the user who reported the item */
  reporterName?: string;
  /** ID of the user who claimed the item */
  claimedBy?: string;

}

/** User statistics and achievements */
export interface UserStats {
  /** Total points earned */
  points: number;
  /** Number of items the user has returned */
  itemsReturned: number;
  /** Number of items the user has reported */
  itemsReported: number;
  /** ISO date string of last activity */
  lastActive: string;
  /** Number of items the user has claimed */
  itemsClaimed: number;
  /** Array of earned badge IDs */
  badges: string[];
}

/** Badge definition for achievements */
export interface Badge {
  /** Unique identifier for the badge */
  id: string;
  /** Display name of the badge */
  name: string;
  /** Description of how to earn the badge */
  description: string;
  /** Icon name from Material Icons */
  icon: string;
  /** Points required to earn this badge */
  pointsRequired: number;
}

/** Props for view components that display items */
export interface ItemsViewProps {
  /** Array of items to display */
  items: Item[];
  /** Callback when an item is clicked */
  onItemClick?: (item: Item) => void;
  /** Callback when items data changes */
  onItemsChange?: () => void;
}

/** Search and filter options for items */
export interface ItemFilters {
  /** Search query string */
  search?: string;
  /** Filter by item type */
  type?: ItemType | 'ALL';
  /** Filter by category */
  category?: ItemCategory | 'ALL';
  /** Filter by location */
  location?: CampusLocation | 'ALL';
  /** Filter by status */
  status?: ItemStatus | 'ALL';
}

/** API response structure for AI analysis */
export interface AIAnalysisResult {
  /** Generated title for the item */
  title: string;
  /** Generated description */
  description: string;
  /** Suggested category */
  category: ItemCategory;
  /** Detected color */
  color: string;
  /** AI-generated tags */
  tags: string[];
  /** Suggested location (optional) */
  location?: CampusLocation;
}

/** Toast notification data */
export interface ToastData {
  /** Unique identifier for the toast */
  id: string;
  /** Message to display */
  message: string;
  /** Type of notification */
  type: 'success' | 'error' | 'info' | 'warning';
  /** Duration in milliseconds before auto-dismiss */
  duration?: number;
}
