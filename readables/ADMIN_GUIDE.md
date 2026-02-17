# Admin Access Guide

## How to Get Admin Access

### Option 1: Use Admin Email (Recommended for Testing)
Create an account with this specific email:
```
admin@campusfind.com
```

Any account with this email will automatically have admin privileges.

### Option 2: Manual Firestore Update
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to Firestore Database
3. Find your user document in the `users` collection
4. Add field: `isAdmin` = `true`

### Option 3: First User Auto-Admin (Optional)
Modify the signup code to make the first registered user an admin.

## Admin Features Available

### Current Admin Indicators
✅ **Admin Badge** - Shows "ADMIN" label in sidebar next to your name
✅ **isAdmin Property** - Available throughout the app via `useAuth()`

### How to Use in Code

```typescript
import { useAuth } from './context/AuthContext';

const MyComponent = () => {
  const { user, isAdmin } = useAuth();
  
  return (
    <div>
      {isAdmin && (
        <div className="admin-panel">
          <h2>Admin Controls</h2>
          {/* Admin-only features */}
        </div>
      )}
    </div>
  );
};
```

## Suggested Admin Features to Add

### 1. Admin Dashboard
```typescript
// Add to App.tsx routes
case 'admin':
  return isAdmin ? <AdminView /> : <div>Access Denied</div>;
```

### 2. User Management
- View all users
- Ban/unban users
- Reset user passwords
- View user statistics

### 3. Item Moderation
- Delete inappropriate items
- Edit item details
- Mark items as resolved
- View all reported items (not just your own)

### 4. System Notifications
- Send global notifications to all users
- Broadcast important announcements
- Notify about system maintenance

### 5. Analytics
- Total items reported
- Items found vs lost statistics
- User engagement metrics
- Most active locations

## Example: Admin Panel Component

```typescript
// src/views/AdminView.tsx
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';

export const AdminView: React.FC = () => {
  const { isAdmin, user } = useAuth();
  const [users, setUsers] = React.useState([]);
  const [items, setItems] = React.useState([]);

  React.useEffect(() => {
    if (!isAdmin) return;
    
    // Fetch all users
    const fetchUsers = async () => {
      const snapshot = await getDocs(collection(db, 'users'));
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    
    fetchUsers();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
        <p>You need admin privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-soft">
          <h3 className="text-lg font-semibold text-gray-600">Total Users</h3>
          <p className="text-3xl font-bold text-primary">{users.length}</p>
        </div>
        {/* More stats... */}
      </div>
      
      {/* User management table... */}
    </div>
  );
};
```

## Security Rules for Admin

Update Firestore security rules to allow admin access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null && 
        (request.auth.uid == userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /adminSettings/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
  }
}
```

## Quick Test

1. Sign up with `admin@campusfind.com` / any password
2. You should see an **"ADMIN"** badge in the sidebar
3. You can now use `isAdmin` to show/hide admin features

## Next Steps

Would you like me to implement:
- [ ] Admin dashboard view
- [ ] User management system
- [ ] Global notification sender
- [ ] Item moderation tools
- [ ] Analytics/statistics page

Let me know which admin features you'd like!
