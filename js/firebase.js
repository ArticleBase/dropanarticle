/*
 * TravelStory Hub — Firebase data and authentication layer.
 * The Firebase web config is visible to browser clients by design; Firestore and Storage Rules enforce access.
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCAqrvrttq8a7ETqesVSPAxrtrsm6rQPwM",
  authDomain: "dropanarticle.firebaseapp.com",
  databaseURL: "https://dropanarticle-default-rtdb.firebaseio.com",
  projectId: "dropanarticle",
  storageBucket: "dropanarticle.firebasestorage.app",
  messagingSenderId: "990635746535",
  appId: "1:990635746535:web:9e74fe51c567ce15412e42",
  measurementId: "G-WZ98FQ1KBK"
};

const ARTICLES_COLLECTION = "articles";
const CONTACT_COLLECTION = "messages";
const SUBMISSIONS_COLLECTION = "submissions";
const USERS_COLLECTION = "users";
const CATEGORIES_COLLECTION = "categories";
const EDITOR_ROLES = new Set(["admin", "editor"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const DEFAULT_CATEGORIES = [
  { name: "Destination Guides", description: "Practical advice for exploring destinations." },
  { name: "Travel Tips", description: "Planning, packing, transport, and smart travel advice." },
  { name: "Itineraries", description: "Thoughtful trip plans for different travel styles." },
  { name: "Culture & Food", description: "Local culture, cuisine, and meaningful experiences." },
  { name: "Adventure Travel", description: "Outdoor trips, trekking, and active holidays." },
  { name: "Luxury Travel", description: "Premium stays and considered travel experiences." },
  { name: "Budget Travel", description: "Good-value planning and affordable journeys." },
  { name: "Family Holidays", description: "Practical travel inspiration for families." },
  { name: "Travel Business", description: "Insights for tourism and hospitality professionals." },
  { name: "Responsible Tourism", description: "Thoughtful and lower-impact ways to travel." },
  { name: "Wildlife & Nature", description: "Wildlife, parks, landscapes, and nature travel." }
];

let _app = null;
let _db = null;
let _auth = null;
let _storage = null;
let _authMods = null;
let _dbMods = null;
let _storageMods = null;
let _analytics = null;
let _initPromise = null;

async function initFirebase() {
  if (_app && _db && _auth && _storage) {
    return { app: _app, db: _db, auth: _auth, storage: _storage, authMods: _authMods, ..._dbMods, ..._storageMods, analytics: _analytics };
  }
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    const dbMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    const storageMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js");

    _app = appMod.initializeApp(FIREBASE_CONFIG);
    _db = dbMod.getFirestore(_app);
    _auth = authMod.getAuth(_app);
    _storage = storageMod.getStorage(_app);
    _authMods = authMod;
    _dbMods = {
      collection: dbMod.collection, getDocs: dbMod.getDocs, doc: dbMod.doc,
      getDoc: dbMod.getDoc, addDoc: dbMod.addDoc, setDoc: dbMod.setDoc,
      updateDoc: dbMod.updateDoc, deleteDoc: dbMod.deleteDoc,
      query: dbMod.query, orderBy: dbMod.orderBy, where: dbMod.where,
      serverTimestamp: dbMod.serverTimestamp, writeBatch: dbMod.writeBatch,
      limit: dbMod.limit, startAfter: dbMod.startAfter,
      getCountFromServer: dbMod.getCountFromServer
    };
    _storageMods = {
      ref: storageMod.ref, getDownloadURL: storageMod.getDownloadURL,
      uploadBytesResumable: storageMod.uploadBytesResumable,
      deleteObject: storageMod.deleteObject
    };

    // Analytics is opt-in. Set analyticsConsent: true only after your consent experience is ready.
    if (window.TRAVELSTORY_CONFIG?.analyticsConsent === true) {
      try {
        const analyticsMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js");
        if (analyticsMod.isSupported && await analyticsMod.isSupported()) _analytics = analyticsMod.getAnalytics(_app);
      } catch (error) {
        console.info("[TravelStory Hub] Analytics unavailable; core features continue.", error?.message || "");
      }
    }

    return { app: _app, db: _db, auth: _auth, storage: _storage, authMods: _authMods, ..._dbMods, ..._storageMods, analytics: _analytics };
  })();

  try { return await _initPromise; }
  catch (error) { _initPromise = null; console.error("[TravelStory Hub] Firebase initialization failed.", error); throw error; }
}

function slugifyValue(value) {
  return String(value || "").normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 140);
}
function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(source.map(tag => String(tag).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 15);
}
function makeSearchTerms(article) {
  const source = [article.title, article.excerpt, article.category, ...(article.tags || [])].join(" ").toLowerCase();
  return [...new Set(source.normalize("NFKD").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(word => word.length > 1))].slice(0, 80);
}
function searchTokens(value) {
  return [...new Set(String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(word => word.length > 1))].slice(0, 10);
}
function demoFallbackEnabled() { return window.TRAVELSTORY_CONFIG?.useDemoFallback === true; }

async function getEditorProfile(uid) {
  const { db, doc, getDoc } = await initFirebase();
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
async function requireEditor() {
  const { auth } = await initFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in with an approved editorial account.");
  const profile = await getEditorProfile(user.uid);
  if (!profile || !EDITOR_ROLES.has(profile.role)) {
    throw new Error("This account has no editor permissions. Ask an administrator to assign the editor or admin role in Firestore users/{uid}.");
  }
  return { user, profile };
}

async function loadSampleArticles() {
  if (!demoFallbackEnabled()) return [];
  try {
    const response = await fetch(new URL("articles/articles.json", document.baseURI), { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const values = await response.json();
    return Array.isArray(values) ? values.filter(article => article.status === "published") : [];
  } catch (error) {
    console.warn("[TravelStory Hub] Demo sample articles could not be loaded.", error?.message || "");
    return [];
  }
}

async function fetchArticles({ pageSize = 10 } = {}) {
  const { db, collection, getDocs, query, where, orderBy, limit } = await initFirebase();
  try {
    const request = query(collection(db, ARTICLES_COLLECTION), where("status", "==", "published"), orderBy("date", "desc"), limit(pageSize));
    const snapshot = await getDocs(request);
    const articles = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    return articles.length ? articles : await loadSampleArticles();
  } catch (error) {
    if (demoFallbackEnabled()) return loadSampleArticles();
    console.error("[TravelStory Hub] Published-article query failed.", error);
    throw error;
  }
}

async function fetchPublishedArticlePage({ pageSize = 9, cursor = null, category = "", searchTerm = "" } = {}) {
  const { db, collection, getDocs, query, where, orderBy, limit, startAfter } = await initFirebase();
  const constraints = [where("status", "==", "published")];
  if (category) constraints.push(where("category", "==", category));
  const words = searchTokens(searchTerm);
  if (words.length) constraints.push(where("searchTerms", "array-contains-any", words));
  constraints.push(orderBy("date", "desc"));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize + 1));
  try {
    const snapshot = await getDocs(query(collection(db, ARTICLES_COLLECTION), ...constraints));
    let docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    docs = docs.slice(0, pageSize);
    if (!docs.length && !cursor && !category && !searchTerm) {
      const sample = await loadSampleArticles();
      if (sample.length) return { items: sample.slice(0, pageSize), nextCursor: null, hasMore: false, demo: true };
    }
    return {
      items: docs.map(item => ({ id: item.id, ...item.data() })),
      nextCursor: hasMore ? docs[docs.length - 1] : null,
      hasMore,
      demo: false
    };
  } catch (error) {
    console.error("[TravelStory Hub] Article page query failed.", error);
    if (demoFallbackEnabled()) {
      const samples = (await loadSampleArticles()).filter(a => (!category || a.category === category));
      const term = String(searchTerm || "").toLowerCase().trim();
      const filtered = term ? samples.filter(a => [a.title, a.excerpt, a.category].join(" ").toLowerCase().includes(term)) : samples;
      return { items: filtered.slice(0, pageSize), nextCursor: null, hasMore: false, demo: true };
    }
    throw error;
  }
}

async function fetchArticleBySlug(slug) {
  const normalized = String(slug || "").trim();
  if (!normalized) throw new Error("An article slug is required.");
  const { db, collection, getDocs, query, where, limit } = await initFirebase();
  try {
    const request = query(collection(db, ARTICLES_COLLECTION), where("slug", "==", normalized), where("status", "==", "published"), limit(1));
    const snapshot = await getDocs(request);
    if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  } catch (error) {
    console.info("[TravelStory Hub] Published article lookup failed.", error?.message || "");
    if (!demoFallbackEnabled()) throw error;
  }
  if (demoFallbackEnabled()) {
    const sample = (await loadSampleArticles()).find(article => article.slug === normalized);
    if (sample) return sample;
  }
  throw new Error("Article not found.");
}

async function fetchAdminArticlePage({ pageSize = 10, cursor = null, status = "", searchTerm = "" } = {}) {
  await requireEditor();
  const { db, collection, getDocs, query, where, orderBy, limit, startAfter } = await initFirebase();
  const constraints = [];
  if (status && ["draft", "published", "archived"].includes(status)) constraints.push(where("status", "==", status));
  const words = searchTokens(searchTerm);
  if (words.length) constraints.push(where("searchTerms", "array-contains-any", words));
  constraints.push(orderBy("updatedAt", "desc"));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize + 1));
  const snapshot = await getDocs(query(collection(db, ARTICLES_COLLECTION), ...constraints));
  const hasMore = snapshot.docs.length > pageSize;
  const docs = snapshot.docs.slice(0, pageSize);
  return { items: docs.map(item => ({ id: item.id, ...item.data() })), nextCursor: hasMore ? docs[docs.length - 1] : null, hasMore };
}

async function fetchAdminArticleById(id) {
  await requireEditor();
  const { db, doc, getDoc } = await initFirebase();
  const snapshot = await getDoc(doc(db, ARTICLES_COLLECTION, id));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function fetchSubmissions() {
  await requireEditor();
  const { db, collection, getDocs, query, orderBy, limit } = await initFirebase();
  const snapshot = await getDocs(query(collection(db, SUBMISSIONS_COLLECTION), orderBy("createdAt", "desc"), limit(100)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function getAdminStats() {
  await requireEditor();
  const { db, collection, query, where, getCountFromServer } = await initFirebase();
  const articles = collection(db, ARTICLES_COLLECTION);
  const submissions = collection(db, SUBMISSIONS_COLLECTION);
  const [allArticles, published, drafts, pending, allCategories] = await Promise.all([
    getCountFromServer(articles),
    getCountFromServer(query(articles, where("status", "==", "published"))),
    getCountFromServer(query(articles, where("status", "==", "draft"))),
    getCountFromServer(query(submissions, where("status", "==", "pending"))),
    getCountFromServer(collection(db, CATEGORIES_COLLECTION))
  ]);
  return { articles: allArticles.data().count, published: published.data().count, drafts: drafts.data().count, pending: pending.data().count, categories: allCategories.data().count };
}

async function fetchCategories() {
  const { db, collection, getDocs } = await initFirebase();
  const snapshot = await getDocs(collection(db, CATEGORIES_COLLECTION));
  const categories = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.active !== false && item.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return categories.length ? categories : DEFAULT_CATEGORIES.map(item => ({ ...item, id: slugifyValue(item.name), isDefault: true }));
}

async function seedDefaultCategories() {
  await requireEditor();
  const { db, collection, getDocs, doc, setDoc, serverTimestamp } = await initFirebase();
  const snapshot = await getDocs(collection(db, CATEGORIES_COLLECTION));
  if (!snapshot.empty) return fetchCategories();
  for (const category of DEFAULT_CATEGORIES) {
    const slug = slugifyValue(category.name);
    await setDoc(doc(db, CATEGORIES_COLLECTION, slug), { ...category, slug, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  return fetchCategories();
}

async function saveCategory({ name, description = "" }) {
  await requireEditor();
  const cleanName = String(name || "").trim().slice(0, 80);
  const cleanDescription = String(description || "").trim().slice(0, 250);
  const slug = slugifyValue(cleanName);
  if (cleanName.length < 2 || !slug) throw new Error("Enter a category name with at least two characters.");
  const { db, doc, getDoc, setDoc, serverTimestamp } = await initFirebase();
  const reference = doc(db, CATEGORIES_COLLECTION, slug);
  if ((await getDoc(reference)).exists()) throw new Error("A category with this name already exists.");
  await setDoc(reference, { name: cleanName, description: cleanDescription, slug, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { id: slug, name: cleanName, description: cleanDescription, slug, active: true };
}

async function removeCategory(id) {
  await requireEditor();
  const { db, doc, deleteDoc, getDoc } = await initFirebase();
  const reference = doc(db, CATEGORIES_COLLECTION, id);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return;
  return deleteDoc(reference);
}

async function submitTravelArticle(article) {
  const title = String(article.title || "").trim();
  const excerpt = String(article.excerpt || "").trim();
  const content = String(article.content || "").trim();
  const email = String(article.email || "").trim();
  const author = String(article.author || "").trim();
  if (title.length < 8 || title.length > 140) throw new Error("The title must contain 8–140 characters.");
  if (excerpt.length < 30 || excerpt.length > 500) throw new Error("The summary must contain 30–500 characters.");
  if (content.length > 50000) throw new Error("The article content is too long. Please keep it under 50,000 characters.");
  if (content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length < 300) throw new Error("Please add at least 300 characters of article text.");
  if (!author || author.length > 100) throw new Error("Add an author or travel business name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid contact email.");

  const { db, collection, addDoc, serverTimestamp } = await initFirebase();
  const payload = {
    title, slug: slugifyValue(article.slug || title), excerpt, content,
    author, email,
    website: String(article.website || "").trim().slice(0, 300),
    category: String(article.category || "Destination Guides").trim().slice(0, 80),
    tags: normalizeTags(article.tags),
    image: String(article.image || "").trim().slice(0, 700),
    imageAlt: String(article.imageAlt || "").trim().slice(0, 180),
    metaTitle: String(article.metaTitle || title).trim().slice(0, 70),
    metaDescription: String(article.metaDescription || excerpt).trim().slice(0, 170),
    date: new Date().toISOString().slice(0, 10), source: "public-submission",
    status: "pending", reviewed: false, createdAt: serverTimestamp()
  };
  return addDoc(collection(db, SUBMISSIONS_COLLECTION), payload);
}

async function ensureUniqueSlug(slug, articleId = null) {
  const { db, collection, getDocs, query, where } = await initFirebase();
  const articles = collection(db, ARTICLES_COLLECTION);
  const [currentSlugs, previousSlugs] = await Promise.all([
    getDocs(query(articles, where("slug", "==", slug))),
    getDocs(query(articles, where("previousSlugs", "array-contains", slug)))
  ]);
  const duplicate = [...currentSlugs.docs, ...previousSlugs.docs].find(item => item.id !== articleId);
  if (duplicate) throw new Error("That URL slug is already in use or reserved as an older article URL. Choose another slug.");
}

async function saveArticle(article, articleId = null) {
  await requireEditor();
  const title = String(article.title || "").trim();
  const slug = slugifyValue(article.slug || title);
  const excerpt = String(article.excerpt || "").trim();
  const content = String(article.content || "");
  if (title.length < 8 || title.length > 140) throw new Error("Article titles must contain 8–140 characters.");
  if (!slug || slug.length < 3) throw new Error("Enter a valid URL slug.");
  if (excerpt.length < 30 || excerpt.length > 500) throw new Error("Article summaries must contain 30–500 characters.");
  if (content.length > 100000) throw new Error("The article is too long for a single Firestore document.");
  if (content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length < 300) throw new Error("Add at least 300 characters of article text.");
  await ensureUniqueSlug(slug, articleId);

  const { db, collection, doc, addDoc, updateDoc, getDoc, serverTimestamp } = await initFirebase();
  const now = serverTimestamp();
  const tags = normalizeTags(article.tags);
  const payload = {
    title, slug, excerpt, content,
    author: String(article.author || "TravelStory Editorial Team").trim().slice(0, 100),
    authorWebsite: String(article.authorWebsite || "").trim().slice(0, 300),
    category: String(article.category || "Destination Guides").trim().slice(0, 80),
    tags,
    date: String(article.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    readTime: String(article.readTime || `${Math.max(1, Math.ceil(content.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length / 220))} min read`).slice(0, 30),
    image: String(article.image || "").trim().slice(0, 700),
    imageAlt: String(article.imageAlt || "").trim().slice(0, 180),
    metaTitle: String(article.metaTitle || title).trim().slice(0, 70),
    metaDescription: String(article.metaDescription || excerpt).trim().slice(0, 170),
    status: ["draft", "published", "archived"].includes(article.status) ? article.status : "draft",
    featured: article.featured === true,
    searchTerms: makeSearchTerms({ title, excerpt, category: article.category, tags }),
    titleLower: title.toLowerCase(),
    updatedAt: now
  };
  if (!articleId) {
    payload.createdAt = now;
    if (payload.status === "published") payload.publishedAt = now;
    return addDoc(collection(db, ARTICLES_COLLECTION), payload);
  }
  const reference = doc(db, ARTICLES_COLLECTION, articleId);
  const existing = await getDoc(reference);
  if (!existing.exists()) throw new Error("That article no longer exists. Refresh the list and try again.");
  const existingData = existing.data();
  const previousSlugs = Array.isArray(existingData.previousSlugs) ? existingData.previousSlugs : [];
  if (existingData.slug && existingData.slug !== slug) {
    payload.previousSlugs = [...new Set([...previousSlugs, existingData.slug])].slice(-20);
  } else if (previousSlugs.length) {
    payload.previousSlugs = previousSlugs;
  }
  if (payload.status === "published" && !existingData.publishedAt) payload.publishedAt = now;
  await updateDoc(reference, payload);
  return reference;
}

async function updateArticle(id, patch) {
  await requireEditor();
  const { db, doc, getDoc, updateDoc, serverTimestamp } = await initFirebase();
  const reference = doc(db, ARTICLES_COLLECTION, id);
  const current = await getDoc(reference);
  if (!current.exists()) throw new Error("That article no longer exists.");
  const currentData = current.data();
  const safePatch = { ...patch, updatedAt: serverTimestamp() };
  if (safePatch.status === "published" && !currentData.publishedAt) safePatch.publishedAt = serverTimestamp();
  if (safePatch.slug) {
    safePatch.slug = slugifyValue(safePatch.slug);
    if (currentData.slug && currentData.slug !== safePatch.slug) {
      safePatch.previousSlugs = [...new Set([...(Array.isArray(currentData.previousSlugs) ? currentData.previousSlugs : []), currentData.slug])].slice(-20);
    }
  }
  if (safePatch.title || safePatch.excerpt || safePatch.category || safePatch.tags) {
    safePatch.searchTerms = makeSearchTerms({ ...currentData, ...patch, tags: normalizeTags(safePatch.tags ?? currentData.tags) });
  }
  return updateDoc(reference, safePatch);
}

async function removeArticle(id) {
  await requireEditor();
  const { db, doc, deleteDoc } = await initFirebase();
  return deleteDoc(doc(db, ARTICLES_COLLECTION, id));
}

async function updateSubmissionStatus(id, status, editorialNotes = "") {
  await requireEditor();
  if (!["pending", "changes_requested", "rejected"].includes(status)) throw new Error("Unsupported editorial status.");
  const { db, doc, updateDoc, serverTimestamp } = await initFirebase();
  return updateDoc(doc(db, SUBMISSIONS_COLLECTION, id), {
    status, reviewed: true, editorialNotes: String(editorialNotes || "").slice(0, 3000), updatedAt: serverTimestamp()
  });
}

async function publishSubmission(id) {
  await requireEditor();
  const { db, doc, getDoc, collection, query, getDocs, where, writeBatch, serverTimestamp } = await initFirebase();
  const submissionRef = doc(db, SUBMISSIONS_COLLECTION, id);
  const snapshot = await getDoc(submissionRef);
  if (!snapshot.exists()) throw new Error("This submission no longer exists.");
  const submission = snapshot.data();
  if (submission.status === "published" && submission.articleId) return { id: submission.articleId };
  let slug = slugifyValue(submission.slug || submission.title || "travel-story");
  const duplicateSnap = await getDocs(query(collection(db, ARTICLES_COLLECTION), where("slug", "==", slug)));
  if (duplicateSnap.size) slug = `${slug}-${id.slice(0, 6)}`.slice(0, 140);
  const articleRef = doc(collection(db, ARTICLES_COLLECTION));
  const now = serverTimestamp();
  const content = String(submission.content || "");
  const category = String(submission.category || "Destination Guides");
  const excerpt = String(submission.excerpt || "");
  const title = String(submission.title || "");
  const tags = normalizeTags(submission.tags);
  const article = {
    title: title.trim(), slug, excerpt: excerpt.trim(), content,
    author: String(submission.author || "TravelStory Contributor").slice(0, 100),
    authorWebsite: String(submission.website || "").slice(0, 300),
    category: category.slice(0, 80), tags,
    image: String(submission.image || "").slice(0, 700), imageAlt: String(submission.imageAlt || title).slice(0, 180),
    metaTitle: String(submission.metaTitle || title).slice(0, 70),
    metaDescription: String(submission.metaDescription || excerpt).slice(0, 170),
    date: new Date().toISOString().slice(0, 10), status: "published", featured: false,
    readTime: `${Math.max(1, Math.ceil(content.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length / 220))} min read`,
    searchTerms: makeSearchTerms({ title, excerpt, category, tags }), titleLower: title.toLowerCase(),
    createdAt: now, updatedAt: now, publishedAt: now, sourceSubmissionId: id
  };
  const batch = writeBatch(db);
  batch.set(articleRef, article);
  batch.update(submissionRef, { status: "published", reviewed: true, articleId: articleRef.id, updatedAt: now });
  await batch.commit();
  return { id: articleRef.id, slug };
}

async function saveContactMessage(payload) {
  const name = String(payload.name || "").trim().slice(0, 120);
  const email = String(payload.email || "").trim().slice(0, 180);
  const subject = String(payload.subject || "").trim().slice(0, 180);
  const message = String(payload.message || "").trim().slice(0, 4000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) throw new Error("Enter your name, a valid email address, and a message.");
  const { db, collection, addDoc, serverTimestamp } = await initFirebase();
  return addDoc(collection(db, CONTACT_COLLECTION), { name, email, subject, message, createdAt: serverTimestamp(), read: false });
}

async function uploadArticleImage(file, onProgress = () => {}) {
  if (!(file instanceof Blob)) throw new Error("No image file was provided.");
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Upload JPG, PNG, WEBP, or GIF images only.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Images must be 8 MB or smaller.");
  const { user } = await requireEditor();
  const { storage, ref, getDownloadURL, uploadBytesResumable } = await initFirebase();
  const cleanName = String(file.name || "travel-image").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90) || "travel-image";
  const storageRef = ref(storage, `article-media/${user.uid}/${Date.now()}-${cleanName}`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type, customMetadata: { uploadedBy: user.uid } });
    task.on("state_changed", snapshot => {
      const percent = snapshot.totalBytes ? Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) : 0;
      onProgress(percent);
    }, reject, async () => {
      try { resolve(await getDownloadURL(task.snapshot.ref)); }
      catch (error) { reject(error); }
    });
  });
}

async function signInEditor(email, password) {
  const { auth, authMods } = await initFirebase();
  return authMods.signInWithEmailAndPassword(auth, email, password);
}
async function signOutEditor() {
  const { auth, authMods } = await initFirebase();
  return authMods.signOut(auth);
}
async function watchEditorAuth(callback) {
  const { auth, authMods } = await initFirebase();
  return authMods.onAuthStateChanged(auth, callback);
}

window.DropAnArticleFirebase = {
  FIREBASE_CONFIG, DEFAULT_CATEGORIES, initFirebase, getEditorProfile, fetchArticles,
  fetchPublishedArticlePage, fetchAdminArticlePage, fetchAdminArticleById, fetchSubmissions,
  getAdminStats, fetchCategories, seedDefaultCategories, saveCategory, removeCategory,
  submitTravelArticle, saveArticle, updateArticle, removeArticle, updateSubmissionStatus,
  publishSubmission, saveContactMessage, uploadArticleImage, signInEditor, signOutEditor,
  watchEditorAuth, ARTICLES_COLLECTION, CONTACT_COLLECTION, SUBMISSIONS_COLLECTION,
  USERS_COLLECTION, CATEGORIES_COLLECTION
};
