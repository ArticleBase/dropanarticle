/* Small progressive enhancements for server-rendered article pages. */
document.addEventListener('DOMContentLoaded', () => {
  const body = document.getElementById('readerBody');
  if (!body) return;
  const headings = [...body.querySelectorAll('h2, h3')];
  if (headings.length > 2) {
    const toc = document.createElement('nav');
    toc.className = 'article-toc reveal visible';
    toc.setAttribute('aria-label', 'On this page');
    const title = document.createElement('strong'); title.textContent = 'On this page'; toc.appendChild(title);
    const list = document.createElement('ol');
    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = `section-${index + 1}`;
      const item = document.createElement('li'); const link = document.createElement('a');
      link.href = `#${heading.id}`; link.textContent = heading.textContent; item.appendChild(link); list.appendChild(item);
    });
    toc.appendChild(list); body.prepend(toc);
  }
  const progress = document.createElement('div'); progress.className = 'reading-progress'; progress.setAttribute('aria-hidden', 'true'); document.body.appendChild(progress);
  const update = () => {
    const rect = body.getBoundingClientRect();
    const distance = Math.max(1, body.scrollHeight - window.innerHeight);
    const consumed = Math.max(0, Math.min(distance, -rect.top));
    progress.style.transform = `scaleX(${consumed / distance})`;
  };
  window.addEventListener('scroll', update, { passive: true }); update();
  document.getElementById('copyStoryLink')?.addEventListener('click', async event => {
    const url = event.currentTarget.dataset.url || location.href;
    try { await navigator.clipboard.writeText(url); event.currentTarget.textContent = 'Link copied'; }
    catch { window.prompt('Copy this article URL:', url); }
  });
});
