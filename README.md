# CampusFind

> A campus-focused lost & found platform built to help students and staff report, discover, match, and recover lost belongings.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Backend-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-AI-8E75B2)](https://ai.google.dev/)

CampusFind is a full-stack web application currently focused on **Wayne State University**. It combines a modern React frontend with Firebase services for authentication, data storage, real-time communication, notifications, file uploads, server-side workflows, and AI-assisted item matching.

The project is being developed with a strong emphasis on **security, server-authoritative workflows, clean architecture, and a polished user experience** rather than simply building a CRUD prototype.

---

## What CampusFind Does

CampusFind gives a campus community one place to handle the entire lost-and-found workflow:

- 📋 **Report lost or found items** with descriptions, categories, locations, and photos
- 🔎 **Browse and search listings** using filters such as category, location, date, and status
- 🤖 **AI-assisted matching** to help identify potential matches between lost and found reports
- 💬 **Real-time chat** between users involved in an item recovery
- 🔔 **Notifications** for matches, messages, status changes, and other important activity
- 📧 **Email notifications** for key account and item events
- 🏆 **Gamification** with points, achievements, activity streaks, and leaderboards
- 🛡️ **Admin tools** for managing users, items, and campus activity
- 🗺️ **Campus-aware location data** for finding items around university locations
- 🔐 **Firebase Authentication** for authenticated application access

---

## 🧩 Core Features

### Lost & Found Workflow

CampusFind models the recovery process rather than treating an item as a simple database record.

**Lost item:**

`Still Lost → Match Found → Claimed → Recovered`

**Found item:**

`Available → Pending Claim → Returned / Unclaimed`

Status transitions are validated on the server so clients cannot arbitrarily change an item's lifecycle state.

### AI-Powered Matching

CampusFind uses Google's Gemini API to assist with matching potentially related lost and found reports. Matching can consider information such as:

- Item descriptions
- Categories
- Locations
- AI-generated tags
- Other item metadata

AI suggestions are treated as assistance rather than an authoritative decision, keeping the recovery process user-driven.

### Real-Time Messaging

The chat system uses Firebase Realtime Database for low-latency communication. Conversations contain participant information, messages, timestamps, delivery/read state, and recent-message metadata.

The real-time chat security model is actively being hardened to ensure users can only access and modify conversations they are authorized to participate in.

### Gamification

Helping return an item can contribute to a user's campus reputation through:

- Points
- Items returned
- Activity streaks
- Achievements / badges
- Leaderboards

Reward calculations and point awards are handled through protected server-side workflows to prevent client-side reward manipulation.

### Notifications

CampusFind supports notifications for important events such as:

- Potential item matches
- New chat messages
- Item status updates
- System announcements

Notifications can be delivered through the application's notification system and, where appropriate, email.

---

## 🏗️ Architecture

CampusFind follows a service-oriented frontend architecture backed by Firebase.

```text
┌─────────────────────────────────────────────────────────┐
│                    React + TypeScript                   │
│                                                         │
│  Views • Components • Hooks • Context • UI State        │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     Service Layer                       │
│                                                         │
│ Items • Chat • Matching • Notifications • Storage       │
│ Gamification • Email • Geocoding • Firebase             │
└───────────────┬───────────────────┬─────────────────────┘
                │                   │
        ┌───────▼───────┐   ┌──────▼─────────┐
        │   Firestore   │   │ Realtime DB    │
        │               │   │                │
        │ Items / Users │   │ Chats / Msgs   │
        │ Notifications │   │                │
        └───────────────┘   └────────────────┘
                │
        ┌───────▼────────────────────────────────────────┐
        │             Firebase Functions                 │
        │                                                │
        │ Server-authoritative workflows • Rewards       │
        │ Protected business logic • Validation          │
        └──────────────────────┬─────────────────────────┘
                               │
                     ┌─────────▼─────────┐
                     │   Gemini / AI     │
                     │ Matching Support  │
                     └───────────────────┘
```

### Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS, Sass |
| Authentication | Firebase Authentication |
| Primary database | Cloud Firestore |
| Real-time messaging | Firebase Realtime Database |
| Server-side logic | Firebase Cloud Functions |
| File storage | Firebase Storage |
| AI | Google Gemini API |
| Maps / location | Leaflet + geocoding services |
| Testing | Firebase Emulator Suite + Node test runner |
| Code quality | ESLint + TypeScript |
| Hosting | Firebase Hosting |

---

## 🔐 Security Engineering

Security is an ongoing part of the project rather than an afterthought.

Recent hardening work includes:

- Server-authoritative item status transitions
- Atomic item resolution and reward workflows
- Idempotent reward handling
- Protection against concurrent reward duplication
- Firestore field-level update restrictions
- Client protection against modifying item ownership and lifecycle fields
- Protected user statistics
- Client protection against creating, modifying, or deleting point-award records
- Firebase Emulator tests for authorization and rule enforcement
- Validation of legal item-state transitions

The next security milestone is hardening the **Realtime Database chat rules**, including conversation membership, sender identity, immutable message metadata, participant management, and message deletion.

> **Security note:** CampusFind is an actively developed project. Security controls and infrastructure are continuously being reviewed and improved.

---

## 🧪 Testing & Development Quality

Firebase Emulator Suite tests are used to verify security-sensitive backend behavior without relying on production data.

Current Firestore rule coverage includes tests for:

- Allowed item updates
- Protected ownership fields
- Protected item status and type
- Arbitrary field injection
- Protected server-managed user statistics
- Valid profile updates
- Point-award creation protection
- Point-award modification protection
- Point-award deletion protection

The current Firestore security-rule suite has **10/10 passing tests**.

Example commands:

```bash
# Run Firestore security-rule tests
npm run test:rules

# Run Cloud Functions / resolution emulator tests
npm run test:emulator
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have:

- Node.js installed
- npm installed
- A Firebase project
- Firebase CLI installed or available through the project tooling
- A Google Gemini API key if AI functionality is enabled

### 1. Clone the repository

```bash
git clone https://github.com/Riyan096/CampusFind.git
cd CampusFind
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file from the provided example:

```bash
cp .env.example .env
```

Then configure the required Firebase and AI credentials for your local environment.

**Never commit real API keys, Firebase secrets, or other private credentials.**

### 4. Start the development server

```bash
npm run dev
```

The Vite development server will normally be available at:

```text
http://localhost:5173
```

### 5. Run checks and tests

```bash
npm run lint
npm run build
npm run test:rules
npm run test:emulator
```

---

## 📁 Project Structure

```text
CampusFind/
├── functions/                 # Firebase Cloud Functions
│   ├── src/                   # Server-side business logic
│   └── test/                  # Emulator tests
├── src/
│   ├── components/            # Reusable UI components
│   ├── context/               # React application contexts
│   ├── hooks/                 # Reusable React hooks
│   ├── services/              # Firebase/API/service layer
│   │   ├── chatService.ts
│   │   ├── firebase.ts
│   │   ├── gamificationService.ts
│   │   ├── geminiService.ts
│   │   ├── itemService.ts
│   │   ├── matchingService.ts
│   │   └── notificationService.ts
│   ├── utils/                 # Shared utilities and sanitization
│   ├── views/                 # Application pages/views
│   ├── App.tsx                # Application shell
│   └── main.tsx               # React entry point
├── database.rules.json        # Realtime Database security rules
├── firestore.rules            # Firestore security rules
├── firebase.json              # Firebase project configuration
├── firestore.indexes.json     # Firestore indexes
└── README.md
```

---

## 🎯 Project Goals

CampusFind is being developed as a serious portfolio project that demonstrates more than frontend implementation.

The longer-term goals include:

- Build a secure, production-quality campus platform
- Improve real-world Firebase security architecture
- Demonstrate server-authoritative application design
- Build reliable real-time communication
- Explore practical AI-assisted workflows
- Create useful search and matching experiences
- Develop trust and reputation features for campus communities
- Improve accessibility, performance, and responsive UX
- Expand administrative and moderation capabilities

---

## 🗺️ Roadmap

### Completed / In Progress

- [x] Core lost & found reporting
- [x] Item browsing and filtering
- [x] Firebase authentication
- [x] Real-time chat foundation
- [x] Notifications
- [x] Gamification foundation
- [x] AI matching foundation
- [x] Server-authoritative item resolution
- [x] Firestore rules hardening
- [x] Protected point-award workflow
- [x] Emulator coverage for critical Firestore security rules
- [ ] Realtime Database chat security hardening

### Planned

- [ ] Stronger privacy controls
- [ ] Storage security hardening
- [ ] Improved chat UX and moderation
- [ ] More advanced item matching
- [ ] Better campus search and filtering
- [ ] Notification preferences
- [ ] Reputation and trust improvements
- [ ] Performance and caching improvements
- [ ] Expanded admin and moderation tooling
- [ ] Accessibility and UX polish

---

## 🏫 Current Scope

CampusFind is currently designed around **Wayne State University** and its campus environment. The application is intentionally campus-focused, with university locations and workflows influencing the product design.

The architecture is intended to make future expansion to additional campuses possible without changing the core lost-and-found workflow.

---

## 🤝 Contributing

Contributions and feedback are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Add or update tests when changing security-sensitive behavior.
5. Run lint, build, and relevant emulator tests.
6. Open a pull request with a clear description of the change.

For security-sensitive changes, please include the relevant threat model or authorization assumptions in the pull request description when possible.

---

## 📌 Project Status

**Active development**

CampusFind is a continuously evolving portfolio project. Features, security rules, backend workflows, and UX are being iterated on as the application moves toward a more production-ready architecture.

---

## 👨‍💻 Author

Built by **Riyan Ahmed** as a software engineering portfolio project focused on modern web development, Firebase architecture, security engineering, real-time systems, and practical AI integration.

---

## 📄 License

No open-source license has currently been specified for this repository. Unless a license is added, the project's source code should be treated as **all rights reserved**.
