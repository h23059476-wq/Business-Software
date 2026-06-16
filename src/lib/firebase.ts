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
    if (targetDbId) {
      console.log('Initializing Firestore with custom databaseId:', targetDbId);
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
      }, targetDbId);
    } else {
      console.log('Initializing default Firestore with long polling');
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
      });
    }
  } catch (err: any) {
    console.log('initializeFirestore already run or threw. Attempting fallback getFirestore:', err?.message || err);
    try {
      return targetDbId ? getFirestore(app, targetDbId) : getFirestore(app);
    } catch (fallbackErr: any) {
      console.error('getFirestore failed:', fallbackErr?.message || fallbackErr);
      return getFirestore(app);
    }
  }
}

export const db = initFirestore();
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
