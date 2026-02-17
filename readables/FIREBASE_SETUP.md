# Firebase Setup Guide for CampusFind

This guide will walk you through setting up Firebase for User Authentication, Real-time Notifications, and Chat System.

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter project name: `campusfind-app`
4. Disable Google Analytics (or enable if you want analytics)
5. Click "Create project"
6. Wait for project creation, then click "Continue"

## Step 2: Register Your App

1. Click the web icon (</>) to add a web app
2. Enter app nickname: `campusfind-web`
3. Check "Also set up Firebase Hosting" (optional)
4. Click "Register app"
5. **IMPORTANT**: Copy the Firebase configuration object shown
6. Click "Continue to console"

## Step 3: Enable Authentication

1. In left sidebar, click "Authentication"
2. Click "Get started"
3. Click "Email/Password" in the Native providers section
4. Toggle "Enable" to ON
5. Click "Save"
6. (Optional) Enable "Email link (passwordless sign-in)" if desired

## Step 4: Create Firestore Database

1. In left sidebar, click "Firestore Database"
2. Click "Create database"
3. Select "Start in test mode" (we'll secure it later)
4. Click "Next"
5. Choose location closest to your users (e.g., `us-central`)
6. Click "Enable"

## Step 5: Create Realtime Database (for Chat)

1. In left sidebar, click "Realtime Database"
2. Click "Create Database"
3. Select "Start in test mode"
4. Click "Enable"

## Step 6: Get Your Configuration

Your Firebase config should look like this:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

**Copy this configuration - you'll need to provide it to me!**

## Step 7: Install Firebase SDK

Run this command in your project:

```bash
npm install firebase
```

## Step 8: Security Rules (After Setup)

Once I implement the features, we'll update these security rules:

**Firestore Rules:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /notifications/{notificationId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    match /items/{itemId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.reportedBy;
    }
  }
}
```

**Realtime Database Rules:**
```
{
  "rules": {
    "chats": {
      "$chatId": {
        ".read": "auth != null && root.child('chats').child($chatId).child('participants').child(auth.uid).exists()",
        ".write": "auth != null && root.child('chats').child($chatId).child('participants').child(auth.uid).exists()",
        "messages": {
          "$messageId": {
            ".write": "auth != null"
          }
        }
      }
    }
  }
}
```

## Next Steps

1. Complete the setup above
2. Copy your Firebase configuration
3. Provide the configuration to me
4. I'll implement all the features!

**Ready to proceed?** Share your Firebase config and I'll start implementing User Auth, Notifications, and Chat!
