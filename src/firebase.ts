import firebase from 'firebase-admin';
import logger from './utils/logger.js';
// Use Node.js require to import firebase-admin to handle Bun compatibility issues

const requiredVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_PRIVATE_KEY_ID',
  'FIREBASE_CLIENT_X509_CERT_URL'
];

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (varName === 'FIREBASE_PRIVATE_KEY' && value) {
    logger.info(`${varName}: defined (length: ${typeof value === 'string' ? value.length : 'unknown'})`);
  } else {
    logger.info(`${varName}: ${value ? 'defined' : 'MISSING'}`);
  }
  if (!value) {
    logger.error(`Firebase variable ${varName} is missing - Google OAuth will not work`);
  }
});

// Additional validation for private key format
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
  logger.info(`Private key starts with: ${privateKey.substring(0, 30)}...`);
  logger.info(`Private key ends with: ...${privateKey.substring(privateKey.length - 30)}`);
  logger.info(`Private key contains BEGIN marker: ${privateKey.includes('BEGIN PRIVATE KEY')}`);
  logger.info(`Private key contains END marker: ${privateKey.includes('END PRIVATE KEY')}`);
}

// Format the private key properly (replace escaped newlines with actual newlines)
const formatPrivateKey = (key: string | undefined): string | undefined => {
  if (!key) return key;
  // Replace escaped newlines and other escape sequences
  return key.replace(/\\n/g, '\n').replace(/\\'/g, "'");
};

const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY,
  private_key: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY), 
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: process.env.FIREBASE_PRIVATE_KEY_ID,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};
let firebaseAdmin: typeof firebase | null = firebase;
let firestore: any = null;
let auth: any = null;
let storage: any = null;

try {
  logger.info('Attempting to initialize Firebase Admin...');
  logger.info(`Firebase project ID from env: ${process.env.FIREBASE_PROJECT_ID}`);
  logger.info(`Firebase apps count before init: ${firebase.apps ? firebase.apps.length : 'undefined'}`);

  // Verify that admin is imported properly
  if (firebase && typeof firebase.initializeApp === 'function') {
    // Check if already initialized - use a safer approach
    if (!firebase.apps || firebase.apps.length === 0) {
      logger.info('No existing Firebase apps found, initializing fresh...');
      // Initialize the Firebase Admin SDK
      firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount as any),
        // Explicitly set the projectId to ensure consistency
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      logger.info('Firebase Admin initialized successfully');
    } else {
      logger.info('Firebase Admin already initialized, deleting and re-initializing to ensure consistency');
      logger.info(`Found ${firebase.apps.length} existing apps`);
      // Delete existing apps to ensure fresh initialization
      firebase.apps.filter(app => app !== null).forEach(app => {
        logger.info(`Deleting existing Firebase app: ${app.name}`);
        app.delete();
      });
      logger.info('All existing apps deleted, initializing fresh...');

      // Initialize the Firebase Admin SDK with fresh configuration
      firebase.initializeApp({
        credential: firebase.credential.cert(serviceAccount as any),
        // Explicitly set the projectId to ensure consistency
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
      logger.info('Firebase Admin re-initialized successfully');
    }


    firestore = firebase.firestore ? firebase.firestore() : null;
    auth = firebase.auth ? firebase.auth() : null;
    storage = firebase.storage ? firebase.storage() : null;

    logger.info(`Firestore initialization result: ${!!firestore}`);
    logger.info(`Auth initialization result: ${!!auth}`);
    logger.info(`Storage initialization result: ${!!storage}`);

    if (auth) {
      logger.info('Firebase Auth is available');
    } else {
      logger.warn('Firebase Auth is not available');
    }
  } else {
    logger.error('Firebase Admin SDK not loaded properly or initializeApp is not a function');
    logger.error(`admin object: ${typeof firebase}`);
    logger.error(`initializeApp: ${typeof (firebase && firebase.initializeApp)}`);
  }
} catch (error) {
  logger.error(`Error initializing Firebase Admin: ${error}`);
  logger.error(`Detailed error: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error) {
    logger.error(`Stack trace: ${error.stack}`);
  } else {
    logger.error('Stack trace: No stack trace available');
  }

  // Keep the exports as null if initialization fails
  firebaseAdmin = null;
  firestore = null;
  auth = null;
  storage = null;
}

logger.info('Firebase exports status');
logger.info(`firebaseAdmin: ${!!firebaseAdmin}`);
logger.info(`firestore: ${!!firestore}`);
logger.info(`auth: ${!!auth}`);
logger.info(`storage: ${!!storage}`);

// Additional validation logs
logger.info(`Firebase apps after init: ${firebase.apps ? firebase.apps.length : 'undefined'}`);
if (firebase.apps && firebase.apps.length > 0) {
  firebase.apps.forEach((app, index) => {
    if (app) {
      logger.info(`App ${index}: ${app.name} - project: ${app.options.projectId}`);
    } else {
      logger.warn(`App ${index} is null`);
    }
  });
}

// For development, if Firebase fails to initialize, warn the user
if (!auth) {
  logger.warn('Firebase Auth not available - Google OAuth will not work');
  logger.warn('This means Google OAuth authentication will not function properly');
  logger.warn('Possible causes: invalid credentials, network issues, or Firebase Admin SDK not properly installed');
}

export { firebaseAdmin, firestore, auth, storage };