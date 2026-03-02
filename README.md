# CampusFind - Campus Lost & Found Management System

CampusFind is a web app for reporting and finding lost items on campus. Built with React and Firebase, it helps students and staff manage lost and found items with real-time features.

## Features

- **Lost & Found Reporting** - Report items with photos and details
- **Real-time Item Browsing** - Search and filter items across campus
- **Smart Item Matching** - AI-powered matching using Gemini API
- **Real-time Chat** - Instant messaging between users
- **Notifications System** - Real-time notifications for important events
- **Firebase Authentication** - Secure user registration and login
- **Gamification System** - Points, streaks, achievements, and leaderboard
- **Admin Dashboard** - Complete admin interface for user and item management
- **Email Notifications** - Automated email alerts for key actions
- **Advanced Search** - Filter by date, location, category, and status

## Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/CampusFind.git
cd CampusFind
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your Firebase credentials
# Add your Firebase API keys and Gemini API key
```

4. **Start the development server**
```bash
npm run dev
```

5. **Open your browser**
Visit http://localhost:5173

## Technologies Used

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Firebase (Authentication, Firestore, Realtime Database)
- **AI**: Google Gemini API
- **Build Tools**: Vite, ESLint, PostCSS
- **Deployment**: Firebase Hosting

## Use Cases

1. **Student Lost Item** - Report lost item, get notified when found
2. **Student Found Item** - Report found item, help owner recover it
3. **Campus Admin** - Manage items, users, and analytics
4. **Community Building** - Help others, earn points, climb leaderboard

## Deployment

### Firebase Hosting
```bash
# Build the app
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Make your changes
4. Add tests if applicable
5. Submit pull request