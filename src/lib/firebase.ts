import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, getFirestore, collection } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const config = (firebaseConfig as any).default || firebaseConfig || {};

console.log('Firebase Initializing App with config:', { 
  projectId: config?.projectId, 
  appId: config?.appId, 
  firestoreDatabaseId: config?.firestoreDatabaseId 
});

const app = getApps().length === 0 ? initializeApp(config) : getApp();
const targetDbId = config?.firestoreDatabaseId || undefined;

function initFirestoreSafe() {
  const settings = {
    experimentalForceLongPolling: true,
    useFetchStreams: false
  };

  const configsToTry = [
    { name: 'Custom DB via initializeFirestore (Long Polling)', fn: () => targetDbId ? initializeFirestore(app, settings, targetDbId) : initializeFirestore(app, settings) },
    { name: 'Custom DB via initializeFirestore (Standard)', fn: () => targetDbId ? initializeFirestore(app, {}, targetDbId) : initializeFirestore(app, {}) },
    { name: 'Custom DB via getFirestore', fn: () => targetDbId ? getFirestore(app, targetDbId) : getFirestore(app) },
    { name: 'Default DB via initializeFirestore (Long Polling)', fn: () => initializeFirestore(app, settings) },
    { name: 'Default DB via initializeFirestore', fn: () => initializeFirestore(app, {}) },
    { name: 'Default DB via getFirestore', fn: () => getFirestore(app) },
    { name: 'Direct getFirestore() fallback', fn: () => getFirestore() },
  ];

  for (const cfg of configsToTry) {
    try {
      console.log(`Trying Firestore initialization: ${cfg.name}...`);
      const instance = cfg.fn();
      
      // Verification check: Test the instance with collection() synchronously to ensure it passes the internal brand checks of firebase/firestore.
      if (instance) {
        collection(instance, '_verification_test_collection');
        console.log(`Successfully verified and instantiated Firestore instance for: ${cfg.name}`);
        return instance;
      }
    } catch (err: any) {
      console.warn(`Firestore initialization ${cfg.name} failed verification with error:`, err?.message || err);
    }
  }

  // Last resort catastrophic fallback
  console.error("All custom and standard Firestore initialization configurations failed verification. Returning fallback getFirestore().");
  return getFirestore();
}

const dbInstance = initFirestoreSafe();

export const db = dbInstance;
console.log('firebase.ts export: db =', db, 'isFirestore =', !!db && typeof db === 'object');
export const auth = getAuth(app);

// Cohesive re-exports to prevent module/duplicate package instance mismatch bugs
export { 
  collection, query, where, getDocs, addDoc, setDoc, doc, onSnapshot, 
  updateDoc, deleteDoc, getDoc, orderBy, limit 
} from 'firebase/firestore';

console.log('Synchronously exported Firestore and Auth initialized successfully.');

export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed Callback: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
