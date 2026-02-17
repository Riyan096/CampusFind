# 🔒 Security & Version Control Guide

## ✅ What Was Just Fixed

### API Key Security
- **Before**: API keys were hardcoded in `src/services/firebase.ts` (visible to anyone with code access)
- **After**: API keys moved to `.env` file (excluded from Git, never committed)

### Files Changed
1. `.env` - Created with your Firebase credentials (NOT committed to Git)
2. `.env.example` - Template showing required variables (committed to Git)
3. `src/services/firebase.ts` - Now uses `import.meta.env` to load from `.env`

---

## 🔄 Version Control (Git) - Complete Guide

### Daily Workflow

```bash
# 1. Check what changed
git status

# 2. Review your changes
git diff

# 3. Stage files you want to save
git add src/views/ChatView.tsx
# OR stage all changes
git add .

# 4. Commit with descriptive message
git commit -m "Fix: Leave chat now works with single click"

# 5. View commit history
git log --oneline
```

### Creating Checkpoints (Branches)

```bash
# Create a new branch for experimental work
git checkout -b feature/new-feature-name

# Work on your changes...
# Then commit them
git add .
git commit -m "Add new feature"

# If it works, merge back to main
git checkout main
git merge feature/new-feature-name

# If it fails, just delete the branch
git branch -D feature/new-feature-name
```

### Going Back in Time

```bash
# See recent commits
git log --oneline

# Revert last commit (keeps history, creates new commit)
git revert HEAD

# Reset to specific commit (DESTRUCTIVE - loses changes after that commit)
git reset --hard abc1234  # Replace abc1234 with actual commit hash

# See what files changed in last commit
git diff HEAD~1

# See what changed in a specific file
git diff HEAD~1 src/views/ChatView.tsx
```

### Viewing History

```bash
# See all commits
git log --oneline --graph --all

# See what changed in a file over time
git log -p src/views/ChatView.tsx

# See who changed what and when
git blame src/views/ChatView.tsx
```

---

## 🔐 Security Best Practices

### 1. Environment Variables (DONE ✅)

**Never commit `.env` files!** They contain secrets.

```bash
# .gitignore already includes:
.env
.env.local
.env.*.local
```

### 2. API Key Rotation (If Compromised)

If your API key was exposed (like in Git history):

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Project Settings → General → Web API Key
3. Click "Rotate Key" or create new project
4. Update your `.env` file with new key
5. **Never commit the new key!**

### 3. Firebase Security Rules

Your Firebase should have these security rules:

```javascript
// Firestore Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Items are readable by all authenticated users
    match /items/{itemId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        (resource.data.reportedBy == request.auth.uid || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
    }
    
    // Notifications are private to each user
    match /notifications/{notificationId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
```

### 4. Git History Cleanup (If Keys Were Committed)

If you accidentally committed API keys:

```bash
# Install git-filter-repo (one time)
pip install git-filter-repo

# Remove sensitive file from ALL history
git filter-repo --path src/services/firebase.ts --invert-paths

# Or use BFG Repo-Cleaner for simpler cases
# Download from: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --replace-text passwords.txt my-repo.git
```

**⚠️ Warning**: This rewrites Git history. All collaborators must re-clone the repo.

---

## 📋 Pre-Commit Checklist

Before every commit, run:

```bash
# 1. Check no secrets in staged files
git diff --cached | grep -i "apikey\|api_key\|password\|secret"

# 2. Verify .env is not staged
git status | grep ".env"

# 3. Run build to catch errors
npm run build

# 4. Run linting
npm run lint
```

---

## 🆘 Emergency Recovery

### Scenario 1: "I broke something, need to go back!"

```bash
# See what you changed
git diff

# Undo uncommitted changes
git checkout -- src/views/ChatView.tsx

# Or undo all uncommitted changes
git checkout -- .
```

### Scenario 2: "I committed something bad!"

```bash
# Undo last commit but keep changes
git reset --soft HEAD~1

# Undo last commit and discard changes
git reset --hard HEAD~1

# Or revert (creates new commit that undoes changes)
git revert HEAD
```

### Scenario 3: "I need to see what the code looked like yesterday"

```bash
# See commits from yesterday
git log --since="yesterday" --oneline

# Checkout specific commit (read-only)
git checkout abc1234

# Go back to main when done
git checkout main
```

---

## 🎯 Quick Reference Card

| Task | Command |
|------|---------|
| Check status | `git status` |
| Stage file | `git add filename` |
| Stage all | `git add .` |
| Commit | `git commit -m "message"` |
| View history | `git log --oneline` |
| Create branch | `git checkout -b branch-name` |
| Switch branch | `git checkout branch-name` |
| Merge branch | `git merge branch-name` |
| Undo uncommitted | `git checkout -- filename` |
| Undo last commit | `git reset --soft HEAD~1` |
| See changes | `git diff` |

---

## 📚 Additional Resources

- [Git Cheat Sheet](https://education.github.com/git-cheat-sheet-education.pdf)
- [Oh Shit, Git!?!](https://ohshitgit.com/) - Fixing common Git mistakes
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Vite Env Variables](https://vitejs.dev/guide/env-and-mode.html)
