const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;
let auth;
let storage;

function initializeFirebase() {
  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      console.log('Firebase Admin already initialized');
      return admin.apps[0];
    }

    let serviceAccount;
    
    // Try to load service account from file
    const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = require(serviceAccountPath);
    } else {
      // Use environment variables if file not found
      if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
        console.error('Firebase config missing: no service account file or env vars');
        return null;
      }
      serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      };
    }

    const config = {
      credential: admin.credential.cert(serviceAccount),
    };

    if (process.env.FIREBASE_STORAGE_BUCKET && process.env.FIREBASE_STORAGE_BUCKET !== 'your_project.appspot.com') {
      config.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    }

    const app = admin.initializeApp(config);

    db = admin.firestore();
    auth = admin.auth();
    if (config.storageBucket) {
      storage = admin.storage();
    }

    console.log('Firebase Admin initialized successfully');
    return app;
  } catch (error) {
    console.error('Firebase initialization error:', error.message);
    return null;
  }
}

initializeFirebase();

module.exports = {
  admin,
  getDb: () => {
    if (!db) {
      console.warn('Firestore not initialized - calling initializeFirebase');
      initializeFirebase();
    }
    return db;
  },
  getAuth: () => auth,
  getStorage: () => storage
};
