const admin = require('firebase-admin');
const path = require('path');

let db;
let auth;
let storage;

function initializeFirebase() {
  try {
    // Check if already initialized
    if (admin.apps.length > 0) {
      return admin.apps[0];
    }

    let serviceAccount;
    
    // Try to load service account from file
    try {
      serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
    } catch (e) {
      // Use environment variables if file not found
      serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      };
    }

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });

    db = admin.firestore();
    auth = admin.auth();
    storage = admin.storage();

    console.log('Firebase Admin initialized successfully');
    return app;
  } catch (error) {
    console.error('Firebase initialization error:', error.message);
    // Initialize with mock for development
    return null;
  }
}

initializeFirebase();

module.exports = {
  admin,
  getDb: () => db || admin.firestore(),
  getAuth: () => auth || admin.auth(),
  getStorage: () => storage || admin.storage()
};
