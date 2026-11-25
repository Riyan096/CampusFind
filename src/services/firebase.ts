// Firebase configuration and initialization
import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate that required environment variables are set
if (!firebaseConfig.apiKey) {
  throw new Error("Firebase API key is missing. Check your .env file.");
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// App Check must be initialized immediately after the Firebase app and before
// Firestore, Realtime Database, Storage, or callable Functions are initialized.
// The reCAPTCHA Enterprise site key is public client configuration, not a secret.
const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?.trim();

export const appCheck = appCheckSiteKey
  ? initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

if (import.meta.env.PROD && !appCheckSiteKey) {
  throw new Error(
    "Firebase App Check is required in production. Set VITE_RECAPTCHA_ENTERPRISE_SITE_KEY " +
    "after registering this web app with reCAPTCHA Enterprise in Firebase."
  );
}

// Initialize services only after App Check has been initialized.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

export default app;
