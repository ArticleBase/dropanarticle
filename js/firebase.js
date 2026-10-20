/* ============================================================
   DropAnArticle — Firebase Module (Optimized & Hardened)
   Project: dropanarticle (Firebase JS SDK v10, CDN ESM)
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCAqrvrttq8a7ETqesVSPAxrtrsm6rQPwM",
  authDomain: "dropanarticle.firebaseapp.com",
  projectId: "dropanarticle",
  storageBucket: "dropanarticle.firebasestorage.app",
  messagingSenderId: "990635746535",
  appId: "1:990635746535:web:9e74fe51c567ce15412e42",
  measurementId: "G-WZ98FQ1KBK"
};

let _app = null;
let _db = null;
let _mods = null;
let _analytics = null;

/** Initialize Firebase (idempotent). Analytics loads only in the browser. */
async function initFirebase() {
  if (_db) return { app: _app, db: _db, ..._mods };
  
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    const {
      getFirestore, collection, getDocs, doc, getDoc, addDoc,
      updateDoc, deleteDoc, query, orderBy, serverTimestamp
    } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");

    _app = initializeApp(FIREBASE_CONFIG);
    _db = getFirestore(_app);
    _mods = { collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp };

    // Analytics (optional — safe-guarded for ad blockers / non-browser)
    try {
      if (typeof window !== "undefined") {
        const { getAnalytics } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js");
        _analytics = getAnalytics(_app);
      }
    } catch (e) { 
      console.warn("[DropAnArticle] Analytics blocked or unavailable:", e.message); 
    }

    return { app: _app, db: _db, analytics: _analytics, ..._mods };
  } catch (err) {
    console.error("[DropAnArticle] Critical: Failed to initialize Firebase modules:", err);
    throw err;
  }
}

const ARTICLES_COLLECTION = "articles";
const CONTACT_COLLECTION = "messages";

/** Fetch all published articles from Firestore. Falls back to local JSON safely. */
async function fetchArticles() {
  try {
    const { db, collection, getDocs, query, orderBy } = await initFirebase();
    const q = query(collection(db, ARTICLES_COLLECTION), orderBy("date", "desc"));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    throw new Error("Firestore empty — using fallback");
  } catch (err) {
    console.warn("[DropAnArticle] Firestore unavailable, loading local articles.json:", err.message);
    
    // Use an absolute path or relative path based on location to prevent 404 loops on GitHub Pages
    const jsonPath = window.location.pathname.includes("/dropanarticle/") 
      ? "/dropanarticle/articles/articles.json" 
      : "articles/articles.json";

    try {
      const res = await fetch(jsonPath);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (fetchErr) {
      console.error("[DropAnArticle] Failed to load fallback articles.json:", fetchErr);
      return []; // Return empty array instead of crashing the app into a reload loop
    }
  }
}

/** Fetch a single article by slug. */
async function fetchArticleBySlug(slug) {
  try {
    const { db, collection, getDocs } = await initFirebase();
    const snap = await getDocs(collection(db, ARTICLES_COLLECTION));
    const matchingDoc = snap.docs.find(d => d.data().slug === slug);
    if (matchingDoc) return { id: matchingDoc.id, ...matchingDoc.data() };
    throw new Error("Not found in Firestore");
  } catch (err) {
    const jsonPath = window.location.pathname.includes("/dropanarticle/") 
      ? "/dropanarticle/articles/articles.json" 
      : "articles/articles.json";

    const res = await fetch(jsonPath);
    if (!res.ok) throw new Error("Could not load articles.json");
    const all = await res.json();
    const found = all.find(a => a.slug === slug);
    if (!found) throw new Error("Article not found: " + slug);
    return found;
  }
}

/** Publish / draft-save an article from the admin panel. */
async function saveArticle(article) {
  const { db, collection, addDoc, serverTimestamp } = await initFirebase();
  return await addDoc(collection(db, ARTICLES_COLLECTION), {
    ...article,
    createdAt: serverTimestamp()
  });
}

/** Update an existing article. */
async function updateArticle(id, patch) {
  const { db, doc, updateDoc, serverTimestamp } = await initFirebase();
  return await updateDoc(doc(db, ARTICLES_COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
}

/** Delete an article. */
async function removeArticle(id) {
  const { db, doc, deleteDoc } = await initFirebase();
  return await deleteDoc(doc(db, ARTICLES_COLLECTION, id));
}

/** Store a contact-form message in Firestore. */
async function saveContactMessage(payload) {
  const { db, collection, addDoc, serverTimestamp } = await initFirebase();
  return await addDoc(collection(db, CONTACT_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    read: false
  });
}

window.DropAnArticleFirebase = {
  FIREBASE_CONFIG,
  initFirebase,
  fetchArticles,
  fetchArticleBySlug,
  saveArticle,
  updateArticle,
  removeArticle,
  saveContactMessage,
  ARTICLES_COLLECTION,
  CONTACT_COLLECTION
};
