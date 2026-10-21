const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const sanitizeHtml = require('sanitize-html');

initializeApp();
const db = getFirestore();
const BRAND = 'TravelStory Hub';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}
function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch (_) { return ''; }
}
function canonicalOrigin(req) {
  const host = String(req.get('host') || 'dropanarticle.web.app').replace(/[^a-zA-Z0-9.:-]/g, '');
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  return `${localHost && req.protocol === 'http' ? 'http' : 'https'}://${host}`;
}
function formatDate(value) {
  let date;
  if (value && typeof value.toDate === 'function') date = value.toDate();
  else if (value) date = new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
function isoDate(value) {
  let date;
  if (value && typeof value.toDate === 'function') date = value.toDate();
  else if (value) date = new Date(value);
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
function readingTime(article) {
  if (article.readTime) return String(article.readTime);
  const plain = String(article.content || '').replace(/<[^>]*>/g, ' ');
  return `${Math.max(1, Math.ceil(plain.split(/\s+/).filter(Boolean).length / 220))} min read`;
}
function sanitizeArticleBody(value, origin) {
  const clean = sanitizeHtml(String(value || ''), {
    allowedTags: [
      'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure',
      'figcaption', 'strong', 'b', 'em', 'i', 'u', 's', 'hr', 'table', 'thead',
      'tbody', 'tr', 'th', 'td', 'br', 'pre', 'code'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attrs) => {
        const transformed = { ...attrs };
        if (transformed.href) {
          try {
            const parsed = new URL(transformed.href, origin);
            if (['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== origin) {
              const sourceRel = String(transformed.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
              transformed.rel = [...new Set([...(sourceRel.includes('sponsored') ? ['sponsored'] : ['ugc']), 'nofollow', 'noopener', 'noreferrer'])].join(' ');
              transformed.target = '_blank';
            } else {
              delete transformed.rel;
              if (parsed.protocol === 'mailto:') delete transformed.target;
              else if (transformed.target === '_blank') transformed.rel = 'noopener noreferrer';
            }
          } catch (_) { delete transformed.href; }
        }
        return { tagName: 'a', attribs: transformed };
      },
      img: (tagName, attrs) => ({
        tagName: 'img',
        attribs: { ...attrs, loading: 'lazy', decoding: 'async' }
      })
    }
  });
  return clean;
}
function safeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
function nav(origin) {
  return `<header class="navbar"><div class="container navbar-inner">
    <a href="/" class="logo"><span class="logo-mark">✦</span>TravelStory <em>Hub</em></a>
    <ul class="nav-links" id="navLinks"><li><a href="/">Home</a></li><li><a href="/articles.html">Articles</a></li><li><a href="/about.html">About</a></li><li><a href="/contact.html">Contact</a></li></ul>
    <div class="nav-actions"><button class="theme-toggle" aria-label="Toggle dark mode">☾</button><a href="/submit.html" class="btn btn-primary nav-submit">✦ Submit Story</a><button class="hamburger" id="hamburger" aria-label="Menu">☰</button></div>
  </div></header>`;
}
function footer() {
  return `<footer class="footer"><div class="container"><div class="footer-grid">
    <div><a href="/" class="logo"><span class="logo-mark">✦</span>TravelStory <em>Hub</em></a><p>A travel publishing community for destination guides, local expertise, and stories that help people travel better.</p></div>
    <div><h4>Explore</h4><ul><li><a href="/articles.html">Travel articles</a></li><li><a href="/about.html">About us</a></li><li><a href="/submit.html">Submit a story</a></li></ul></div>
    <div><h4>Editorial</h4><ul><li><a href="/about.html#editorial-standards">Editorial standards</a></li><li><a href="/contact.html">Contact the editors</a></li></ul></div>
    <div><h4>Discover</h4><ul><li><a href="/articles.html">Destination guides</a></li><li><a href="/articles.html">Travel tips</a></li><li><a href="/articles.html">Responsible tourism</a></li></ul></div>
  </div><div class="footer-bottom"><span>© ${new Date().getUTCFullYear()} TravelStory Hub. All rights reserved.</span><span>Useful travel knowledge, reviewed by humans.</span></div></div></footer>`;
}
function relatedCard(article) {
  const href = `/story/${encodeURIComponent(article.slug || '')}`;
  const image = safeHttpUrl(article.image);
  return `<article class="article-card reveal"><a class="card-image" href="${href}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="lazy">` : ''}<span class="card-cat">${escapeHtml(article.category || 'Travel')}</span></a><div class="card-body"><div class="card-meta"><span>${escapeHtml(formatDate(article.date))}</span><span>·</span><span>${escapeHtml(readingTime(article))}</span></div><h3 class="card-title"><a href="${href}">${escapeHtml(article.title)}</a></h3><p class="card-excerpt">${escapeHtml(article.excerpt || '')}</p></div></article>`;
}
function articlePage(article, related, origin, slug) {
  const title = String(article.metaTitle || article.title || BRAND).slice(0, 70);
  const description = String(article.metaDescription || article.excerpt || '').slice(0, 170);
  const canonical = `${origin}/story/${encodeURIComponent(slug)}`;
  const cover = safeHttpUrl(article.image);
  const publishDate = isoDate(article.publishedAt) || isoDate(article.date) || new Date().toISOString();
  const modifiedDate = isoDate(article.updatedAt) || publishDate;
  const body = sanitizeArticleBody(article.content || `<p>${escapeHtml(article.excerpt || '')}</p>`, origin);
  const tags = Array.isArray(article.tags) ? article.tags.filter(Boolean).slice(0, 15) : [];
  const schema = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: String(article.title || ''), description,
    datePublished: publishDate, dateModified: modifiedDate, mainEntityOfPage: canonical,
    author: { '@type': 'Person', name: String(article.author || 'TravelStory Hub Contributor') },
    publisher: { '@type': 'Organization', name: BRAND, url: origin },
    ...(cover ? { image: [cover] } : {}), articleSection: String(article.category || 'Travel'),
    ...(tags.length ? { keywords: tags.join(', ') } : {})
  };
  return `<!DOCTYPE html>
<html lang="en" data-theme="light"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${BRAND}</title><meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:site_name" content="${BRAND}"><meta property="og:title" content="${escapeHtml(article.title || '')}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">
${cover ? `<meta property="og:image" content="${escapeHtml(cover)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${escapeHtml(article.title || '')}"><meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="icon" type="image/svg+xml" href="/images/favicon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/style.css">
<script type="application/ld+json">${safeJsonLd(schema)}</script>
</head><body data-server-rendered-article="true">
${nav(origin)}
<section class="reader-hero" id="readerHero">${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(article.imageAlt || article.title)}" fetchpriority="high">` : ''}<div class="reader-hero-content"><div class="container"><a class="back-link" href="/articles.html">← All articles</a><span class="card-cat" style="position:static">${escapeHtml(article.category || 'Travel')}</span><h1>${escapeHtml(article.title || '')}</h1><p class="reader-deck">${escapeHtml(article.excerpt || '')}</p><div class="card-meta"><span class="card-author"><span class="avatar">${escapeHtml(String(article.author || 'TS').split(/\s+/).map(part => part[0] || '').slice(0, 2).join('').toUpperCase())}</span>${escapeHtml(article.author || BRAND)}</span><span>·</span><time datetime="${escapeHtml(publishDate)}">${escapeHtml(formatDate(article.date || article.publishedAt))}</time><span>·</span><span>${escapeHtml(readingTime(article))}</span></div></div></div></section>
<article class="reader-body" id="readerBody"><div class="article-reading-note">A TravelStory Hub guide · Reviewed for usefulness and clarity</div>${body}${tags.length ? `<div class="article-tags">${tags.map(tag => `<span class="article-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}<div class="article-share-tools"><span>Share this story</span><button type="button" class="btn btn-outline btn-small" id="copyStoryLink" data-url="${escapeHtml(canonical)}">Copy link</button><a class="btn btn-outline btn-small" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical)}">Facebook</a><a class="btn btn-outline btn-small" target="_blank" rel="noopener noreferrer" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}">LinkedIn</a></div></article>
${related.length ? `<section class="section bg-alt"><div class="container"><div class="section-header"><span class="section-subtitle">Keep exploring</span><h2 class="section-title">More stories for your journey</h2></div><div class="article-grid">${related.map(relatedCard).join('')}</div></div></section>` : ''}
<section class="section"><div class="container" style="text-align:center"><h2 class="section-title">Have a useful travel story to share?</h2><p class="section-description">We welcome original destination knowledge, practical advice, and thoughtful travel experiences.</p><a href="/submit.html" class="btn btn-primary">Submit a travel story →</a></div></section>
${footer()}<script src="/js/site-config.js"></script><script src="/js/main.js"></script><script src="/js/article-enhancements.js"></script></body></html>`;
}

exports.renderStory = onRequest({ region: 'us-central1', cors: false }, async (req, res) => {
  const origin = canonicalOrigin(req);
  const rawPath = String(req.path || req.originalUrl || '').split('?')[0];
  const slug = decodeURIComponent(rawPath.replace(/^\/story\/?/, '').split('/')[0] || '').trim();
  if (!slug || slug.length > 180) {
    res.status(404).set('Cache-Control', 'no-store').send(notFoundPage(origin));
    return;
  }
  try {
    let result = await db.collection('articles').where('slug', '==', slug).where('status', '==', 'published').limit(1).get();
    if (result.empty) {
      const previous = await db.collection('articles').where('previousSlugs', 'array-contains', slug).where('status', '==', 'published').limit(1).get();
      if (!previous.empty) {
        const currentSlug = String(previous.docs[0].data().slug || previous.docs[0].id);
        res.redirect(301, `/story/${encodeURIComponent(currentSlug)}`);
        return;
      }
      res.status(404).set('Cache-Control', 'no-store').send(notFoundPage(origin));
      return;
    }
    const article = { id: result.docs[0].id, ...result.docs[0].data() };
    let related = [];
    if (article.category) {
      try {
        const relatedSnapshot = await db.collection('articles').where('status', '==', 'published').where('category', '==', article.category).orderBy('date', 'desc').limit(5).get();
        related = relatedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.id !== article.id).slice(0, 3);
      } catch (error) { console.warn('Related-story query is unavailable:', error.message); }
    }
    res.status(200).set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    }).send(articlePage(article, related, origin, slug));
  } catch (error) {
    console.error('Could not render travel story:', error);
    res.status(500).set('Cache-Control', 'no-store').send(`<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Story unavailable — ${BRAND}</title></head><body><h1>Story temporarily unavailable</h1><p>Please try again shortly.</p><a href="/articles.html">Browse travel stories</a></body></html>`);
  }
});

function notFoundPage(origin) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Story not found — ${BRAND}</title><link rel="stylesheet" href="/css/style.css"></head><body>${nav(origin)}<main class="section"><div class="container" style="text-align:center"><h1>This story could not be found.</h1><p>It may have been unpublished or the address may be incorrect.</p><a class="btn btn-primary" href="/articles.html">Browse travel stories</a></div></main>${footer()}</body></html>`;
}

exports.dynamicSitemap = onRequest({ region: 'us-central1', cors: false }, async (req, res) => {
  const origin = canonicalOrigin(req);
  try {
    const snapshot = await db.collection('articles').where('status', '==', 'published').orderBy('date', 'desc').limit(45000).get();
    const baseUrls = [
      { path: '/', changefreq: 'weekly', priority: '1.0' },
      { path: '/articles.html', changefreq: 'daily', priority: '0.9' },
      { path: '/about.html', changefreq: 'monthly', priority: '0.6' },
      { path: '/contact.html', changefreq: 'monthly', priority: '0.5' },
      { path: '/submit.html', changefreq: 'monthly', priority: '0.5' }
    ];
    const articleUrls = snapshot.docs.map(doc => {
      const article = doc.data();
      return { path: `/story/${encodeURIComponent(String(article.slug || doc.id))}`, lastmod: isoDate(article.updatedAt) || isoDate(article.publishedAt) || isoDate(article.date), changefreq: 'monthly', priority: '0.7' };
    });
    const urls = [...baseUrls, ...articleUrls].map(item => `<url><loc>${escapeHtml(origin + item.path)}</loc>${item.lastmod ? `<lastmod>${escapeHtml(item.lastmod)}</lastmod>` : ''}<changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`).join('');
    res.status(200).set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=600' }).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  } catch (error) {
    console.error('Could not generate sitemap:', error);
    res.status(500).set({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' }).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});
