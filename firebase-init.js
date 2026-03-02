import { firebaseConfig, ADMIN_UID } from "./firebase-config.js";

// Firebase SDK (sin npm, directo desde CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { 
  getAuth, onAuthStateChanged,
  signInAnonymously, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { 
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, limit, serverTimestamp, Timestamp, onSnapshot, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const fb = {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, limit, serverTimestamp, Timestamp, onSnapshot, runTransaction,
  ref, uploadBytes, getDownloadURL,
  onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut
};

export async function ensureAnon(){
  // Identidad invisible (no le pides nada al cliente)
  if(auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export function isAdminUser(user){
  if(!user) return false;
  if(!ADMIN_UID) return true; // Si no pones UID aquí, mostramos admin a cualquier login, pero Rules bloquean escritura.
  return user.uid === ADMIN_UID;
}

export function watchAuth(cb){
  return onAuthStateChanged(auth, cb);
}
