
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

// Re-export helpers como "fb" para usar igual que ya lo tienes
export const fb = {
  // auth
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,

  // firestore
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, limit, serverTimestamp, Timestamp, onSnapshot, runTransaction,

  // storage
  ref, uploadBytes, getDownloadURL
};

export async function ensureAnon(){
  // Cliente (index.html): SIEMPRE anónimo, aunque antes hayas iniciado sesión como admin en este mismo navegador.
  // Admin (admin.html): respeta el login con correo/clave.
  const isAdminPage = location.pathname.endsWith("/admin.html") || location.pathname.endsWith("admin.html");
  const u = auth.currentUser;

  if(u){
    if(u.isAnonymous) return u;

    // Si NO es admin.html, forzamos anónimo para que “Mis pedidos” funcione
    if(!isAdminPage){
      try{ await signOut(auth); }catch(_){}
      const cred = await signInAnonymously(auth);
      return cred.user;
    }

    // En admin.html dejamos el usuario con correo/clave
    return u;
  }

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