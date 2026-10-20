/* ============================================================
   DropAnArticle — UI Engine
   Nav, theme, article rendering, forms, admin
   ============================================================ */

/* ---------- Theme ---------- */
function getTheme() { return localStorage.getItem("daa-theme") || "light"; }
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("daa-theme", t);
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

function cardHTML(a) {
  return `
  <article class="article-card reveal">
    <a href="article.html?slug=${encodeURIComponent(a.slug)}" class="card-image">
      <img src="${esc(a.image)}" alt="${esc(a.title)}" loading="lazy">
      <span class="card-cat">${esc(a.category)}</span>
    </a>
    <div class="card-body">
      <div class="card-meta"><span>${fmtDate(a.date)}</span><span>·</span><span>${esc(a.readTime || "5 min read")}</span></div>
      <h3 class="card-title"><a href="article.html?slug=${encodeURIComponent(a.slug)}">${esc(a.title)}</a></h3>
      <p class="card-excerpt">${esc(a.excerpt)}</p>
      <div class="card-footer">
        <div class="card-author"><span class="avatar">${initials(a.author)}</span>${esc(a.author)}</div>
        <a class="read-link" href="article.html?slug=${encodeURIComponent(a.slug)}">Read <span>&#8594;</span></a>
      </div>
    </div>
  </article>`;
}

function sideItemHTML(a) {
  return `
  <a class="side-item reveal" href="article.html?slug=${encodeURIComponent(a.slug)}">
    <img src="${esc(a.image)}" alt="${esc(a.title)}">
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
  catch (e) { latestGrid.innerHTML = `<p style="text-align:center;color:var(--text-muted)">Could not load articles. Please try again later.</p>`; return; }

  const pub = articles.filter(a => a.status !== "draft");
  const [first, ...rest] = pub;

  if (first && featuredMain) {
    featuredMain.innerHTML = `
      <img src="${esc(first.image)}" alt="${esc(first.title)}">
      <div class="featured-content">
        <span class="card-cat" style="position:static">${esc(first.category)}</span>
        <h2><a href="article.html?slug=${encodeURIComponent(first.slug)}">${esc(first.title)}</a></h2>
        <p>${esc(first.excerpt)}</p>
        <div class="card-meta" style="color:rgba(255,255,255,.8);margin-bottom:18px">
          <span>${esc(first.author)}</span><span>·</span><span>${fmtDate(first.date)}</span><span>·</span><span>${esc(first.readTime || "")}</span>
        </div>
        <a class="btn btn-light" href="article.html?slug=${encodeURIComponent(first.slug)}">Read the Story &#8594;</a>
      </div>`;
  }
  if (featuredSide) featuredSide.innerHTML = rest.slice(0, 3).map(sideItemHTML).join("");
  if (latestGrid) latestGrid.innerHTML = rest.slice(0, 6).map(cardHTML).join("");
  initReveal();

  // topic counts
  const counts = {};
  pub.forEach(a => counts[a.category] = (counts[a.category] || 0) + 1);
  document.querySelectorAll("[data-topic-count]").forEach(el => {
    el.textContent = (counts[el.dataset.topicCount] || 0) + (counts[el.dataset.topicCount] ? "+" : "0") + " articles";
  });
}

/* ---------- Articles listing page ---------- */
async function initArticlesPage() {
  const grid = document.getElementById("articlesGrid");
  const filterBar = document.getElementById("filterBar");
  if (!grid) return;

  let articles = [];
  try { articles = await window.DropAnArticleFirebase.fetchArticles(); }
  catch { grid.innerHTML = `<p style="text-align:center;color:var(--text-muted)">Could not load articles.</p>`; return; }
  const pub = articles.filter(a => a.status !== "draft");

  const cats = ["All", ...new Set(pub.map(a => a.category))];
  if (filterBar) {
    filterBar.innerHTML = cats.map((c, i) =>
      `<button class="filter-chip${i === 0 ? " active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    filterBar.addEventListener("click", e => {
      const btn = e.target.closest(".filter-chip");
      if (!btn) return;
      filterBar.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      render(btn.dataset.cat);
    });
  }
  function render(cat) {
    const list = cat === "All" ? pub : pub.filter(a => a.category === cat);
    grid.innerHTML = list.length
      ? list.map(cardHTML).join("")
      : `<p style="grid-column:1/-1;text-align:center;color:var(--text-muted)">No articles in this category yet.</p>`;
    initReveal();
  }
  render("All");
}

/* ---------- Article reader page ---------- */
async function initReader() {
  const slug = new URLSearchParams(location.search).get("slug");
  const hero = document.getElementById("readerHero");
  const body = document.getElementById("readerBody");
  if (!hero || !body) return;

  if (!slug) {
    hero.innerHTML = `<div class="container" style="padding:80px 24px"><h1>Article slug missing</h1></div>`;
    return;
  }

  let a;
  try { a = await window.DropAnArticleFirebase.fetchArticleBySlug(slug); }
  catch { hero.innerHTML = `<div class="container" style="padding:80px 24px"><h1>Article not found</h1></div>`; return; }

  document.title = a.title + " — DropAnArticle";
  hero.innerHTML = `
    <img src="${esc(a.image)}" alt="${esc(a.title)}">
    <div class="reader-hero-content"><div class="container">
      <a class="back-link" href="articles.html" style="color:#fff;opacity:.85">&#8592; All articles</a>
      <span class="card-cat" style="position:static">${esc(a.category)}</span>
      <h1>${esc(a.title)}</h1>
      <div class="card-meta">
        <span class="card-author" style="color:#fff"><span class="avatar">${initials(a.author)}</span>${esc(a.author)}</span>
        <span>·</span><span>${fmtDate(a.date)}</span><span>·</span><span>${esc(a.readTime || "5 min read")}</span>
      </div>
    </div></div>`;
  body.innerHTML = a.content || `<p>${esc(a.excerpt)}</p>`;
  initReveal();
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
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      subject: form.subject.value.trim(),
      message: form.message.value.trim()
    };
    if (!payload.name || !payload.email || !payload.message) {
      status.className = "form-status error"; status.textContent = "Please fill in all required fields."; return;
    }
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await window.DropAnArticleFirebase.saveContactMessage(payload);
      status.className = "form-status success";
      status.textContent = "Message sent! Our editorial team will reply within 24 hours.";
      form.reset();
      toast("Message delivered successfully", "success");
    } catch (err) {
      console.error(err);
      status.className = "form-status error";
      status.textContent = "Could not send right now. Email us directly at hello@dropanarticle.com.";
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
        await window.DropAnArticleFirebase.saveContactMessage({ name: "Newsletter subscriber", email, subject: "Newsletter signup", message: "Subscribe me to the DropAnArticle digest." });
        input.value = "";
        toast("Welcome aboard! Check your inbox soon.", "success");
      } catch { toast("Subscription failed — please try again.", "error"); }
    });
  });
}

/* ---------- Admin panel ---------- */
async function initAdmin() {
  const form = document.getElementById("adminForm");
  const list = document.getElementById("adminList");
  if (!form) return;
  let articles = [];

  async function refresh() {
    try {
      articles = await window.DropAnArticleFirebase.fetchArticles();
      if (!list) return;
      list.innerHTML = articles.length ? articles.map(a => `
        <div class="admin-list-item">
          <div>
            <h4>${esc(a.title)}</h4>
            <small>${esc(a.category)} · ${fmtDate(a.date)} · by ${esc(a.author)}</small>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="badge ${a.status === "draft" ? "badge-draft" : "badge-published"}">${a.status === "draft" ? "Draft" : "Live"}</span>
            ${a.id ? `<button class="btn btn-danger btn-small" data-del="${esc(a.id)}">Delete</button>` : `<span class="badge badge-draft">local</span>`}
          </div>
        </div>`).join("") : `<p style="color:var(--text-muted)">No articles yet. Publish your first one!</p>`;
    } catch (e) {
      if (list) list.innerHTML = `<p style="color:var(--text-muted)">Connect Firestore (see README) to manage articles here. Local demo mode active.</p>`;
    }
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const statusEl = document.getElementById("adminStatus");
    const payload = {
      slug: form.slug.value.trim() || form.title.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      title: form.title.value.trim(),
      category: form.category.value.trim(),
      author: form.author.value.trim(),
      date: form.date.value || new Date().toISOString().slice(0, 10),
      readTime: form.readTime.value.trim() || "5 min read",
      image: form.image.value.trim(),
      excerpt: form.excerpt.value.trim(),
      content: form.content.value,
      status: form.status.value
    };
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "Publishing…";
    try {
      await window.DropAnArticleFirebase.saveArticle(payload);
      statusEl.className = "form-status success";
      statusEl.textContent = `Article "${payload.title}" published to Firestore.`;
      form.reset();
      toast("Article published!", "success");
      refresh();
    } catch (err) {
      console.error(err);
      statusEl.className = "form-status error";
      statusEl.textContent = "Firestore write failed. Enable it in Firebase Console → Firestore Database.";
      toast("Publish failed", "error");
    }
    btn.disabled = false; btn.textContent = "Publish Article";
  });

  if (list) list.addEventListener("click", async e => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    if (!confirm("Delete this article permanently?")) return;
    try {
      await window.DropAnArticleFirebase.removeArticle(btn.dataset.del);
      toast("Article deleted", "success");
      refresh();
    } catch { toast("Delete failed", "error"); }
  });

  refresh();
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
});
