export enum ItemType {
  LOST = 'LOST',
  FOUND = 'FOUND'
}

export enum ItemCategory {
  ELECTRONICS = 'Electronics',
  CLOTHING = 'Clothing',
  KEYS = 'Keys',
  ID_CARDS = 'ID Cards',
  BOOKS = 'Books',
  OTHER = 'Other'
}

// Status for LOST items (from owner's perspective)
export enum LostItemStatus {
  STILL_LOST = 'STILL_LOST',      // Item is still missing
  MATCH_FOUND = 'MATCH_FOUND',    // Potential match found
  CLAIMED = 'CLAIMED',            // Owner found their item
  RECOVERED = 'RECOVERED'         // Successfully returned to owner
}

// Status for FOUND items (from finder's perspective)
export enum FoundItemStatus {
  AVAILABLE = 'AVAILABLE',        // Found, waiting for owner
  PENDING_CLAIM = 'PENDING_CLAIM', // Someone claims it's theirs
  RETURNED = 'RETURNED',          // Successfully returned to owner
  UNCLAIMED = 'UNCLAIMED'         // No one claimed it after period
}

// Legacy status enum for backward compatibility
export enum ItemStatus {
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  RESOLVED = 'RESOLVED'
}


export enum CampusLocation {
  // Libraries
  KRESGE_LIBRARY = "Kresge Library",
  UNDERGRAD_LIBRARY = "David Adamany Undergraduate Library",
  LAW_LIBRARY = "Arthur Neef Law Library",

  // Academic / Class Buildings
  ART_BUILDING = "Art Building",
  SCIENCE_HALL = "Science Hall",
  ENGINEERING = "James and Patricia Anderson College of Engineering",
  BUSINESS_SCHOOL = "Business, Mike Ilitch School of Business",
  LAW_SCHOOL = "Law School Building",
  CHEMISTRY = "Chemistry Building",
  BIOLOGICAL_SCIENCES = "Biological Sciences Building",
  WILSON_HALL = "M. Roy Wilson State Hall",
  OLD_MAIN = "Old Main",
  STEM_SILC = "STEM Innovation Learning Center (SILC)",

  // Student Centers & Common Areas
  STUDENT_CENTER = "Student Center",
  UNIVERSITY_AUDITORIUM = "University Auditorium",
  DETROIT_OPERA_HOUSE = "Detroit Opera House",

  // Residence Halls / Dorms
  ANTHONY_APARTMENTS = "Anthony Wayne Drive Apartments",
  ATCHISON_HALL = "Leon H. Atchison Residence Hall",
  TOWERS_RESIDENCES = "Towers Residential Suites",
  CHATSWORTH_SUITES = "Chatsworth Suites",
  YOUSIF_GHAFAIRI_HALL = "Yousif B. Ghafari Hall",

  // Fitness / Recreation
  FITNESS_CENTER = "Mort Harris Recreation and Fitness Center",
  MATTHAEI_PE_CENTER = "Matthaei Physical Education Center",
  WAYNE_STATE_FIELDHOUSE = "Wayne State Fieldhouse",

  // Cafeteria / Food
  TOWERS_CAFE = "Towers Cafe",

  // Parking
  PARKING_1 = "Parking Structure 1",
  PARKING_2 = "Parking Structure 2",
  PARKING_3 = "Parking Structure 3",
  PARKING_4 = "Parking Structure 4",
  PARKING_5 = "Parking Structure 5",
  PARKING_6 = "Parking Structure 6",
  PARKING_7 = "Parking Structure 7",
  PARKING_8 = "Parking Structure 8",

  // Other / Misc
  TECHTOWN = "TechTown",
  OTHER = "Other"
}

// Union type for all possible item statuses
export type ItemStatusType = ItemStatus | LostItemStatus | FoundItemStatus | string;

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  category: ItemCategory;
  location: CampusLocation;
  date: string;
  imageUrl?: string;
  status: ItemStatusType;
  userContact?: string;
  aiTags?: string[];
  reportedBy?: string;
  reporterName?: string;
  createdAt?: string;
  updatedAt?: string;
}




export interface UserStats {
  points: number;
  itemsReported: number;
  itemsReturned: number;
  lastActive: string;
  itemsClaimed: number;
  badges: string[];
}
