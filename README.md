# TravelStory Hub — Premium Travel Editorial Platform

TravelStory Hub is a responsive travel publishing website built with HTML, CSS, vanilla JavaScript, Firebase Authentication, Cloud Firestore, Firebase Storage, TinyMCE, and Firebase Cloud Functions. Contributors can submit travel stories for human review; approved stories are published at `/story/{slug}` with server-rendered HTML and article metadata.

## Pages and features

- `index.html` — travel editorial homepage with featured and latest stories.
- `articles.html` — dynamic article library with category filters, keyword matching, and cursor pagination.
- `/story/{slug}` — server-rendered public article route from the `renderStory` Cloud Function.
- `article.html?slug=...` — client-side preview fallback for local static development.
- `submit.html` — public contributor form; submissions go to a private review queue and are not published automatically.
- `admin.html` — protected editorial studio for approved editor/admin accounts, article editing, drafts, category management, and contributor moderation.
- `about.html`, `contact.html`, and `404.html` — site information and support.
- `js/firebase.js` — modular Firebase data, authentication, and Storage layer.
- `js/tinymce-loader.js` — lazy loader for the official TinyMCE Cloud script.
- `js/site-config.js` — public runtime settings, including the TinyMCE API key.
- `functions/index.js` — server-rendered article pages and a database-backed sitemap.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` — access control and query support.

## Environment configuration example

`.env.example` documents deployment-time values without containing credentials. Because this project is served as static HTML/JavaScript rather than bundled by a frontend build tool, the browser does not read `.env` files automatically. For a plain Firebase Hosting deployment, set the public TinyMCE key and consent setting in `js/site-config.js`; never put privileged service-account credentials in frontend files. If you add a CI build pipeline, inject these values during the build and keep real `.env` files out of source control.

## Required setup before launch

### 1. TinyMCE API key

1. Create or sign in to a TinyMCE account and obtain a Tiny Cloud API key.
2. Open `js/site-config.js` and replace `tinyMceApiKey: "no-api-key"` with the key for your site.
3. Configure the deployed hostname in the TinyMCE account as required by your plan.
4. Reload `admin.html` and `submit.html`, and confirm the editor loads, can save content, and shows no TinyMCE key/domain error.

Without a valid key, the pages display an explicit setup message and the ordinary textarea remains as a fallback; rich-text editing is not active.

### 2. Firebase Console

The web configuration for project `dropanarticle` is included in `js/firebase.js`. Firebase web configuration is client-visible by design. It is **not** a server secret; Firestore and Storage rules must remain restrictive.

In Firebase Console for `dropanarticle`:

1. Create or verify the Cloud Firestore database.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create the initial editorial user from the Authentication page.
4. In Firestore, create `users/{AUTH_UID}` where `{AUTH_UID}` is the exact UID from the Authentication user record. Add fields such as `role: "admin"`, `displayName`, and `email`. Assign roles manually using the Firebase Console or trusted server-side code; the website intentionally has no public role-assignment screen.
5. Enable Firebase Storage.
6. Publish `firestore.rules`, `firestore.indexes.json`, and `storage.rules` from this project. The rules allow anonymous visitors to create validated pending submissions only; they cannot read the submission queue or publish content directly. Article writes and editorial review require an authenticated user with `editor` or `admin` in their protected user profile.
7. Test with a non-editor account to confirm the admin panel and direct writes remain restricted.

The code uses the `submissions` collection for contributor review, `articles` for editorial content, `categories` for taxonomy, `messages` for contact/newsletter requests, and `users` for profiles and editor roles. The repository also includes `articles/articles.json` as optional sample content for development. To show those examples in an isolated preview, set `useDemoFallback: true` in `js/site-config.js`; keep this disabled for production so database errors are not hidden and only Firestore content is treated as live content.

### 3. Cloud Functions and Hosting

The article route and live sitemap require Firebase Cloud Functions. Deploying Cloud Functions may require a Firebase project on the Blaze billing plan; check the current Firebase plan requirements and budget alerts before enabling them.

Install Node.js 20 and the Firebase CLI, then run these commands from this project directory:

```bash
npm install -g firebase-tools
firebase login
firebase use dropanarticle
cd functions
npm install
cd ..
firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions
```

Review Firebase's deployment output; it should list `renderStory` and `dynamicSitemap`. The `firebase.json` Hosting rewrites route `/story/**` to `renderStory` and `/sitemap.xml` to `dynamicSitemap`. If you use a custom domain, set `canonicalBaseUrl` in `js/site-config.js` to your canonical HTTPS origin and update `robots.txt` to point to the correct sitemap. The SSR function uses the incoming host for canonical tags; confirm that behavior against your production domain and custom-domain setup before launch.

### 4. Local development

For a simple static preview, run from the project directory:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. Client modules load over HTTPS from Google's Firebase CDN. A static Python server does not run Cloud Functions, so `/story/{slug}` and the dynamic sitemap need the Firebase Hosting/Functions emulator or a deployed Firebase project. To test the complete routing locally after dependencies are installed:

```bash
firebase emulators:start --only hosting,functions,firestore,auth,storage
```

Configure the emulator/test project intentionally before submitting test data. A static preview does not verify Firebase Rules or production service behavior.

## Editor and contributor workflow

1. A contributor submits a title, author details, category, summary, tags, cover-image URL, and article body.
2. The website stores the submission in the private `submissions` collection with `status: pending` and `reviewed: false`.
3. An approved editor signs into `admin.html`, reads the submission, and checks article quality, factual accuracy, originality, image rights, link destinations, and sponsorship disclosures.
4. The editor can publish the submission or request changes/reject it. Publishing creates an `articles` record and updates the original submission to `published`.
5. Published stories appear in the public library and at `/story/{slug}`. The dynamic sitemap includes published article URLs.

### Image uploads

Inline TinyMCE image uploads are available in the editor dashboard and require editor permissions. Files must be JPEG, PNG, WebP, or GIF, and no larger than 8 MB. Uploads go to `article-media/{uid}/...` in Firebase Storage. Contributors can provide a public HTTPS cover image URL, which is reviewed before publication; the public submission form cannot upload directly into editor-owned Storage paths.

## Search and SEO notes

- Firestore search uses stored normalized `searchTerms` and is not a full-text search engine. It supports simple token-based discovery, not linguistic relevance ranking. For larger catalogs or advanced full-text search, integrate a dedicated search provider.
- Published article HTML is sanitized on the server before rendering.
- The server route generates page-specific title, description, canonical URL, Open Graph metadata, and BlogPosting JSON-LD.
- The sitemap is generated from published Firestore article records; drafts and private submissions are excluded.
- Contributor links are editorially reviewed. Paid/sponsored links should carry appropriate `rel="sponsored"` attributes; untrusted user-generated links may need `ugc` and/or `nofollow`. No article placement guarantees domain authority or ranking improvement.

## Integrations not included by default

- **Email delivery:** contact forms and newsletter requests are stored in Firestore. Email notifications and newsletter sending are not configured until an approved email provider and trusted server-side workflow are added.
- **Analytics:** Firebase Analytics is opt-in and disabled by default. Enable `analyticsConsent` only after implementing the consent process appropriate for your audience.
- **TinyMCE:** a real Tiny Cloud API key is required for active rich-text editing.
- **Spam prevention:** add and test Firebase App Check or another abuse-control layer before inviting high-volume anonymous public submissions. Firestore Rules validate submitted fields but are not a substitute for rate limiting.

## Final pre-launch checklist

- [ ] Replace the TinyMCE placeholder with a valid, domain-authorized key.
- [ ] Confirm Firestore, Email/Password Authentication, and Storage are enabled.
- [ ] Create the initial admin account and assign `users/{uid}.role = "admin"` manually.
- [ ] Deploy and test the Firestore rules, indexes, and Storage rules.
- [ ] Deploy both Cloud Functions and Hosting.
- [ ] Confirm `/story/{slug}` returns server-rendered article HTML for published stories and a 404 for missing/unpublished stories.
- [ ] Confirm `/sitemap.xml` contains only published article URLs.
- [ ] Test contributor submission, editorial review, draft saving, publishing, image uploads, and permissions with both authorized and unauthorized accounts.
- [ ] Test mobile layouts, keyboard access, reduced motion, social metadata, canonical URLs, and custom 404 handling.
- [ ] Add email delivery and spam controls before promoting the contributor form publicly.

## Verification scope

The project source can be checked locally for syntax and configuration structure. Live Firebase reads/writes, deployed Cloud Functions, TinyMCE activation, email delivery, and production-domain metadata must be tested in the actual Firebase and TinyMCE accounts before the site should be described as production-verified.
