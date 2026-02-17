# Firestore Database Setup Guide

If you're stuck on a loading screen after creating an account, **Firestore Database** is likely not enabled.

## 🔧 Enable Firestore (3 minutes)

### Step 1: Go to Firebase Console
1. Visit [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **campusfind-app**

### Step 2: Enable Firestore
1. In left sidebar, click **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (for development)
4. Click **"Next"**
5. Select a location close to you (e.g., `us-central` or `asia-southeast1`)
6. Click **"Enable"**

### Step 3: Wait for Database
- Firestore takes 1-2 minutes to initialize
- You'll see "Database is ready" when done

## 🔒 Security Rules (Test Mode)

For development, use these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**To update rules:**
1. Firestore Database → Rules tab
2. Paste the rules above
3. Click **"Publish"**

## ✅ Verify It's Working

After enabling Firestore:

1. **Restart dev server:**
   ```bash
   Ctrl+C
   npm run dev
   ```

2. **Try creating an account again**
   - Should work without getting stuck
   - User data will be saved to Firestore

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| "Missing or insufficient permissions" | Update security rules to allow access |
| "Database not found" | Enable Firestore in Firebase Console |
| Stuck on loading | Check browser console for errors |

## 📊 Check Data in Console

After creating an account:
1. Go to Firebase Console → Firestore Database
2. You should see a `users` collection
3. Your user document should be there with all fields

## 🎯 Production Rules (Later)

When deploying, use stricter rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /items/{itemId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

## Quick Checklist

- [ ] Firestore Database enabled in Firebase Console
- [ ] Security rules allow authenticated access
- [ ] Dev server restarted after enabling
- [ ] Browser console shows no errors

**Enable Firestore now and restart your dev server!**
