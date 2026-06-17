import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const config = (firebaseConfig as any).default || firebaseConfig || {};

console.log('Firebase Initializing App with config:', { 
  projectId: config?.projectId, 
  appId: config?.appId, 
  firestoreDatabaseId: config?.firestoreDatabaseId 
});

const app = getApps().length === 0 ? initializeApp(config) : getApp();
const targetDbId = config?.firestoreDatabaseId || undefined;

function initFirestore() {
  try {
    // 1. Try to get the existing instance first to prevent re-initialization errors
    if (targetDbId) {
      try {
        console.log('Attempting to retrieve existing custom Firestore instance:', targetDbId);
        const existingDb = getFirestore(app, targetDbId);
        if (existingDb) {
          console.log('Successfully retrieved existing custom Firestore:', targetDbId);
          return existingDb;
        }
      } catch (getErr) {
        console.log('No existing custom database instance found, will attempt to initialize:', getErr);
      }
    } else {
      try {
        console.log('Attempting to retrieve existing default Firestore instance');
        const existingDb = getFirestore(app);
        if (existingDb) {
          console.log('Successfully retrieved existing default Firestore');
          return existingDb;
        }
      } catch (getErr) {
        console.log('No existing default database instance found, will attempt to initialize:', getErr);
      }
    }

    // 2. If not already retrieved, initialize with settings (long polling)
    if (targetDbId) {
      console.log('Initializing Firestore with custom databaseId and long polling:', targetDbId);
      try {
        return initializeFirestore(app, {
          experimentalForceLongPolling: true,
        }, targetDbId);
      } catch (initErr: any) {
        console.error('initializeFirestore custom databaseId failed, trying fallback getFirestore:', initErr?.message);
        try {
          return getFirestore(app, targetDbId);
        } catch (fallbackErr: any) {
          console.error('getFirestore with custom databaseId failed, falling back to default database:', fallbackErr?.message);
          return getFirestore(app);
        }
      }
    } else {
      console.log('Initializing Firestore with default database and long polling');
      try {
        return initializeFirestore(app, {
          experimentalForceLongPolling: true,
        });
      } catch (initErr: any) {
        console.error('initializeFirestore default database failed, trying fallback getFirestore:', initErr?.message);
        return getFirestore(app);
      }
    }
  } catch (err: any) {
    console.error('Robust Firestore initialization encountered a top-level catch:', err?.message || err);
    try {
      return targetDbId ? getFirestore(app, targetDbId) : getFirestore(app);
    } catch (finalErr: any) {
      console.error('All Firestore fallback initialization methods failed catastrophically. Returning fallback dummy getFirestore as last resort:', finalErr?.message || finalErr);
      try {
        return getFirestore();
      } catch {
        throw finalErr;
      }
    }
  }
}

const g = globalThis as any;
let dbInstance;

if (g.__firestore_db__) {
  console.log('Reusing existing globally cached Firestore instance:', g.__firestore_db__);
  dbInstance = g.__firestore_db__;
} else {
  dbInstance = initFirestore();
  g.__firestore_db__ = dbInstance;
}

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
