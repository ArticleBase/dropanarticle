# DropAnArticle ✎

A premium, professional article publishing platform built with vanilla HTML/CSS/JS and powered by **Firebase** (Hosting + Firestore + Analytics).

## ✦ Features

- **Stunning premium design** — editorial typography (Playfair Display + Plus Jakarta Sans), glassmorphism navbar, animated hero, dark/light mode
- **7 complete pages** — Home, Articles, Article reader, About, Contact, Admin writer's studio, 404
- **Live Firestore integration** — articles load from Firestore, with automatic fallback to `articles/articles.json`
- **Writer's studio (`admin.html`)** — compose & publish articles to Firestore directly from the browser
- **Contact & newsletter forms** — messages saved to the `messages` collection
- **SEO ready** — sitemap.xml, robots.txt, Open Graph tags, clean semantic HTML
- **Fully responsive** — mobile hamburger nav, adaptive grids

## ✦ Project structure

```
dropanarticle/
├── index.html            # Home — hero, featured, latest, topics, newsletter
├── articles.html         # All articles with live category filters
├── article.html          # Reader (loads ?slug= from Firestore or JSON)
├── about.html            # About page
├── contact.html          # Contact form → Firestore
├── admin.html            # Writer's studio — publish/manage articles
├── 404.html              # Custom not-found page
├── css/style.css         # Full design system (light + dark themes)
├── js/firebase.js        # Firebase config + helpers (Firestore, Analytics)
├── js/main.js            # UI engine — nav, theme, rendering, forms, admin
├── articles/articles.json# Fallback + seed articles
├── images/favicon.svg    # Brand mark
├── firebase.json         # Hosting + Firestore deploy config
├── .firebaserc           # Project alias → dropanarticle
├── firestore.rules       # Security rules
├── robots.txt
└── sitemap.xml
```

## ✦ Firebase setup (one-time, ~5 minutes)

Your web config is already wired in `js/firebase.js`:

| Key | Value |
|---|---|
| Project ID | `dropanarticle` |
| Auth domain | `dropanarticle.firebaseapp.com` |

### 1 — Enable Firestore
1. Open [Firebase Console](https://console.firebase.google.com) → select project **dropanarticle**
2. **Build → Firestore Database → Create database**
3. Choose **Production mode** → pick a region → Enable

### 2 — Deploy security rules
```bash
npm install -g firebase-tools
firebase login
firebase use dropanarticle
firebase deploy --only firestore:rules
```
Or paste `firestore.rules` manually in **Firestore → Rules → Publish**.

> The included rules let anyone read articles and submit messages, while writes to existing articles require auth. For fully open community publishing, change `allow create, update, delete: if request.auth != null;` to `allow create, update, delete: if true;` in the `articles` block.

### 3 — Deploy the website (Firebase Hosting)
```bash
firebase deploy --only hosting
```
Your site goes live instantly at `https://dropanarticle.web.app` (and `.firebaseapp.com`). Hosting config (`firebase.json`) already includes the 404 rewrite and SPA-safe caching.

## ✦ Publishing workflow

1. Go to `/admin.html` — fill in title, author, category, cover image, excerpt and HTML body
2. Click **Publish Article** → written to Firestore collection `articles`
3. It appears instantly on the home page, articles page, and gets its own reader URL: `/article.html?slug=your-slug`
4. If Firestore is unreachable, the site gracefully falls back to `articles/articles.json` — it never goes blank

## ✦ Local preview

Any static server works:
```bash
npx serve .        # or: python -m http.server
```

## ✦ Collections used

| Collection | Purpose | Fields |
|---|---|---|
| `articles` | Published articles | slug, title, category, author, date, readTime, image, excerpt, content, status, createdAt |
| `messages` | Contact + newsletter | name, email, subject, message, createdAt, read |

---
© 2026 DropAnArticle · Crafted with passion · Powered by Firebase
