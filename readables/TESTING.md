# CampusFind Testing Guide

## Manual Testing Checklist

### 1. HomeView (Dashboard)
- [ ] **Dynamic Greeting**: Shows "Good morning/afternoon/evening" based on time
- [ ] **Stats Cards**: Display total items, lost items, found items counts
- [ ] **Recent Items**: Shows last 5 items with correct type badges
- [ ] **No Redundant Button**: "Report Item" button removed from HomeView

### 2. BrowseView (My Reports)
- [ ] **Search Debounce**: Type in search box, wait 300ms, results update
- [ ] **Clear Search X**: Click X button to clear search input
- [ ] **Filter Buttons**: Click All/Lost/Found to filter items
- [ ] **Category Chips**: Click category buttons to filter
- [ ] **Item Cards**: Display image, title, location, type badge
- [ ] **Delete Button**: Hover over card, delete button appears
- [ ] **Item Modal**: Click card, modal opens with blurred background
- [ ] **Status Dropdown**: Change status from "Still Looking" to "Claimed"
- [ ] **Toast Notification**: Shows "Item deleted" or "Status updated"

### 3. MapView
- [ ] **Map Loads**: Centered on campus location
- [ ] **Lost Markers**: Red markers (#dc2626) for lost items
- [ ] **Found Markers**: Green markers (#0C5449) for found items
- [ ] **Legend**: Shows correct colors in legend
- [ ] **Popups**: Click marker, popup shows item details
- [ ] **No Detroit Opera House**: Location removed from list

### 4. Header/Layout
- [ ] **Notifications Bell**: Click bell icon, dropdown opens
- [ ] **Dropdown Position**: Not clipped, fully visible
- [ ] **Unread Badge**: Shows number of unread notifications
- [ ] **Circular Elements**: Notification dots are perfect circles
- [ ] **Click Outside**: Click elsewhere, dropdown closes
- [ ] **Header Search**: Type and press Enter, navigates to Browse

### 5. ReportView
- [ ] **Form Validation**: Empty fields show validation errors
- [ ] **Image Upload**: Select image, preview shows
- [ ] **Location Select**: Dropdown shows all locations
- [ ] **Category Select**: Dropdown shows categories
- [ ] **Submit**: Form submits, success toast shows
- [ ] **New Item Appears**: Item appears in BrowseView

### 6. Toast System
- [ ] **Success Toast**: Green toast on successful actions
- [ ] **Error Toast**: Red toast on errors
- [ ] **Auto Dismiss**: Toast disappears after 3 seconds
- [ ] **Multiple Toasts**: Can show multiple toasts stacked

### 7. Error Handling
- [ ] **Error Boundary**: App shows error fallback on crash
- [ ] **API Errors**: Network errors show toast notification

## Performance Testing
- [ ] **Fast Load**: App loads in under 2 seconds
- [ ] **Smooth Scrolling**: No lag when scrolling item lists
- [ ] **Search Performance**: Typing doesn't cause lag (debounced)
- [ ] **Image Loading**: Images load with skeleton placeholder

## How to Test

1. **Start Dev Server**: `npm run dev`
2. **Open Browser**: http://localhost:5173/
3. **Test Each Feature**: Go through checklist above
4. **Check Console**: No errors in browser console
5. **Check Network**: API calls succeed in Network tab

## Reporting Issues

If you find any issues:
1. Note the page/feature
2. Describe expected vs actual behavior
3. Check browser console for errors
4. Report back with details
