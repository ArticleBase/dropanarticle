/* ============================================================
   TravelStory Hub — UI Engine
   Nav, theme, article rendering, forms, admin
   ============================================================ */

/* ---------- Theme ---------- */
function getTheme() {
  try { return localStorage.getItem("daa-theme") || "light"; } catch { return "light"; }
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("daa-theme", t); } catch { /* Theme still applies for this page. */ }
  document.querySelectorAll(".theme-toggle").forEach(b => {
    b.innerHTML = t === "dark" ? "&#9728;" : "&#9790;";
    b.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
  });
}
function toggleTheme() { applyTheme(getTheme() === "dark" ? "light" : "dark"); }

/* ---------- Nav ---------- */
function initNav() {
  const ham = document.getElementById("hamburger");
  const links = document.getElementById("navLinks");
  if (ham && links) {
    ham.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));
  }
  document.querySelectorAll(".theme-toggle").forEach(b => b.addEventListener("click", toggleTheme));
  // mark active link
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(a => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });
}

/* ---------- Reveal on scroll ---------- */
function initReveal() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("visible"));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
}

/* ---------- Toast ---------- */
let _toastTimer;
function toast(msg, type = "info") {
  let t = document.getElementById("daa-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "daa-toast"; t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
}

/* ---------- Helpers ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = d => { try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); } catch { return d; } };
const initials = n => (n || "DA").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();


/** Small allow-list sanitizer for rendered editor HTML. Firebase Rules cannot sanitize HTML. */
function sanitizeArticleHTML(input) {
  const parser = document.createElement("template");
  parser.innerHTML = String(input || "");
  const allowed = new Set(["P", "H2", "H3", "H4", "UL", "OL", "LI", "BLOCKQUOTE", "A", "IMG", "FIGURE", "FIGCAPTION", "STRONG", "B", "EM", "I", "U", "S", "HR", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "BR", "PRE", "CODE"]);
  const removeEntirely = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SVG", "MATH", "VIDEO", "AUDIO", "SOURCE"]);
  const safeUrl = value => {
    try { const url = new URL(value, location.href); return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : ""; }
    catch { return ""; }
  };
  const clean = parent => {
    [...parent.childNodes].forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      if (removeEntirely.has(tag)) { node.remove(); return; }
      if (!allowed.has(tag)) {
        clean(node);
        node.replaceWith(...node.childNodes);
        return;
      }
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        if (tag === "A" && name === "href") {
          const url = safeUrl(attribute.value);
          if (url) node.setAttribute("href", url); else node.removeAttribute("href");
          return;
        }
        if (tag === "IMG" && name === "src") {
          const url = safeUrl(attribute.value);
          if (url && /^https?:/i.test(url)) node.setAttribute("src", url); else node.removeAttribute("src");
          return;
        }
        if ((tag === "A" && ["title", "target", "rel"].includes(name)) || (tag === "IMG" && ["alt", "title", "width", "height"].includes(name))) return;
        node.removeAttribute(attribute.name);
      });
      if (tag === "A" && node.getAttribute("href")) {
        try {
          const linkUrl = new URL(node.getAttribute("href"), location.href);
          if (["http:", "https:"].includes(linkUrl.protocol) && linkUrl.origin !== location.origin) {
            const sourceRel = String(node.getAttribute("rel") || "").toLowerCase().split(/\s+/).filter(Boolean);
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", [...new Set([...(sourceRel.includes("sponsored") ? ["sponsored"] : ["ugc"]), "nofollow", "noopener", "noreferrer"])].join(" "));
          } else if (node.getAttribute("target") === "_blank") {
            node.setAttribute("rel", "noopener noreferrer");
          } else {
            node.removeAttribute("rel");
          }
        } catch { node.removeAttribute("href"); }
      }
      if (tag === "IMG") { node.setAttribute("loading", "lazy"); node.setAttribute("decoding", "async"); }
      clean(node);
    });
  };
  clean(parser.content);
  return parser.innerHTML;
}

function slugify(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 140);
}

function formValue(form, name) {
  const element = form?.elements?.namedItem(name);
  return element && "value" in element ? element.value : "";
}

function debounce(callback, delay = 700) {
  let timer;
  const debounced = (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

async function createTinyEditor(selector, statusElementId) {
  const textarea = document.querySelector(selector);
  if (!textarea) return null;
  const status = statusElementId ? document.getElementById(statusElementId) : null;
  const config = window.TRAVELSTORY_CONFIG || {};
  const ready = window.TinyMCEReady ? await window.TinyMCEReady : { loaded: !!window.tinymce, configured: !!config.tinyMceApiKey };
  if (!config.tinyMceApiKey || config.tinyMceApiKey === "no-api-key") {
    if (status) {
      status.className = "form-status error";
      status.textContent = "TinyMCE setup required: add your Tiny Cloud API key in js/site-config.js and register your deployed domain. The plain-text fallback remains available until configured.";
    }
    return null;
  }
  if (!ready.loaded || !window.tinymce || typeof window.tinymce.init !== "function") {
    if (status) { status.className = "form-status error"; status.textContent = "TinyMCE could not load. Check your network connection, API key, and approved domain in Tiny Cloud."; }
    return null;
  }
  const existing = window.tinymce.get(textarea.id);
  if (existing) return existing;
  const editorSurface = selector === "#content";
  const plugins = ["autolink", "autosave", "charmap", "code", "fullscreen", "link", "lists", "preview", "searchreplace", "table", "visualblocks", "wordcount"];
  if (editorSurface) plugins.push("image", "media");
  const editorConfig = {
    selector,
    height: 520,
    min_height: 360,
    resize: true,
    menubar: "file edit view insert format tools table help",
    plugins: plugins.join(" "),
    toolbar: editorSurface
      ? "undo redo | blocks | bold italic underline strikethrough | alignleft aligncenter alignright | bullist numlist | blockquote | link image table | removeformat | code preview fullscreen"
      : "undo redo | blocks | bold italic underline | alignleft aligncenter alignright | bullist numlist | blockquote | link table | removeformat | preview fullscreen",
    toolbar_mode: "sliding",
    promotion: false,
    branding: false,
    browser_spellcheck: true,
    contextmenu: "link table",
    paste_data_images: false,
    automatic_uploads: editorSurface,
    images_reuse_filename: false,
    autosave_interval: "20s",
    autosave_retention: "30m",
    autosave_ask_before_unload: true,
    content_style: "body{font-family:Arial,sans-serif;font-size:16px;line-height:1.8;max-width:900px;margin:20px auto;padding:0 18px;color:#24333a}h2,h3,h4{font-family:Georgia,serif;line-height:1.3;color:#123e46}img{max-width:100%;height:auto;border-radius:10px}blockquote{border-left:4px solid #0c8077;padding-left:18px;color:#53676b}",
    setup: editor => {
      editor.on("init", () => {
        if (editor.mode.get() === "readonly" && status) {
          status.className = "form-status error";
          status.textContent = "TinyMCE is read-only. Confirm this API key and domain are active in your Tiny Cloud account.";
        } else if (status && status.classList.contains("error")) {
          status.className = "editor-status"; status.textContent = "";
        }
      });
    }
  };
  if (editorSurface) {
    editorConfig.images_upload_handler = async (blobInfo, progress) => {
      try {
        return await window.DropAnArticleFirebase.uploadArticleImage(blobInfo.blob(), value => progress(value));
      } catch (error) {
        throw { message: error?.message || "Image upload failed. Sign in with an approved editor account and try again." };
      }
    };
  }
  try {
    await window.tinymce.init(editorConfig);
    return window.tinymce.get(textarea.id) || null;
  } catch (error) {
    console.error("TinyMCE initialization failed", error);
    if (status) { status.className = "form-status error"; status.textContent = "TinyMCE failed to initialize. Confirm your API key and approved domain, then reload this page."; }
    return null;
  }
}
function articleHref(slug) {
  const localStaticPreview = location.protocol === "file:" || ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && !["5000", "5001"].includes(location.port));
  // GitHub Pages is static hosting: it does not apply the /story/** rewrite in firebase.json.
  // Use the existing article reader page with a slug query on *.github.io deployments.
  const githubPagesStaticHosting = location.hostname === "github.io" || location.hostname.endsWith(".github.io");
  const encodedSlug = encodeURIComponent(slug || "");
  return (localStaticPreview || githubPagesStaticHosting) ? `article.html?slug=${encodedSlug}` : `/story/${encodedSlug}`;
}
function articleCanonicalUrl(slug) {
  const encodedSlug = encodeURIComponent(slug || "");
  const githubPagesStaticHosting = location.hostname === "github.io" || location.hostname.endsWith(".github.io");
  if (githubPagesStaticHosting) return new URL(`article.html?slug=${encodedSlug}`, location.href).href;
  const base = String(window.TRAVELSTORY_CONFIG?.canonicalBaseUrl || location.origin).replace(/\/$/, "");
  return `${base}/story/${encodedSlug}`;
}
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}
function plainTextToHTML(value) {
  return String(value || "").replace(/\r/g, "").split(/\n{2,}/).map(part => part.trim()).filter(Boolean)
    .map(part => `<p>${esc(part).replace(/\n/g, "<br>")}</p>`).join("");
}

function cardHTML(a) {
  const imageUrl = safeHttpUrl(a.image);
  return `
  <article class="article-card reveal">
    <a href="${articleHref(a.slug)}" class="card-image">
      ${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(a.imageAlt || a.title)}" loading="lazy" decoding="async">` : `<span class="card-image-placeholder" aria-hidden="true">✦</span>`}
      <span class="card-cat">${esc(a.category)}</span>
    </a>
    <div class="card-body">
      <div class="card-meta"><span>${fmtDate(a.date)}</span><span>·</span><span>${esc(a.readTime || "5 min read")}</span></div>
      <h3 class="card-title"><a href="${articleHref(a.slug)}">${esc(a.title)}</a></h3>
      <p class="card-excerpt">${esc(a.excerpt)}</p>
      <div class="card-footer">
        <div class="card-author"><span class="avatar">${initials(a.author)}</span>${esc(a.author)}</div>
        <a class="read-link" href="${articleHref(a.slug)}">Read <span>&#8594;</span></a>
      </div>
    </div>
  </article>`;
}

function sideItemHTML(a) {
  const imageUrl = safeHttpUrl(a.image);
  return `
  <a class="side-item reveal" href="${articleHref(a.slug)}">
    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(a.imageAlt || a.title)}" loading="lazy" decoding="async">` : `<span class="side-image-placeholder" aria-hidden="true">✦</span>`}
    <div>
      <div class="card-meta"><span style="color:var(--violet);font-weight:800">${esc(a.category)}</span><span>·</span><span>${fmtDate(a.date)}</span></div>
      <h4>${esc(a.title)}</h4>
    </div>
  </a>`;
}

/* ---------- Home page ---------- */
async function initHome() {
  const featuredMain = document.getElementById("featuredMain");
  const featuredSide = document.getElementById("featuredSide");
  const latestGrid = document.getElementById("latestGrid");
  if (!latestGrid) return;

  let articles = [];
  try { articles = await window.DropAnArticleFirebase.fetchArticles(); }
  catch (e) {
    latestGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>Stories could not be loaded</strong><p>Check the Firebase connection and database rules, then refresh the page.</p></div>`;
    if (featuredMain) featuredMain.innerHTML = `<div class="empty-state"><strong>Travel stories are temporarily unavailable</strong><p>Please try again shortly.</p></div>`;
    if (featuredSide) featuredSide.innerHTML = "";
    return;
  }

  const pub = articles.filter(a => a.status !== "draft");
  const [first, ...rest] = pub;

  if (!first) {
    if (featuredMain) featuredMain.innerHTML = `<div class="empty-state"><strong>Fresh stories are on the way</strong><p>Our editorial team is preparing useful destination guides and travel insights. Be among the first to contribute a story.</p><a class="btn btn-primary" href="submit.html">Submit a travel story →</a></div>`;
    if (featuredSide) featuredSide.innerHTML = "";
    latestGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>No published articles yet</strong><p>Published travel stories will appear here as soon as an editor approves them.</p><a class="btn btn-outline" href="submit.html">Contribute an article</a></div>`;
  }

  if (first && featuredMain) {
    featuredMain.innerHTML = `
      <img src="${esc(first.image)}" alt="${esc(first.title)}">
      <div class="featured-content">
        <span class="card-cat" style="position:static">${esc(first.category)}</span>
        <h2><a href="${articleHref(first.slug)}">${esc(first.title)}</a></h2>
        <p>${esc(first.excerpt)}</p>
        <div class="card-meta" style="color:rgba(255,255,255,.8);margin-bottom:18px">
          <span>${esc(first.author)}</span><span>·</span><span>${fmtDate(first.date)}</span><span>·</span><span>${esc(first.readTime || "")}</span>
        </div>
        <a class="btn btn-light" href="${articleHref(first.slug)}">Read the Story &#8594;</a>
      </div>`;
  }
  if (first) {
    if (featuredSide) featuredSide.innerHTML = rest.slice(0, 3).map(sideItemHTML).join("");
    if (rest.length) latestGrid.innerHTML = rest.slice(0, 6).map(cardHTML).join("");
    else latestGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>More stories are on the way</strong><p>Explore the library for more travel inspiration as our editors publish new guides.</p><a class="btn btn-outline" href="articles.html">Browse the library</a></div>`;
  }
  initReveal();

  // Category cards come from Firestore-managed taxonomy, not hardcoded production content.
  const topicGrid = document.getElementById("topicGrid");
  if (topicGrid) {
    try {
      const categories = await window.DropAnArticleFirebase.fetchCategories();
      const icons = ["✦", "⌁", "↗", "◈", "⌖", "☼", "◇", "⌂"];
      topicGrid.innerHTML = categories.slice(0, 8).map((item, index) => `
        <a href="articles.html?category=${encodeURIComponent(item.name)}" class="topic-card reveal">
          <div class="topic-icon" aria-hidden="true">${icons[index % icons.length]}</div>
          <h3>${esc(item.name)}</h3>
          <p>${esc(item.description || `Explore ${item.name.toLowerCase()} stories, practical advice, and inspiration.`)}</p>
          <span class="topic-count">Explore topic <span aria-hidden="true">→</span></span>
        </a>`).join("") || `<div class="empty-state"><strong>Topics are being curated</strong><p>Check back soon for more ways to explore.</p></div>`;
      initReveal();
    } catch (error) {
      console.warn("Dynamic topic cards could not be loaded", error);
      topicGrid.innerHTML = `<div class="empty-state"><strong>Topics are temporarily unavailable</strong><p>Please try again shortly.</p></div>`;
    }
  }
}

/* ---------- Articles listing page ---------- */
async function initArticlesPage() {
  const grid = document.getElementById("articlesGrid");
  if (!grid) return;
  const filterBar = document.getElementById("filterBar");
  const searchInput = document.getElementById("articleSearch");
  const statusEl = document.getElementById("articleResultsStatus");
  const previousButton = document.getElementById("articlesPrevious");
  const nextButton = document.getElementById("articlesNext");
  const pageLabel = document.getElementById("articlesPageLabel");
  const pageSize = 9;
  let category = new URLSearchParams(window.location.search).get("category") || "";
  let searchTerm = new URLSearchParams(window.location.search).get("q") || "";
  let pageIndex = 0;
  let cursors = [null];
  let currentPage = { items: [], nextCursor: null, hasMore: false };

  async function loadPage() {
    grid.innerHTML = `<p class="loading-state" style="grid-column:1/-1">Finding stories for your next journey…</p>`;
    if (statusEl) statusEl.textContent = "Loading published travel stories…";
    try {
      currentPage = await window.DropAnArticleFirebase.fetchPublishedArticlePage({ pageSize, cursor: cursors[pageIndex] || null, category, searchTerm });
      grid.innerHTML = currentPage.items.length
        ? currentPage.items.map(cardHTML).join("")
        : `<div class="empty-state"><strong>No stories found</strong><p>Try a different keyword or category, or clear the filters to browse all travel stories.</p></div>`;
      if (statusEl) {
        const phrase = searchTerm ? ` for “${searchTerm.replace(/[&<>]/g, "") }”` : "";
        const topic = category ? ` in ${category}` : "";
        const itemLabel = currentPage.items.length === 1 ? "story" : "stories";
        statusEl.textContent = currentPage.items.length ? `Showing ${currentPage.items.length} ${itemLabel} on page ${pageIndex + 1}${topic}${phrase}.` : `No published stories${topic}${phrase}.`;
        if (currentPage.demo) statusEl.textContent += " Demo sample content is enabled; connect Firestore before production.";
      }
      if (pageLabel) pageLabel.textContent = `Page ${pageIndex + 1}`;
      if (previousButton) previousButton.disabled = pageIndex === 0;
      if (nextButton) nextButton.disabled = !currentPage.hasMore || !currentPage.nextCursor;
      initReveal();
    } catch (error) {
      console.error("Article library failed to load", error);
      grid.innerHTML = `<div class="empty-state"><strong>Stories could not be loaded</strong><p>Check the Firebase connection, Firestore rules, and required composite indexes, then refresh this page.</p></div>`;
      if (statusEl) statusEl.textContent = "Unable to connect to the published article library.";
      if (previousButton) previousButton.disabled = pageIndex === 0;
      if (nextButton) nextButton.disabled = true;
    }
  }

  async function loadCategories() {
    if (!filterBar) return;
    try {
      const categories = await window.DropAnArticleFirebase.fetchCategories();
      if (category && !categories.some(item => item.name === category)) category = "";
      const filterItems = [{ name: "All topics", value: "" }, ...categories.map(item => ({ name: item.name, value: item.name }))];
      filterBar.innerHTML = filterItems
        .map(item => `<button type="button" class="filter-chip${item.value === category ? " active" : ""}" data-cat="${esc(item.value)}">${esc(item.name)}</button>`).join("");
      if (searchInput) searchInput.value = searchTerm;
    } catch (error) {
      console.warn("Could not load dynamic article categories", error);
      filterBar.innerHTML = `<span class="small-muted">Categories will appear once the database is available.</span>`;
    }
  }
  function resetPaging() { pageIndex = 0; cursors = [null]; loadPage(); }
  if (filterBar) filterBar.addEventListener("click", event => {
    const button = event.target.closest(".filter-chip");
    if (!button) return;
    category = button.dataset.cat || "";
    filterBar.querySelectorAll(".filter-chip").forEach(item => item.classList.toggle("active", item === button));
    resetPaging();
  });
  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => {
      searchTerm = searchInput.value.trim(); resetPaging();
    }, 450));
  }
  previousButton?.addEventListener("click", () => {
    if (pageIndex <= 0) return;
    pageIndex--; loadPage();
  });
  nextButton?.addEventListener("click", () => {
    if (!currentPage.nextCursor || !currentPage.hasMore) return;
    cursors[pageIndex + 1] = currentPage.nextCursor;
    pageIndex++; loadPage();
  });
  await loadCategories();
  await loadPage();
}
/* ---------- Article reader page ---------- */
async function initReader() {
  if (document.body.dataset.serverRenderedArticle === "true") return;
  const slug = new URLSearchParams(location.search).get("slug");
  const hero = document.getElementById("readerHero");
  const body = document.getElementById("readerBody");
  if (!hero || !body) return;
  if (!slug) {
    hero.innerHTML = `<div class="container" style="padding:80px 24px"><h1>Article slug missing</h1><p><a href="articles.html">Browse all travel articles</a></p></div>`;
    return;
  }
  let article;
  try { article = await window.DropAnArticleFirebase.fetchArticleBySlug(slug); }
  catch {
    hero.innerHTML = `<div class="container" style="padding:80px 24px"><h1>Article not found</h1><p>This story may have been unpublished or moved.</p><a href="articles.html" class="btn btn-primary">Browse travel stories</a></div>`;
    body.replaceChildren(); return;
  }
  document.title = `${article.metaTitle || article.title} — TravelStory Hub`;
  const description = article.metaDescription || article.excerpt || "Read this travel story on TravelStory Hub.";
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", article.title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = articleCanonicalUrl(article.slug);
  const imageUrl = safeHttpUrl(article.image);
  const jsonLd = {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: article.title, description, datePublished: article.publishedAt?.toDate?.().toISOString?.() || article.date,
    dateModified: article.updatedAt?.toDate?.().toISOString?.() || article.date,
    author: { "@type": "Person", name: article.author || "TravelStory Hub Contributor" },
    publisher: { "@type": "Organization", name: "TravelStory Hub" },
    mainEntityOfPage: canonical?.href || location.href,
    ...(imageUrl ? { image: [imageUrl] } : {})
  };
  document.getElementById("articleStructuredData")?.remove();
  const schema = document.createElement("script"); schema.type = "application/ld+json"; schema.id = "articleStructuredData"; schema.textContent = JSON.stringify(jsonLd); document.head.appendChild(schema);
  const tags = Array.isArray(article.tags) ? article.tags : [];
  hero.innerHTML = `
    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(article.imageAlt || article.title)}" fetchpriority="high">` : ""}
    <div class="reader-hero-content"><div class="container">
      <a class="back-link" href="articles.html" style="color:#fff;opacity:.85">← All articles</a>
      <span class="card-cat" style="position:static">${esc(article.category || "Travel")}</span>
      <h1>${esc(article.title)}</h1><p class="reader-deck">${esc(article.excerpt || "")}</p>
      <div class="card-meta"><span class="card-author" style="color:#fff"><span class="avatar">${initials(article.author)}</span>${esc(article.author || "TravelStory Hub")}</span><span>·</span><span>${fmtDate(article.date)}</span><span>·</span><span>${esc(article.readTime || "5 min read")}</span></div>
    </div></div>`;
  body.innerHTML = sanitizeArticleHTML(article.content || `<p>${esc(article.excerpt || "")}</p>`);
  const tocHeadings = [...body.querySelectorAll("h2, h3")];
  if (tocHeadings.length > 2) {
    const toc = document.createElement("nav"); toc.className = "article-toc reveal"; toc.setAttribute("aria-label", "On this page");
    const heading = document.createElement("strong"); heading.textContent = "On this page"; toc.appendChild(heading);
    const list = document.createElement("ol");
    tocHeadings.forEach((item, index) => {
      if (!item.id) item.id = `section-${index + 1}`;
      const row = document.createElement("li"); const link = document.createElement("a"); link.href = `#${item.id}`; link.textContent = item.textContent; row.appendChild(link); list.appendChild(row);
    });
    toc.appendChild(list); body.prepend(toc);
  }
  if (tags.length) {
    const tagRow = document.createElement("div"); tagRow.className = "article-tags";
    tags.forEach(tag => { const chip = document.createElement("span"); chip.className = "article-tag"; chip.textContent = tag; tagRow.appendChild(chip); });
    body.appendChild(tagRow);
  }
  const share = document.createElement("div"); share.className = "article-share-tools";
  share.innerHTML = `<span>Share this story</span><button type="button" class="btn btn-outline btn-small" id="copyStoryLink">Copy link</button><a class="btn btn-outline btn-small" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical?.href || location.href)}">Facebook</a><a class="btn btn-outline btn-small" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical?.href || location.href)}">LinkedIn</a>`;
  body.appendChild(share);
  document.getElementById("copyStoryLink")?.addEventListener("click", async event => {
    try { await navigator.clipboard.writeText(canonical?.href || location.href); event.currentTarget.textContent = "Link copied"; toast("Article link copied", "success"); }
    catch { toast("Copy was blocked by this browser. Copy the page URL from the address bar.", "error"); }
  });
  const progress = document.createElement("div"); progress.className = "reading-progress"; progress.setAttribute("aria-hidden", "true"); document.body.appendChild(progress);
  const updateProgress = () => {
    const rect = body.getBoundingClientRect();
    const total = Math.max(1, body.scrollHeight - window.innerHeight);
    const consumed = Math.max(0, Math.min(total, -rect.top));
    progress.style.transform = `scaleX(${consumed / total})`;
  };
  window.addEventListener("scroll", updateProgress, { passive: true }); updateProgress(); initReveal();
}
/* ---------- Contact page ---------- */
function initContact() {
  const form = document.getElementById("contactForm");
  if (!form) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const status = document.getElementById("contactStatus");
    const btn = form.querySelector("button[type=submit]");
    const payload = {
      name: formValue(form, "name").trim(),
      email: formValue(form, "email").trim(),
      subject: formValue(form, "subject").trim(),
      message: formValue(form, "message").trim()
    };
    if (!payload.name || !payload.email || !payload.message) {
      status.className = "form-status error"; status.textContent = "Please fill in all required fields."; return;
    }
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await window.DropAnArticleFirebase.saveContactMessage(payload);
      status.className = "form-status success";
      status.textContent = "Your message was saved successfully. Automatic email notifications are not configured yet.";
      form.reset();
      toast("Message saved successfully", "success");
    } catch (err) {
      console.error(err);
      status.className = "form-status error";
      status.textContent = "Your message could not be saved. Please try again later.";
      toast("Failed to send message", "error");
    }
    btn.disabled = false; btn.textContent = "Send Message";
  });
}

/* ---------- Newsletter (all pages) ---------- */
function initNewsletter() {
  document.querySelectorAll(".newsletter-form").forEach(form => {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const input = form.querySelector("input[type=email]");
      const email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Please enter a valid email address", "error"); return; }
      try {
        await window.DropAnArticleFirebase.saveContactMessage({ name: "Newsletter subscriber", email, subject: "Newsletter signup", message: "Subscribe me to the TravelStory Hub travel digest." });
        input.value = "";
        toast("Subscription request saved. Email delivery is not configured yet.", "success");
      } catch { toast("Subscription failed — please try again.", "error"); }
    });
  });
}

/* ---------- Public travel article submissions ---------- */
async function initSubmissionForm() {
  const form = document.getElementById("submissionForm");
  if (!form) return;
  const statusEl = document.getElementById("submissionStatus");
  const draftEl = document.getElementById("submissionDraftStatus");
  const editor = await createTinyEditor("#subContent", "submissionEditorStatus");
  const draftKey = "travelstory-submission-draft-v2";
  let restoring = false;
  const categorySelect = form.elements.namedItem("category");
  if (categorySelect) {
    try {
      const categories = await window.DropAnArticleFirebase.fetchCategories();
      const selected = categorySelect.value;
      categorySelect.innerHTML = `<option value="">Choose a category</option>` + categories.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
      if (categories.some(item => item.name === selected)) categorySelect.value = selected;
    } catch (error) { console.warn("Category loading failed", error); }
  }
  try {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      const draft = JSON.parse(saved);
      const shouldRestore = Object.values(draft).some(value => typeof value === "string" && value.trim());
      if (shouldRestore && confirm("A locally saved travel submission was found. Restore it?")) {
        restoring = true;
        Object.entries(draft).forEach(([name, value]) => {
          if (name === "content") return;
          const field = form.elements.namedItem(name);
          if (field && "value" in field) field.value = value;
        });
        if (editor && draft.content) editor.setContent(draft.content);
        restoring = false;
        if (draftEl) draftEl.textContent = "Recovered your local draft.";
      }
    }
  } catch (error) { console.warn("Could not restore local contributor draft", error); }

  const saveLocalDraft = debounce(() => {
    if (restoring) return;
    try {
      const data = {};
      [...form.elements].forEach(field => {
        if (!field.name || ["original"].includes(field.name) || !("value" in field)) return;
        data[field.name] = field.name === "content" && editor ? editor.getContent() : field.value;
      });
      localStorage.setItem(draftKey, JSON.stringify(data));
      if (draftEl) draftEl.textContent = "Draft saved on this device";
    } catch { if (draftEl) draftEl.textContent = "Local draft storage is unavailable in this browser."; }
  }, 800);
  form.addEventListener("input", saveLocalDraft);
  form.addEventListener("change", saveLocalDraft);
  editor?.on("input change undo redo keyup", saveLocalDraft);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const title = formValue(form, "title").trim();
    const author = formValue(form, "author").trim();
    const email = formValue(form, "email").trim();
    const rawContent = editor ? editor.getContent() : plainTextToHTML(formValue(form, "content"));
    const content = sanitizeArticleHTML(rawContent);
    const contentText = editor ? editor.getContent({ format: "text" }).trim() : formValue(form, "content").trim();
    const excerpt = formValue(form, "excerpt").trim();
    if (title.length < 8 || title.length > 140) { statusEl.className = "form-status error"; statusEl.textContent = "The article title must contain between 8 and 140 characters."; return; }
    if (contentText.length < 300) { statusEl.className = "form-status error"; statusEl.textContent = "Please add at least 300 characters of original article text."; return; }
    if (content.length > 50000) { statusEl.className = "form-status error"; statusEl.textContent = "The article is too long. Please keep the formatted article under 50,000 characters."; return; }
    if (excerpt.length < 30 || excerpt.length > 500) { statusEl.className = "form-status error"; statusEl.textContent = "Add a helpful summary containing 30–500 characters."; return; }
    if (!author) { statusEl.className = "form-status error"; statusEl.textContent = "Enter your name or travel business name."; return; }
    if (!form.elements.namedItem("original").checked) { statusEl.className = "form-status error"; statusEl.textContent = "Please confirm that you have the right to submit this original content."; return; }
    const website = formValue(form, "website").trim();
    if (website && !safeHttpUrl(website)) { statusEl.className = "form-status error"; statusEl.textContent = "Use a valid http:// or https:// website URL."; return; }
    const image = formValue(form, "image").trim();
    if (image && !safeHttpUrl(image)) { statusEl.className = "form-status error"; statusEl.textContent = "Use a valid http:// or https:// cover image URL."; return; }
    const payload = {
      title, slug: slugify(title), author, email, website,
      category: formValue(form, "category"), tags: formValue(form, "tags"),
      image, imageAlt: formValue(form, "imageAlt").trim(), excerpt, content,
      metaTitle: formValue(form, "metaTitle").trim() || title,
      metaDescription: formValue(form, "metaDescription").trim() || excerpt
    };
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; button.textContent = "Sending for review…";
    statusEl.className = "form-status"; statusEl.textContent = "Submitting securely…";
    try {
      await window.DropAnArticleFirebase.submitTravelArticle(payload);
      statusEl.className = "form-status success";
      statusEl.textContent = "Thank you. Your article is now in the private editorial review queue and will not appear publicly until approved.";
      form.reset(); if (editor) editor.setContent("");
      localStorage.removeItem(draftKey);
      if (draftEl) draftEl.textContent = "";
      toast("Submission sent for editorial review", "success");
    } catch (error) {
      console.error("Travel article submission failed:", error);
      statusEl.className = "form-status error";
      statusEl.textContent = error?.message || "We couldn't submit the article. Check the Firebase rules and try again.";
      toast("Submission could not be sent", "error");
    } finally { button.disabled = false; button.innerHTML = "Send for editorial review <span>→</span>"; }
  });
}
/* ---------- Editorial studio ---------- */
async function initAdmin() {
  const form = document.getElementById("adminForm");
  const list = document.getElementById("adminList");
  const queue = document.getElementById("submissionQueue");
  const loginForm = document.getElementById("editorLoginForm");
  const workspace = document.getElementById("editorWorkspace");
  const loginStatus = document.getElementById("editorLoginStatus");
  const signOutButton = document.getElementById("editorSignOut");
  const statusEl = document.getElementById("adminStatus");
  const categoryForm = document.getElementById("categoryForm");
  const categoryList = document.getElementById("categoryList");
  const articleSearch = document.getElementById("adminArticleSearch");
  const statusFilter = document.getElementById("adminStatusFilter");
  const prevButton = document.getElementById("adminArticlesPrevious");
  const nextButton = document.getElementById("adminArticlesNext");
  const pageLabel = document.getElementById("adminArticlesPageLabel");
  if (!form || !loginForm || !workspace) return;

  let activeEditId = null;
  let autosavedDraftId = null;
  let currentUser = null;
  let adminEditor = null;
  let articlePageIndex = 0;
  let articleCursors = [null];
  let articlePageResult = { items: [], nextCursor: null, hasMore: false };
  let isSubmitting = false;
  let cloudSavePromise = Promise.resolve();
  const localDraftKey = "travelstory-admin-draft-v2";
  const setMessage = (message, kind = "info") => {
    if (!statusEl) return;
    statusEl.className = kind === "success" ? "form-status success" : kind === "error" ? "form-status error" : "form-status";
    statusEl.textContent = message;
  };

  function buildPayload(statusOverride = null) {
    const raw = adminEditor ? adminEditor.getContent() : plainTextToHTML(formValue(form, "content"));
    const content = sanitizeArticleHTML(raw);
    const contentText = adminEditor ? adminEditor.getContent({ format: "text" }).trim() : formValue(form, "content").trim();
    const title = formValue(form, "title").trim();
    const excerpt = formValue(form, "excerpt").trim();
    return {
      title, slug: slugify(formValue(form, "slug") || title),
      author: formValue(form, "author").trim(), authorWebsite: formValue(form, "authorWebsite").trim(),
      category: formValue(form, "category"), tags: formValue(form, "tags"),
      date: formValue(form, "date") || new Date().toISOString().slice(0, 10),
      readTime: formValue(form, "readTime").trim() || `${Math.max(1, Math.ceil(contentText.split(/\s+/).filter(Boolean).length / 220))} min read`,
      image: formValue(form, "image").trim(), imageAlt: formValue(form, "imageAlt").trim(),
      excerpt, content,
      metaTitle: (formValue(form, "metaTitle").trim() || title).slice(0, 70),
      metaDescription: (formValue(form, "metaDescription").trim() || excerpt).slice(0, 170),
      status: statusOverride || formValue(form, "status") || "draft", featured: false,
      _textLength: contentText.length
    };
  }
  function validatePayload(payload) {
    if (payload.title.length < 8 || payload.title.length > 140) throw new Error("Use an article title containing 8–140 characters.");
    if (payload._textLength < 300) throw new Error("Add at least 300 characters of useful article text before saving.");
    if (payload.excerpt.length < 30 || payload.excerpt.length > 500) throw new Error("Add a summary containing 30–500 characters.");
    if (payload.content.length > 100000) throw new Error("The formatted article is too large for a single Firestore document.");
    if (payload.authorWebsite && !safeHttpUrl(payload.authorWebsite)) throw new Error("The contributor website must use a valid HTTP or HTTPS URL.");
    if (payload.image && !safeHttpUrl(payload.image)) throw new Error("The cover image must use a valid HTTP or HTTPS URL.");
    delete payload._textLength;
    return payload;
  }

  async function refreshCategoryUI() {
    const categories = await window.DropAnArticleFirebase.fetchCategories();
    const select = form.elements.namedItem("category");
    if (select) {
      const selected = select.value;
      select.innerHTML = categories.map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
      if (categories.some(item => item.name === selected)) select.value = selected;
    }
    if (categoryList) {
      categoryList.innerHTML = categories.map(item => `<div class="category-manager-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.description || "")}</small></div>${item.isDefault ? `<span class="small-muted">Starter category</span>` : `<button class="btn btn-danger btn-small" type="button" data-delete-category="${esc(item.id)}">Delete</button>`}</div>`).join("");
    }
    return categories;
  }

  async function refresh() {
    if (!currentUser) return;
    if (list) list.innerHTML = `<p class="muted">Refreshing articles…</p>`;
    if (queue) queue.innerHTML = `<p class="muted">Loading editorial queue…</p>`;
    try {
      const status = statusFilter?.value || "";
      const term = articleSearch?.value.trim() || "";
      const [articleResult, submissions, stats] = await Promise.all([
        window.DropAnArticleFirebase.fetchAdminArticlePage({ pageSize: 10, cursor: articleCursors[articlePageIndex] || null, status, searchTerm: term }),
        window.DropAnArticleFirebase.fetchSubmissions(),
        window.DropAnArticleFirebase.getAdminStats()
      ]);
      articlePageResult = articleResult;
      renderArticles(articleResult.items);
      renderSubmissions(submissions.filter(item => ["pending", "changes_requested", "approved"].includes(item.status)));
      const total = document.getElementById("statArticleCount");
      const pending = document.getElementById("statPendingCount");
      const drafts = document.getElementById("statDraftCount");
      if (total) total.textContent = stats.published;
      if (pending) pending.textContent = stats.pending;
      if (drafts) drafts.textContent = stats.drafts;
      if (pageLabel) pageLabel.textContent = `Page ${articlePageIndex + 1}`;
      if (prevButton) prevButton.disabled = articlePageIndex === 0;
      if (nextButton) nextButton.disabled = !articleResult.hasMore || !articleResult.nextCursor;
      await refreshCategoryUI();
    } catch (error) {
      console.error("Editorial data load failed", error);
      const html = `<div class="empty-state"><strong>Editorial data could not be loaded</strong><p>Verify Firestore is enabled, deploy the included security rules and indexes, and confirm this account has an editor or admin role.</p><small>${esc(error?.message || "Unknown error")}</small></div>`;
      if (list) list.innerHTML = html;
      if (queue) queue.innerHTML = html;
    }
  }

  function renderArticles(articles) {
    if (!list) return;
    if (!articles.length) { list.innerHTML = `<div class="empty-state"><strong>No matching articles</strong><p>Create a new story or change the search and status filters.</p></div>`; return; }
    list.innerHTML = articles.map(article => {
      const status = article.status || "draft";
      const badgeClass = status === "published" ? "badge-published" : "badge-draft";
      return `<div class="admin-list-item"><div class="admin-item-copy"><h4>${esc(article.title)}</h4><small>${esc(article.category || "Uncategorised")} · ${esc(status)} · ${fmtDate(article.date || article.updatedAt?.toDate?.() || "")}</small></div><div class="admin-item-actions"><span class="badge ${badgeClass}">${esc(status)}</span><button class="btn btn-outline btn-small" type="button" data-edit-article="${esc(article.id)}">Edit</button><button class="btn btn-danger btn-small" type="button" data-delete-article="${esc(article.id)}">Delete</button></div></div>`;
    }).join("");
  }

  function renderSubmissions(submissions) {
    if (!queue) return;
    if (!submissions.length) { queue.innerHTML = `<div class="empty-state"><strong>All caught up</strong><p>New contributor submissions will appear here for review.</p></div>`; return; }
    queue.innerHTML = submissions.map(item => {
      const website = safeHttpUrl(item.website);
      return `<article class="submission-review-card"><div class="submission-review-top"><span class="badge ${item.status === "changes_requested" ? "badge-draft" : "badge-published"}">${esc(item.status || "pending")}</span><span class="small-muted">${fmtDate(item.createdAt?.toDate?.() || item.date || "")}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.excerpt || "No summary provided.")}</p><div class="submission-review-meta"><strong>${esc(item.author || "Unknown contributor")}</strong><span>${esc(item.category || "Travel")}</span></div><div class="submission-review-links"><a href="mailto:${encodeURIComponent(item.email || "")}">${esc(item.email || "No email")}</a>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer ugc nofollow">Contributor website ↗</a>` : ""}</div><details><summary>Read submitted article</summary><div class="review-content">${sanitizeArticleHTML(item.content || "")}</div></details>${item.editorialNotes ? `<p class="editorial-notes"><strong>Previous note:</strong> ${esc(item.editorialNotes)}</p>` : ""}<div class="submission-review-actions"><button type="button" class="btn btn-primary btn-small" data-publish-submission="${esc(item.id)}">Approve & publish</button><button type="button" class="btn btn-outline btn-small" data-request-changes="${esc(item.id)}">Request changes</button><button type="button" class="btn btn-danger btn-small" data-reject-submission="${esc(item.id)}">Reject</button></div></article>`;
    }).join("");
  }

  async function loadArticleIntoForm(id) {
    const article = await window.DropAnArticleFirebase.fetchAdminArticleById(id);
    if (!article) { toast("That article could not be found", "error"); return; }
    activeEditId = id; autosavedDraftId = null;
    ["title", "slug", "author", "authorWebsite", "category", "date", "readTime", "image", "imageAlt", "excerpt", "metaTitle", "metaDescription", "status"].forEach(name => {
      const field = form.elements.namedItem(name);
      if (field) field.value = article[name] ?? (name === "status" ? "draft" : "");
    });
    const tagsField = form.elements.namedItem("tags"); if (tagsField) tagsField.value = Array.isArray(article.tags) ? article.tags.join(", ") : String(article.tags || "");
    if (adminEditor) adminEditor.setContent(article.content || "");
    const heading = document.getElementById("composerHeading"); if (heading) heading.textContent = "Edit article";
    const button = form.querySelector("button[type=submit]"); if (button) button.textContent = "Save article changes →";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    setMessage(`Editing “${article.title}”. Changes to an existing article are saved when you click Save; browser draft caching is not a public publish action.`);
  }

  function resetComposer() {
    activeEditId = null; autosavedDraftId = null;
    form.reset(); if (adminEditor) adminEditor.setContent("");
    const status = form.elements.namedItem("status"); if (status) status.value = "draft";
    const heading = document.getElementById("composerHeading"); if (heading) heading.textContent = "Create a travel story";
    const button = form.querySelector("button[type=submit]"); if (button) button.textContent = "Save article →";
    localStorage.removeItem(localDraftKey);
    const saved = document.getElementById("adminDraftStatus"); if (saved) saved.textContent = "Draft stays on this device until saved to Firebase.";
  }

  async function initAdminEditorAndRestore() {
    adminEditor = await createTinyEditor("#content", "adminEditorStatus");
    try {
      const saved = localStorage.getItem(localDraftKey);
      if (saved && adminEditor) {
        const draft = JSON.parse(saved);
        const isNonEmpty = Object.values(draft).some(value => typeof value === "string" && value.trim());
        if (isNonEmpty && confirm("Restore the editorial draft saved on this device?")) {
          Object.entries(draft).forEach(([name, value]) => {
            const field = form.elements.namedItem(name);
            if (field && "value" in field && name !== "content") field.value = value;
          });
          if (draft.content) adminEditor.setContent(draft.content);
          setMessage("Local draft restored. Review it and save to your editor account.");
        }
      }
    } catch (error) { console.warn("Could not restore local editor draft", error); }
  }

  const saveLocalEditorDraft = debounce(() => {
    if (activeEditId || isSubmitting) return;
    try {
      const draft = {};
      ["title", "slug", "author", "authorWebsite", "category", "tags", "date", "readTime", "image", "imageAlt", "excerpt", "metaTitle", "metaDescription", "status"].forEach(name => draft[name] = formValue(form, name));
      draft.content = adminEditor ? adminEditor.getContent() : formValue(form, "content");
      localStorage.setItem(localDraftKey, JSON.stringify(draft));
      const saved = document.getElementById("adminDraftStatus"); if (saved) saved.textContent = "Local safety copy saved";
    } catch { /* local draft is an enhancement, not a blocker */ }
  }, 900);

  let cloudSaveInProgress = false;
  let cloudSaveQueued = false;
  const cloudAutosave = debounce(async () => {
    if (!currentUser || activeEditId || isSubmitting) return;
    if (cloudSaveInProgress) { cloudSaveQueued = true; return; }
    cloudSaveInProgress = true;
    try {
      do {
        cloudSaveQueued = false;
        const payload = buildPayload("draft");
        if (payload.title.length < 8 || payload.excerpt.length < 30 || payload._textLength < 300 || payload.content.length > 100000) return;
        validatePayload(payload);
        cloudSavePromise = window.DropAnArticleFirebase.saveArticle(payload, autosavedDraftId);
        const reference = await cloudSavePromise;
        autosavedDraftId = reference.id;
        const saved = document.getElementById("adminDraftStatus");
        if (saved) saved.textContent = "Private draft autosaved securely to Firebase";
      } while (cloudSaveQueued && currentUser && !isSubmitting);
    } catch (error) {
      console.warn("Firebase draft autosave failed", error);
      const saved = document.getElementById("adminDraftStatus"); if (saved) saved.textContent = "Cloud autosave unavailable. Your local safety copy is still available.";
    } finally { cloudSaveInProgress = false; }
  }, 1800);

  form.addEventListener("input", event => {
    if (event.target.name === "title" && !activeEditId && !formValue(form, "slug").trim()) {
      const slug = form.elements.namedItem("slug"); if (slug) slug.value = slugify(event.target.value);
    }
    saveLocalEditorDraft(); cloudAutosave();
  });
  form.addEventListener("change", () => { saveLocalEditorDraft(); cloudAutosave(); });
  adminEditor?.on("input change undo redo keyup", () => { saveLocalEditorDraft(); cloudAutosave(); });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    isSubmitting = true; cloudAutosave.cancel();
    try { await cloudSavePromise; } catch { /* manual save still gets a chance */ }
    let payload;
    try { payload = validatePayload(buildPayload()); }
    catch (error) { setMessage(error.message, "error"); isSubmitting = false; return; }
    const submitButton = form.querySelector("button[type=submit]");
    submitButton.disabled = true; submitButton.textContent = activeEditId || autosavedDraftId ? "Saving changes…" : "Saving article…";
    try {
      await window.DropAnArticleFirebase.saveArticle(payload, activeEditId || autosavedDraftId);
      const verb = payload.status === "published" ? "published" : payload.status === "archived" ? "archived" : "saved as a draft";
      setMessage(`“${payload.title}” was ${verb}.`, "success"); toast(`Article ${verb}`, "success");
      localStorage.removeItem(localDraftKey);
      resetComposer();
      articlePageIndex = 0; articleCursors = [null];
      await refresh();
    } catch (error) {
      console.error("Article save failed", error);
      setMessage(error?.message || "Article could not be saved. Confirm Firestore rules and editor permissions.", "error");
      toast("Article could not be saved", "error");
    } finally {
      isSubmitting = false; submitButton.disabled = false;
      if (submitButton) submitButton.textContent = activeEditId ? "Save article changes →" : "Save article →";
    }
  });

  if (list) list.addEventListener("click", async event => {
    const editButton = event.target.closest("[data-edit-article]");
    const deleteButton = event.target.closest("[data-delete-article]");
    if (editButton) { try { await loadArticleIntoForm(editButton.dataset.editArticle); } catch (error) { toast(error?.message || "Could not load this article", "error"); } }
    if (deleteButton) {
      if (!confirm("Permanently delete this article? This cannot be undone.")) return;
      try { await window.DropAnArticleFirebase.removeArticle(deleteButton.dataset.deleteArticle); toast("Article deleted", "success"); await refresh(); }
      catch (error) { toast(error?.message || "Delete failed", "error"); }
    }
  });

  if (queue) queue.addEventListener("click", async event => {
    const publishButton = event.target.closest("[data-publish-submission]");
    const changesButton = event.target.closest("[data-request-changes]");
    const rejectButton = event.target.closest("[data-reject-submission]");
    try {
      if (publishButton) {
        if (!confirm("Publish this contributor article? Check originality, facts, links, sponsorship disclosures, and image rights first.")) return;
        publishButton.disabled = true; publishButton.textContent = "Publishing…";
        await window.DropAnArticleFirebase.publishSubmission(publishButton.dataset.publishSubmission);
        toast("Submission published", "success"); await refresh();
      } else if (changesButton) {
        const notes = prompt("What should the contributor revise? Add clear editorial feedback:", "Please revise the following points: ");
        if (notes === null) return;
        await window.DropAnArticleFirebase.updateSubmissionStatus(changesButton.dataset.requestChanges, "changes_requested", notes);
        toast("Revision request saved", "success"); await refresh();
      } else if (rejectButton) {
        const notes = prompt("Add an internal reason for rejection (optional):", "");
        if (notes === null) return;
        await window.DropAnArticleFirebase.updateSubmissionStatus(rejectButton.dataset.rejectSubmission, "rejected", notes);
        toast("Submission rejected", "success"); await refresh();
      }
    } catch (error) { console.error(error); toast(error?.message || "Editorial action failed", "error"); }
  });

  if (categoryForm) categoryForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = categoryForm.querySelector("button[type=submit]"); button.disabled = true;
    try {
      await window.DropAnArticleFirebase.saveCategory({ name: formValue(categoryForm, "name"), description: formValue(categoryForm, "description") });
      categoryForm.reset(); await refreshCategoryUI(); toast("Category added", "success");
    } catch (error) { toast(error?.message || "Could not add category", "error"); }
    finally { button.disabled = false; }
  });
  if (categoryList) categoryList.addEventListener("click", async event => {
    const button = event.target.closest("[data-delete-category]");
    if (!button) return;
    if (!confirm("Delete this category? Existing articles keep their saved category label.")) return;
    try { await window.DropAnArticleFirebase.removeCategory(button.dataset.deleteCategory); await refreshCategoryUI(); toast("Category deleted", "success"); }
    catch (error) { toast(error?.message || "Could not delete category", "error"); }
  });
  prevButton?.addEventListener("click", () => { if (articlePageIndex > 0) { articlePageIndex--; refresh(); } });
  nextButton?.addEventListener("click", () => {
    if (articlePageResult.nextCursor && articlePageResult.hasMore) {
      articleCursors[articlePageIndex + 1] = articlePageResult.nextCursor; articlePageIndex++; refresh();
    }
  });
  const resetAdminFilters = debounce(() => { articlePageIndex = 0; articleCursors = [null]; refresh(); }, 450);
  articleSearch?.addEventListener("input", resetAdminFilters);
  statusFilter?.addEventListener("change", () => { articlePageIndex = 0; articleCursors = [null]; refresh(); });
  document.getElementById("refreshEditorialData")?.addEventListener("click", () => refresh());
  document.getElementById("resetComposer")?.addEventListener("click", resetComposer);

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginStatus.className = "form-status"; loginStatus.textContent = "Signing in and checking editorial permissions…";
    const submitButton = loginForm.querySelector("button[type=submit]"); submitButton.disabled = true;
    try {
      const credential = await window.DropAnArticleFirebase.signInEditor(document.getElementById("editorEmail").value.trim(), document.getElementById("editorPassword").value);
      const profile = await window.DropAnArticleFirebase.getEditorProfile(credential.user.uid);
      if (!profile || !["admin", "editor"].includes(profile.role)) {
        await window.DropAnArticleFirebase.signOutEditor();
        throw new Error("This account is signed in but lacks an editor role. In Firestore create users/" + credential.user.uid + " with role: editor or admin.");
      }
      loginStatus.className = "form-status success"; loginStatus.textContent = `Signed in as ${credential.user.email}.`;
    } catch (error) {
      loginStatus.className = "form-status error";
      loginStatus.textContent = error?.message || "Sign-in failed. Confirm Email/Password is enabled in Firebase Authentication.";
    } finally { submitButton.disabled = false; }
  });
  if (signOutButton) signOutButton.addEventListener("click", async () => {
    try { await window.DropAnArticleFirebase.signOutEditor(); } catch (error) { toast(error?.message || "Could not sign out", "error"); }
  });

  await initAdminEditorAndRestore();
  adminEditor?.on("input change undo redo keyup", () => { saveLocalEditorDraft(); cloudAutosave(); });
  window.DropAnArticleFirebase.watchEditorAuth(async user => {
    currentUser = user || null;
    if (loginForm) loginForm.querySelectorAll("input,button[type=submit]").forEach(element => element.disabled = !!user);
    if (!user) {
      workspace.style.display = "none";
      if (signOutButton) signOutButton.style.display = "none";
      loginStatus.className = "form-status"; loginStatus.textContent = "Sign in with an editor account to review submissions and publish articles.";
      return;
    }
    try {
      const profile = await window.DropAnArticleFirebase.getEditorProfile(user.uid);
      if (!profile || !["admin", "editor"].includes(profile.role)) throw new Error("This account does not have an editor role. Ask an administrator to set users/" + user.uid + ".role to editor or admin.");
      workspace.style.display = "block";
      if (signOutButton) signOutButton.style.display = "block";
      loginStatus.className = "form-status success"; loginStatus.textContent = `Signed in as ${user.email} · ${profile.role}`;
      const loginHeading = document.getElementById("editorLoginHeading"); if (loginHeading) loginHeading.textContent = "Editorial access active";
      await window.DropAnArticleFirebase.seedDefaultCategories();
      await refresh();
    } catch (error) {
      workspace.style.display = "none";
      loginStatus.className = "form-status error"; loginStatus.textContent = error?.message || "Editor permissions could not be verified.";
      if (signOutButton) signOutButton.style.display = "block";
    }
  }).catch(error => {
    loginStatus.className = "form-status error";
    loginStatus.textContent = "Firebase Authentication could not initialize. Check your project configuration and network connection.";
    console.error(error);
  });
}
/* ---------- Boot (Safely gated per page) ---------- */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(getTheme());
  initNav();
  initNewsletter();
  initReveal();

  // Safely trigger initializers only when their DOM elements are present
  if (document.getElementById("latestGrid") || document.getElementById("featuredMain")) {
    initHome();
  }
  if (document.getElementById("articlesGrid")) {
    initArticlesPage();
  }
  if (document.getElementById("readerHero")) {
    initReader();
  }
  if (document.getElementById("contactForm")) {
    initContact();
  }
  if (document.getElementById("adminForm")) {
    initAdmin();
  }
  if (document.getElementById("submissionForm")) {
    initSubmissionForm();
  }
});
