# CampusFind - Campus Lost & Found Management System

CampusFind is a comprehensive web application designed to help students and staff report, track, and recover lost items on campus. Built with modern web technologies and Firebase integration, it provides a centralized platform for lost and found management with real-time features.

## Features

### Core Functionality
- **Lost & Found Reporting** - Report lost or found items with photos and details
- **Real-time Item Browsing** - Search and filter items across campus
- **Smart Item Matching** - AI-powered matching using Gemini API
- **Real-time Chat** - Instant messaging between users
- **Notifications System** - Real-time notifications for important events

### Advanced Features
- **Firebase Authentication** - Secure user registration and login
- **Gamification System** - Points, streaks, achievements, and leaderboard
- **Admin Dashboard** - Complete admin interface for user and item management
- **Email Notifications** - Automated email alerts for key actions
- **Advanced Search** - Filter by date, location, category, and status

### Technical Features
- **TypeScript** - Type-safe development throughout
- **React 19** - Modern React with hooks and patterns
- **Firebase Integration** - Authentication, Firestore, Realtime Database
- **Responsive Design** - Mobile-friendly interface
- **Performance Optimized** - React.memo, useCallback, lazy loading

## Key Benefits

- **Increased Recovery Rates** - Smart matching helps return items faster
- **Time Savings** - Automated notifications and streamlined processes
- **Enhanced User Experience** - Modern, intuitive interface
- **Data-Driven Insights** - Analytics and reporting for campus administration
- **Community Engagement** - Gamification encourages participation

## Prerequisites

- Node.js (v18 or higher)
- Firebase project with configured services
- Gemini API key (for AI features)

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

## Firebase Setup

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create new project
   - Enable Authentication (Email/Password)
   - Enable Firestore Database
   - Enable Realtime Database

2. **Configure Firebase**
   - Copy configuration from Firebase Console
   - Add to your `.env` file
   - Deploy security rules (see documentation)

## Technologies Used

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Firebase (Authentication, Firestore, Realtime Database)
- **AI**: Google Gemini API
- **Build Tools**: Vite, ESLint, PostCSS
- **Deployment**: Firebase Hosting

## 🎯 Use Cases

1. **Student Lost Item** - Report lost item, get notified when found
2. **Student Found Item** - Report found item, help owner recover it
3. **Campus Admin** - Manage items, users, and analytics
4. **Community Building** - Help others, earn points, climb leaderboard

## 📈 Analytics

The system tracks:
- Item recovery rates
- User activity patterns
- Return rate trends
- Category-wise statistics
- User engagement metrics

## Deployment

### Firebase Hosting
```bash
# Build the app
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

##  Contributing

1. Fork the repository
2. Create feature branch
3. Make your changes
4. Add tests if applicable
5. Submit pull request