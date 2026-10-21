/* TravelStory Hub — Editorial Studio. Uses window.DropAnArticleFirebase (firebase.js) and helpers from main.js. */
(() => {
"use strict";
const FB = window.DropAnArticleFirebase;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
// The public reader's sanitizeArticleHTML() keeps only H2–H4. Add "h5","h6" here only after allowing them there.
const HEADINGS = ["h2", "h3", "h4"];
const DRAFT_KEY = "travelstory-admin-draft-v3";
const FIELDS = ["title", "slug", "excerpt", "status", "date", "category", "tags", "author", "authorWebsite", "readTime", "image", "imageAlt", "metaTitle", "metaDescription"];
const S = { view: "", user: null, profile: null, id: null, loadedMs: 0, orig: "draft", featured: false, dirty: false, loading: false, saving: false, editor: null, editorP: null, page: 0, cursors: [null], res: null, sel: new Set(), cats: [] };
const form = $("#articleForm");
const val = n => form.elements[n].value, setVal = (n, v) => { form.elements[n].value = v ?? ""; };
const ms = t => t?.toMillis?.() ?? 0;
const dt = t => t?.toDate ? fmtDate(t.toDate()) : "—";
const base = () => String(window.TRAVELSTORY_CONFIG?.canonicalBaseUrl || location.origin).replace(/\/$/, "");
const fail = (e, fallback) => toast(e?.message || fallback, "error");
const skel = el => { el.innerHTML = '<div class="skel"></div>'.repeat(4); };
const empty = (el, t, d = "") => { el.innerHTML = `<div class="empty"><strong>${esc(t)}</strong><p>${esc(d)}</p></div>`; };
const leaveOk = () => !S.dirty || confirm("You have unsaved changes. Leave without saving?");

/* ---------- navigation ---------- */
function go(view) {
  if (S.view === "editor" && view !== "editor" && !leaveOk()) return;
  S.view = view;
  $$("[data-view]").forEach(s => { s.hidden = s.dataset.view !== view; });
  $$("#side [data-go]").forEach(b => b.setAttribute("aria-current", b.dataset.go === view ? "page" : "false"));
  $("#side").classList.remove("open");
  history.replaceState(null, "", "#" + view);
  ({ dashboard: loadDashboard, articles: loadArticles, categories: loadCats, submissions: loadSubs, editor: () => ensureEditor() })[view]?.();
}
async function newArticle() { if (S.view === "editor" && !leaveOk()) return; go("editor"); await fill(null); await restoreLocal(); }
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if (g && g.id !== "navNew") go(g.dataset.go);
  if (e.target.closest("[data-new]") || e.target.closest("#navNew")) { e.preventDefault(); newArticle(); }
});
$("#burger").onclick = () => $("#side").classList.toggle("open");
$("#collapse").onclick = () => { const c = $("#app").classList.toggle("collapsed"); try { localStorage.setItem("adm-collapsed", c ? "1" : ""); } catch {} };
try { if (localStorage.getItem("adm-collapsed")) $("#app").classList.add("collapsed"); } catch {}
$("#gSearch").addEventListener("keydown", e => { if (e.key === "Enter") { $("#fSearch").value = e.target.value; S.page = 0; S.cursors = [null]; go("articles"); } });
window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && S.view === "editor") { e.preventDefault(); save(); } });

/* ---------- auth ---------- */
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); const m = $("#gateMsg"), b = e.submitter; b.disabled = true; m.textContent = "Signing in…";
  try { await FB.signInEditor($("#email").value.trim(), $("#pw").value); } catch (err) { m.textContent = err?.message || "Sign-in failed."; }
  b.disabled = false;
});
const signOut = async () => { if (!leaveOk()) return; S.dirty = false; try { await FB.signOutEditor(); } catch (e) { fail(e, "Could not sign out"); } };
$("#out").onclick = $("#gateOut").onclick = signOut;
FB.watchEditorAuth(async u => {
  S.user = u; const m = $("#gateMsg");
  if (!u) { $("#app").hidden = true; $("#gate").hidden = false; $("#gateOut").hidden = true; return; }
  try {
    const p = await FB.getEditorProfile(u.uid);
    if (!p || !["admin", "editor"].includes(p.role)) throw new Error(`No editor role. Create Firestore users/${u.uid} with role "editor" or "admin".`);
    S.profile = p; $("#who").textContent = `${u.email} · ${p.role}`;
    await FB.seedDefaultCategories(); await fillCats();
    $("#gate").hidden = true; $("#app").hidden = false;
    const h = location.hash.slice(1); go(["dashboard", "articles", "categories", "submissions"].includes(h) ? h : "dashboard");
  } catch (err) { m.textContent = err?.message || "Could not verify permissions."; $("#gateOut").hidden = false; $("#app").hidden = true; $("#gate").hidden = false; }
}).catch(e => { $("#gateMsg").textContent = "Firebase Authentication could not start."; console.error(e); });

/* ---------- dashboard ---------- */
async function loadDashboard() {
  skel($("#recentU")); skel($("#recentP")); $("#stats").innerHTML = "";
  try {
    const [st, ru, rp] = await Promise.all([FB.getAdminStats(), FB.fetchAdminArticlePage({ pageSize: 5 }), FB.fetchAdminArticlePage({ pageSize: 5, status: "published" })]);
    const arch = Math.max(0, st.articles - st.published - st.drafts);
    $("#stats").innerHTML = [["Total articles", st.articles], ["Published", st.published], ["Drafts", st.drafts], ["Archived", arch], ["Pending submissions", st.pending], ["Categories", st.categories]].map(([l, n]) => `<div class="card stat"><span>${l}</span><strong>${n}</strong></div>`).join("");
    const parts = [["Published", st.published, "#16a34a"], ["Draft", st.drafts, "#d97706"], ["Archived", arch, "#64748b"]], tot = st.articles || 1;
    $("#dist").innerHTML = parts.map(([l, n, c]) => `<i title="${l}: ${n}" style="width:${n / tot * 100}%;background:${c}"></i>`).join("");
    $("#distLegend").textContent = parts.map(([l, n]) => `${l} ${n}`).join(" · ");
    const list = (r, el) => { el.innerHTML = r.items.length ? r.items.map(a => `<div class="mini"><button data-edit="${esc(a.id)}">${esc(a.title)}</button><span class="muted">${dt(a.updatedAt)}</span></div>`).join("") : '<p class="muted">Nothing yet.</p>'; };
    list(ru, $("#recentU")); list(rp, $("#recentP"));
  } catch (e) { empty($("#recentU"), "Could not load dashboard", e?.message); empty($("#recentP"), "—"); }
}
document.addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) editArticle(b.dataset.edit); });

/* ---------- article table ---------- */
async function loadArticles() {
  const body = $("#rows"); body.innerHTML = `<tr><td colspan="8">${'<div class="skel"></div>'.repeat(3)}</td></tr>`;
  try {
    const r = await FB.fetchAdminArticlePage({ pageSize: +$("#pageSize").value, cursor: S.cursors[S.page] || null, status: $("#fStatus").value, searchTerm: $("#fSearch").value.trim() });
    S.res = r; S.sel.clear(); renderRows();
    $("#pageLbl").textContent = `Page ${S.page + 1}`; $("#prev").disabled = S.page === 0; $("#next").disabled = !r.hasMore;
  } catch (e) { body.innerHTML = `<tr><td colspan="8"><div class="empty"><strong>Articles could not be loaded</strong><p>${esc(e?.message || "")}</p></div></td></tr>`; }
}
function renderRows() {
  const items = [...(S.res?.items || [])], k = $("#sortBy").value;
  if (k) items.sort((a, b) => k === "title" ? String(a.title).localeCompare(b.title) : k === "date" ? String(b.date).localeCompare(String(a.date)) : String(a.status).localeCompare(b.status));
  $("#rows").innerHTML = items.length ? items.map(a => {
    const img = safeHttpUrl(a.image), s = a.status || "draft";
    return `<tr data-id="${esc(a.id)}"><td><input type="checkbox" data-sel aria-label="Select ${esc(a.title)}"${S.sel.has(a.id) ? " checked" : ""}></td>
    <td><div class="t">${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : '<span class="thumb"></span>'}<div><strong>${esc(a.title)}</strong><small>/${esc(a.slug)}</small></div></div></td>
    <td>${esc(a.category || "—")}</td><td>${esc(a.author || "—")}</td><td><span class="adm-badge ${esc(s)}">${esc(s)}</span></td><td>${esc(a.date || "—")}</td><td>${dt(a.updatedAt)}</td>
    <td class="acts"><button class="ab s" data-act="edit">Edit</button><button class="ab s" data-act="preview">Preview</button><button class="ab s" data-act="dup">Duplicate</button>${s === "published" ? `<a class="ab s" href="${esc(articleHref(a.slug))}" target="_blank" rel="noopener">View ↗</a>` : ""}<button class="ab s d" data-act="del">Delete</button></td></tr>`;
  }).join("") : `<tr><td colspan="8"><div class="empty"><strong>No articles found</strong><p>Change the filters or write a new article.</p></div></td></tr>`;
  $("#bulk").hidden = !S.sel.size; $("#bulkN").textContent = `${S.sel.size} selected`; $("#selAll").checked = items.length > 0 && S.sel.size === items.length;
}
$("#rows").addEventListener("click", async e => {
  const tr = e.target.closest("tr[data-id]"); if (!tr) return; const id = tr.dataset.id;
  if (e.target.matches("[data-sel]")) { e.target.checked ? S.sel.add(id) : S.sel.delete(id); renderRows(); return; }
  const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return;
  try {
    if (act === "edit") await editArticle(id);
    if (act === "preview") { const a = await FB.fetchAdminArticleById(id); if (a) showPreview(a); }
    if (act === "dup") await duplicate(id);
    if (act === "del" && confirm("Permanently delete this article? This cannot be undone.")) { await FB.removeArticle(id); toast("Article deleted", "success"); loadArticles(); }
  } catch (err) { fail(err, "Action failed"); }
});
$("#selAll").onchange = e => { S.sel = new Set(e.target.checked ? S.res.items.map(a => a.id) : []); renderRows(); };
$("#bulk").addEventListener("click", async e => {
  const act = e.target.closest("[data-bulk]")?.dataset.bulk, ids = [...S.sel]; if (!act || !ids.length) return;
  if (!confirm(`${act === "delete" ? "Permanently delete" : "Set to " + act} ${ids.length} article(s)?`)) return;
  const r = await Promise.allSettled(ids.map(id => act === "delete" ? FB.removeArticle(id) : FB.updateArticle(id, { status: act })));
  const ok = r.filter(x => x.status === "fulfilled").length; toast(`${ok} of ${ids.length} updated`, ok === ids.length ? "success" : "error"); loadArticles();
});
const reset = () => { S.page = 0; S.cursors = [null]; loadArticles(); };
$("#fSearch").addEventListener("input", debounce(reset, 450)); $("#fStatus").onchange = $("#pageSize").onchange = reset; $("#sortBy").onchange = renderRows;
$("#prev").onclick = () => { if (S.page > 0) { S.page--; loadArticles(); } };
$("#next").onclick = () => { if (S.res?.hasMore) { S.cursors[S.page + 1] = S.res.nextCursor; S.page++; loadArticles(); } };
async function duplicate(id) {
  const a = await FB.fetchAdminArticleById(id); if (!a) throw new Error("Article not found.");
  for (let i = 1; i <= 6; i++) {
    try {
      const ref = await FB.saveArticle({ ...a, title: `${a.title} (Copy)`.slice(0, 140), slug: `${a.slug}-copy${i > 1 ? "-" + i : ""}`, status: "draft", featured: false }, null);
      toast("Duplicated as a draft", "success"); loadArticles(); return ref;
    } catch (e) { if (!/slug/i.test(e?.message || "")) throw e; }
  }
  throw new Error("Could not find a free slug for the copy.");
}

/* ---------- TinyMCE ---------- */
function ensureEditor() {
  return S.editorP ||= (async () => {
    const ready = await (window.TinyMCEReady || { loaded: !!window.tinymce });
    const mark = () => { if (!S.loading) { setDirty(true); analyze(); saveLocal(); } };
    if (!ready.loaded || !window.tinymce) {
      const ta = $("#content"); $("#edNote").textContent = "TinyMCE is unavailable (check tinyMceApiKey in js/site-config.js and your approved domain). Editing raw HTML instead.";
      return S.editor = { getContent: o => o?.format === "text" ? ta.value.replace(/<[^>]+>/g, " ") : ta.value, setContent: v => { ta.value = v; }, getBody: () => null };
    }
    const dark = document.documentElement.dataset.theme === "dark", hs = HEADINGS.join(",");
    await tinymce.init({
      target: $("#content"), height: 560, min_height: 380, promotion: false, branding: false, toolbar_mode: "sliding", browser_spellcheck: true,
      skin: dark ? "oxide-dark" : "oxide", content_css: dark ? "dark" : "default",
      menubar: "edit view insert format table tools",
      plugins: "autolink charmap code fullscreen image link lists preview searchreplace table visualblocks wordcount help",
      toolbar: "undo redo | blocks | bold italic underline strikethrough | bullist numlist blockquote hr | link unlink image table | charmap searchreplace | removeformat | visualblocks code preview fullscreen",
      block_formats: "Paragraph=p;" + HEADINGS.map(h => `Heading ${h[1]}=${h}`).join(";") + ";Preformatted=pre",
      // Mirrors the public sanitizer's allow-list so what you see is what readers get.
      valid_elements: `p,${hs},ul,ol,li,blockquote,a[href|title|target|rel],img[src|alt|title|width|height],figure,figcaption,strong/b,em/i,u,s/strike,hr,table,thead,tbody,tr,th,td,br,pre,code`,
      automatic_uploads: true, paste_data_images: false, image_caption: true, image_advtab: false, image_description: true, image_dimensions: true,
      link_default_protocol: "https", link_title: false, target_list: [{ title: "Same tab", value: "" }, { title: "New tab", value: "_blank" }],
      table_appearance_options: false, table_advtab: false, table_cell_advtab: false, table_row_advtab: false, table_default_styles: {}, table_default_attributes: {},
      content_style: "body{font:16px/1.8 system-ui,sans-serif;max-width:860px;margin:18px auto;padding:0 16px}img{max-width:100%;height:auto}blockquote{border-left:4px solid #167c72;padding-left:16px;color:#627176}",
      images_upload_handler: (b, progress) => FB.uploadArticleImage(b.blob(), progress).catch(e => { throw { message: e?.message || "Image upload failed." }; }),
      setup: ed => ed.on("input change undo redo keyup", mark)
    });
    return S.editor = tinymce.get("content");
  })();
}

/* ---------- editor state ---------- */
function setDirty(v) { S.dirty = v; $("#saveState").textContent = v ? "● Unsaved changes" : S.id ? `✓ Saved · ${S.orig}` : "New article"; }
async function fill(a) {
  await ensureEditor(); S.loading = true;
  const d = { status: "draft", date: new Date().toISOString().slice(0, 10), author: S.profile?.name || S.user?.displayName || "TravelStory Editorial Team", category: S.cats[0]?.name || "", ...(a || {}), tags: (a?.tags || []).join(", ") };
  if (d.category && ![...form.elements.category.options].some(o => o.value === d.category)) form.elements.category.add(new Option(d.category, d.category));
  FIELDS.forEach(n => setVal(n, d[n]));
  S.editor.setContent(a?.content || ""); S.editor.undoManager?.clear();
  S.id = a?.id || null; S.loadedMs = ms(a?.updatedAt); S.orig = a?.status || "draft"; S.featured = a?.featured === true;
  form.elements.slug.dataset.manual = a ? "1" : ""; $("#focusKw").value = "";
  $("#edHead").textContent = a ? "Edit article" : "New article"; imgPreview(); setDirty(false); analyze();
  setTimeout(() => { S.loading = false; setDirty(false); }, 60);
}
async function editArticle(id) {
  if (S.view === "editor" && !leaveOk()) return;
  const a = await FB.fetchAdminArticleById(id); if (!a) return toast("Article not found", "error");
  go("editor"); await fill(a);
}
const saveLocal = debounce(() => {
  if (S.id || S.loading) return;
  try { const d = {}; FIELDS.forEach(n => d[n] = val(n)); d.content = S.editor.getContent(); localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); $("#saveState").textContent = "● Unsaved · local copy kept"; } catch {}
}, 900);
async function restoreLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (d && (d.title || d.content) && confirm("Restore the unsaved draft kept on this device?")) {
      S.loading = true; FIELDS.forEach(n => d[n] != null && setVal(n, d[n])); S.editor.setContent(d.content || ""); setTimeout(() => { S.loading = false; setDirty(true); analyze(); }, 60);
    }
  } catch {}
}
form.addEventListener("input", e => {
  if (S.loading) return;
  if (e.target === form.elements.slug) form.elements.slug.dataset.manual = "1";
  if (e.target === form.elements.title && !S.id && !form.elements.slug.dataset.manual) form.elements.slug.value = slugify(form.elements.title.value);
  if (e.target.id === "image" || e.target.id === "imageAlt") imgPreview();
  setDirty(true); analyze(); saveLocal();
});
$("#focusKw").addEventListener("input", () => analyze());

/* ---------- save ---------- */
form.addEventListener("submit", e => { e.preventDefault(); save(); });
async function save() {
  if (S.saving) return; await ensureEditor();
  const content = sanitizeArticleHTML(S.editor.getContent());
  const p = { title: val("title").trim(), slug: slugify(val("slug") || val("title")), excerpt: val("excerpt").trim(), content, status: val("status"), date: val("date"), category: val("category"), tags: val("tags"), author: val("author").trim(), authorWebsite: val("authorWebsite").trim(), readTime: val("readTime").trim(), image: val("image").trim(), imageAlt: val("imageAlt").trim(), metaTitle: val("metaTitle").trim() || val("title").trim(), metaDescription: val("metaDescription").trim() || val("excerpt").trim(), featured: S.featured };
  if (!p.category) return toast("Choose a category.", "error");
  if (!p.author) return toast("Add an author name.", "error");
  if (p.authorWebsite && !safeHttpUrl(p.authorWebsite)) return toast("Author website must be a valid http(s) URL.", "error");
  if (p.image && !safeHttpUrl(p.image)) return toast("Cover image must be a valid http(s) URL.", "error");
  if (p.status === "published" && S.orig !== "published" && !confirm("Publish this article on the public website?")) return;
  if (S.orig === "published" && p.status !== "published" && !confirm("This removes the article from the public website. Continue?")) return;
  const btn = $("#saveBtn"); S.saving = true; btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (S.id) {
      const cur = await FB.fetchAdminArticleById(S.id);
      if (!cur) throw new Error("This article was deleted elsewhere. Copy your text and create a new article.");
      if (ms(cur.updatedAt) > S.loadedMs && !confirm("A newer version of this article was saved elsewhere. Overwrite it with your version?")) return;
    }
    const ref = await FB.saveArticle(p, S.id);       // validates lengths + slug uniqueness; keeps previousSlugs/searchTerms
    S.id = ref.id; S.orig = p.status; S.loadedMs = ms((await FB.fetchAdminArticleById(S.id))?.updatedAt);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    $("#edHead").textContent = "Edit article"; setDirty(false);
    toast(p.status === "published" ? "Article published" : `Saved as ${p.status}`, "success");
  } catch (err) { console.error(err); fail(err, "Article could not be saved."); }
  finally { S.saving = false; btn.disabled = false; btn.textContent = "Save"; }
}

/* ---------- cover image ---------- */
function imgPreview() {
  const u = safeHttpUrl(val("image")), im = $("#imgPrev"); im.hidden = !u; $("#imgInfo").textContent = "";
  if (u) { im.alt = val("imageAlt"); im.onload = () => { $("#imgInfo").textContent = `${im.naturalWidth}×${im.naturalHeight}px`; }; im.src = u; }
}
$("#imgFile").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  if (val("image") && !confirm("Replace the current cover image?")) return;
  const pr = $("#imgProg"); pr.hidden = false; pr.value = 0;
  try { setVal("image", await FB.uploadArticleImage(f, n => { pr.value = n; })); setDirty(true); imgPreview(); analyze(); toast("Image uploaded", "success"); }
  catch (err) { fail(err, "Upload failed"); } finally { pr.hidden = true; }
};
$("#imgRm").onclick = () => { if (val("image") && confirm("Remove the cover image from this article?")) { setVal("image", ""); setVal("imageAlt", ""); setDirty(true); imgPreview(); analyze(); } };

/* ---------- SEO + structure analysis ---------- */
function analyze() {
  if (!S.editor) return;
  const d = new DOMParser().parseFromString(S.editor.getContent(), "text/html"), hs = [...d.body.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  const text = d.body.textContent.replace(/\s+/g, " ").trim(), words = text ? text.split(" ").length : 0;
  const title = val("metaTitle") || val("title"), desc = val("metaDescription") || val("excerpt"), slug = val("slug");
  const publicUrl = typeof articleCanonicalUrl === "function" ? articleCanonicalUrl(slug) : `${base()}/story/${encodeURIComponent(slug)}`;
  $("#serp").innerHTML = `<b>${esc(title.slice(0, 60) || "Untitled")}${title.length > 60 ? "…" : ""}</b><i>${esc(publicUrl)}</i><span>${esc(desc.slice(0, 160)) || "No description."}${desc.length > 160 ? "…" : ""}</span>`;
  $("#mtN").textContent = `${title.length}/60`; $("#mdN").textContent = `${desc.length}/160`; $("#exN").textContent = `${val("excerpt").length}/500`;
  const c = []; const add = (k, m) => c.push(`<li class="${k}">${esc(m)}</li>`);
  title.length > 60 ? add("w", "SEO title may be truncated in results (over ~60 characters).") : title.length < 20 ? add("w", "SEO title is short.") : add("", "SEO title length looks reasonable.");
  !val("metaTitle") && add("i", "SEO title empty — the article title is used.");
  !desc ? add("w", "No meta description.") : desc.length > 160 ? add("w", "Meta description may be truncated (over ~160).") : desc.length < 70 ? add("w", "Meta description is short.") : add("", "Meta description length looks reasonable.");
  !val("metaDescription") && add("i", "Meta description empty — the summary is used.");
  const h1 = hs.filter(h => h.tagName === "H1").length; h1 ? add("w", `Body contains ${h1} H1 — the article title is already the page H1.`) : add("", "No duplicate H1 in the body.");
  if (!hs.length && words > 300) add("w", "No headings. Add H2/H3 sections to structure the article.");
  let prev = 1, skipped = 0; hs.forEach(h => { const l = +h.tagName[1]; if (l > prev + 1) skipped++; prev = l; }); skipped && add("w", `${skipped} skipped heading level(s), e.g. H2 → H4.`);
  const imgs = [...d.body.querySelectorAll("img")], noAlt = imgs.filter(i => !i.getAttribute("alt")).length;
  noAlt ? add("w", `${noAlt} image(s) in the body have no alt text.`) : imgs.length && add("", "All body images have alt text.");
  if (val("image") && !val("imageAlt")) add("w", "Cover image has no alt text.");
  const links = [...d.body.querySelectorAll("a[href]")], ext = links.filter(a => { try { return new URL(a.getAttribute("href"), location.href).origin !== location.origin; } catch { return false; } }).length;
  add("i", `${words} words · ~${Math.max(1, Math.ceil(words / 220))} min read · ${links.length - ext} internal / ${ext} external links`);
  const sentences = text.split(/[.!?]+\s/).filter(Boolean).length || 1; words / sentences > 24 && add("w", "Long sentences on average (>24 words) — consider shortening.");
  const kw = $("#focusKw").value.trim().toLowerCase();
  if (kw) { const has = s => String(s).toLowerCase().includes(kw); add(has(val("title")) ? "" : "w", has(val("title")) ? "Keyword is in the title." : "Keyword is not in the title."); add(has(slug.replace(/-/g, " ")) ? "" : "w", has(slug.replace(/-/g, " ")) ? "Keyword is in the slug." : "Keyword is not in the slug."); add(has(desc) ? "" : "w", has(desc) ? "Keyword is in the description." : "Keyword is not in the description."); }
  $("#checks").innerHTML = c.join("") + '<li class="i">Guidance only — not a ranking prediction.</li>';
  $("#outline").innerHTML = hs.length ? hs.map((h, i) => `<button type="button" data-h="${i}" style="padding-left:${(+h.tagName[1] - 1) * 12}px"><b>${h.tagName}</b>${esc(h.textContent.trim().slice(0, 70))}</button>`).join("") : '<p class="muted">No headings yet.</p>';
}
$("#outline").addEventListener("click", e => {
  const i = e.target.closest("[data-h]")?.dataset.h, body = S.editor?.getBody?.(); if (i == null || !body) return;
  const el = body.querySelectorAll("h1,h2,h3,h4,h5,h6")[i]; if (!el) return;
  S.editor.focus(); S.editor.selection.setCursorLocation(el, 0); el.scrollIntoView({ block: "center", behavior: "smooth" });
});

/* ---------- preview ---------- */
function showPreview(a) {
  const img = safeHttpUrl(a.image);
  $("#pvBody").innerHTML = `${img ? `<img src="${esc(img)}" alt="${esc(a.imageAlt || a.title)}">` : ""}<h1>${esc(a.title)}</h1><p class="muted">${esc(a.category || "")} · ${esc(a.author || "")} · ${esc(a.date || "")}</p><p><em>${esc(a.excerpt || "")}</em></p>${sanitizeArticleHTML(a.content || "")}`;
  $("#preview").showModal();
}
$("#pvBtn").onclick = async () => { await ensureEditor(); showPreview({ title: val("title"), excerpt: val("excerpt"), category: val("category"), author: val("author"), date: val("date"), image: val("image"), imageAlt: val("imageAlt"), content: S.editor.getContent() }); };
$("#pvClose").onclick = () => $("#preview").close();

/* ---------- categories ---------- */
async function fillCats() {
  S.cats = await FB.fetchCategories(); const sel = form.elements.category, cur = sel.value;
  sel.innerHTML = S.cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join(""); if (cur) sel.value = cur;
}
async function loadCats() {
  const el = $("#cats"); skel(el);
  try {
    await fillCats(); const { db, collection, query, where, getCountFromServer } = await FB.initFirebase();
    const counts = await Promise.all(S.cats.map(c => getCountFromServer(query(collection(db, FB.ARTICLES_COLLECTION), where("category", "==", c.name))).then(r => r.data().count).catch(() => null)));
    el.innerHTML = S.cats.map((c, i) => `<div class="card"><strong>${esc(c.name)}</strong><p class="muted">${esc(c.description || "")}</p><p class="muted">${counts[i] ?? "?"} article(s) · /${esc(c.slug || c.id)}</p>${c.isDefault ? '<small class="muted">Starter category</small>' : `<button class="ab s d" data-delcat="${esc(c.id)}" data-name="${esc(c.name)}" data-n="${counts[i] ?? 0}">Delete</button>`}</div>`).join("");
  } catch (e) { empty(el, "Categories could not be loaded", e?.message); }
}
$("#cats").addEventListener("click", async e => {
  const b = e.target.closest("[data-delcat]"); if (!b) return;
  if (+b.dataset.n > 0) return toast(`“${b.dataset.name}” is used by ${b.dataset.n} article(s). Reassign them first.`, "error");
  if (!confirm("Delete this category?")) return;
  try { await FB.removeCategory(b.dataset.delcat); toast("Category deleted", "success"); loadCats(); } catch (err) { fail(err, "Could not delete"); }
});
$("#catForm").addEventListener("submit", async e => {
  e.preventDefault(); const b = e.submitter; b.disabled = true;
  try { await FB.saveCategory({ name: $("#catName").value, description: $("#catDesc").value }); e.target.reset(); toast("Category added", "success"); loadCats(); } catch (err) { fail(err, "Could not add category"); }
  b.disabled = false;
});

/* ---------- contributor submissions ---------- */
async function loadSubs() {
  const el = $("#subs"); skel(el);
  try {
    const list = (await FB.fetchSubmissions()).filter(s => ["pending", "changes_requested", "approved"].includes(s.status));
    if (!list.length) return empty(el, "All caught up", "New contributor submissions appear here.");
    el.innerHTML = list.map(s => `<article class="card sub" data-id="${esc(s.id)}"><span class="adm-badge ${s.status === "changes_requested" ? "draft" : "pending"}">${esc(s.status)}</span> <span class="muted">${dt(s.createdAt)}</span><h3>${esc(s.title)}</h3><p class="muted">${esc(s.excerpt || "")}</p><p><strong>${esc(s.author || "Unknown")}</strong> · ${esc(s.category || "")} · ${esc(s.email || "")}</p><details><summary>Read submission</summary><div class="prose">${sanitizeArticleHTML(s.content || "")}</div></details>${s.editorialNotes ? `<p class="muted"><b>Note:</b> ${esc(s.editorialNotes)}</p>` : ""}<div class="acts"><button class="ab s p" data-sa="publish">Approve & publish</button><button class="ab s" data-sa="changes">Request changes</button><button class="ab s d" data-sa="reject">Reject</button></div></article>`).join("");
  } catch (e) { empty(el, "Submissions could not be loaded", e?.message); }
}
$("#subRefresh").onclick = loadSubs;
$("#subs").addEventListener("click", async e => {
  const a = e.target.closest("[data-sa]")?.dataset.sa, id = e.target.closest("[data-id]")?.dataset.id; if (!a) return;
  try {
    if (a === "publish") { if (!confirm("Publish this article? Check originality, facts, links and image rights first.")) return; e.target.disabled = true; await FB.publishSubmission(id); toast("Submission published", "success"); }
    else { const n = prompt(a === "changes" ? "What should the contributor revise?" : "Internal reason (optional):", ""); if (n === null) return; await FB.updateSubmissionStatus(id, a === "changes" ? "changes_requested" : "rejected", n); toast("Saved", "success"); }
    loadSubs();
  } catch (err) { fail(err, "Action failed"); loadSubs(); }
});
})();
