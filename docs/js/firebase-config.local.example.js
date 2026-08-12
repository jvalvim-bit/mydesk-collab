// Copy this file to firebase-config.local.js and fill it only with a Firebase
// development project or Emulator configuration. This Web config is public;
// it must never contain an Admin SDK private key.
window.MYDESK_FIREBASE_CONFIG = {
  apiKey: 'REPLACE_WITH_DEVELOPMENT_WEB_API_KEY',
  authDomain: 'your-project.firebaseapp.com',
  databaseURL: 'https://your-project-default-rtdb.firebaseio.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:replace-me',
};

// Optional: URL for an isolated local/staging Vercel API. Do not use the
// original MyDesk deployment.
window.MYDESK_API_BASE_URL = 'http://localhost:3000';
