const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://www.fazendinhaturca.com.br';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const ROOT = path.resolve(__dirname, '..');
const BLOG_HTML = path.join(ROOT, 'blog.html');
const BLOG_DIR = path.join(ROOT, 'blog');
const SITEMAP = path.join(ROOT, 'sitemap.xml');

function validateConfig() {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL não foi definida. Configure o GitHub Secret SUPABASE_URL.');
  }
  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY não foi definida. Configure o GitHub Secret SUPABASE_PUBLISHABLE_KEY.');
  }
  if (!/^https?:\/\//i.test(SUPABASE_URL)) {
    throw new Error('SUPABASE_URL inválida. Deve começar com http:// ou https://.');
  }
}

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeSlug(value = '') {
  const s = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'artigo';
}

function absoluteUrl(value = '') {
  if (!value) return `${SITE_URL}/images/hero-frutas.webp`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}/${String(value).replace(/^\//, '')}`;
}

function articleUrl(slug) {
  return `${SITE_URL}/blog/${encodeURIComponent(slug)}.html`;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function isoDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

function jsonLd(obj) {
  return JSON.stringify(obj, null, 2).replace(/<\/script/gi, '<\\/script');
}

async function api(pathname) {
  const url = `${SUPABASE_URL}/rest/v1/${pathname}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    }
  });

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

function clearGeneratedBlogPages() {
  fs.mkdirSync(BLOG_DIR, { recursive: true });

  for (const file of fs.readdirSync(BLOG_DIR)) {
    if (file.toLowerCase().endsWith('.html')) {
      fs.unlinkSync(path.join(BLOG_DIR, file));
    }
  }
}

function blogCard(article, index) {
  const slug = safeSlug(article.slug || article.titulo);
  const url = `blog/${encodeURIComponent(slug)}.html`;
  const image = article.imagem_capa_url
    ? `<img src="${esc(absoluteUrl(article.imagem_capa_url))}" alt="${esc(article.alt_text || article.titulo)}" loading="lazy">`
    : '🌿';

  return `<a class="post-card reveal" href="${url}" style="transition-delay:${Math.min(index, 6) * 60}ms;">
      <div class="post-card-img ${article.imagem_capa_url ? '' : 'sem-imagem'}">
        ${image}
      </div>
      <div class="post-card-body">
        ${article.categoria ? `<div class="post-card-cat">${esc(article.categoria)}</div>` : ''}
        <div class="post-card-titulo">${esc(article.titulo)}</div>
        ${article.resumo ? `<div class="post-card-resumo">${esc(stripHtml(article.resumo))}</div>` : ''}
        <div class="post-card-meta">${esc(formatDate(article.data_publicacao))}${article.autor ? ` &middot; ${esc(article.autor)}` : ''}</div>
        <span class="post-card-link">Ler artigo &rarr;</span>
      </div>
    </a>`;
}

function renderBlogHtml(articles) {
  const source = fs.readFileSync(BLOG_HTML, 'utf8');
  const startMarker = '<!-- BLOG_ARTIGOS_INICIO -->';
  const endMarker = '<!-- BLOG_ARTIGOS_FIM -->';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error('Os marcadores BLOG_ARTIGOS_INICIO/ BLOG_ARTIGOS_FIM não foram encontrados em blog.html.');
  }

  const content = articles.length
    ? articles.map(blogCard).join('\n')
    : '<div class="estado-msg">Ainda não publicamos nenhum artigo por aqui. Volte em breve!</div>';

  const before = source.slice(0, start + startMarker.length);
  const after = source.slice(end);
  fs.writeFileSync(BLOG_HTML, `${before}\n    ${content}\n    ${after}`, 'utf8');
}

function articleTemplate(article, slug) {
  const canonical = articleUrl(slug);
  const title = String(article.seo_title || `${article.titulo} | Blog | Fazendinha Turca`).trim();
  const description = String(
    article.seo_description ||
    stripHtml(article.resumo) ||
    stripHtml(article.conteudo).slice(0, 158) ||
    'Artigo da Fazendinha Turca.'
  ).trim().slice(0, 158);
  const image = article.imagem_capa_url ? absoluteUrl(article.imagem_capa_url) : '';
  const alt = article.alt_text || article.titulo;
  const datePublished = article.data_publicacao || article.criado_em || new Date().toISOString();
  const dateModified = article.atualizado_em || datePublished;
  const tags = Array.isArray(article.tags) ? article.tags.filter(Boolean) : [];
  const category = String(article.categoria || '').trim();

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${canonical}#article`,
    headline: article.titulo,
    description,
    url: canonical,
    datePublished,
    dateModified,
    author: {
      '@type': 'Person',
      name: article.autor || 'Fazendinha Turca'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Fazendinha Turca',
      url: SITE_URL
    },
    ...(image ? { image: [image] } : {}),
    ...(category ? { articleSection: category } : {}),
    ...(tags.length ? { keywords: tags.join(', ') } : {})
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Fazendinha Turca', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog.html` },
      { '@type': 'ListItem', position: 3, name: article.titulo, item: canonical }
    ]
  };

  const tagsHtml = tags.length
    ? `<div class="post-full-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="${esc(article.autor || 'Fazendinha Turca')}">
<meta name="theme-color" content="#1E2E1B">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="${SITE_URL}/images/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="${SITE_URL}/images/apple-touch-icon.png">
<meta property="og:type" content="article">
<meta property="og:locale" content="pt_BR">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="Fazendinha Turca">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta property="article:published_time" content="${esc(datePublished)}">
<meta property="article:modified_time" content="${esc(dateModified)}">
${category ? `<meta property="article:section" content="${esc(category)}">` : ''}
${tags.map(t => `<meta property="article:tag" content="${esc(t)}">`).join('\n')}
<style>
$:root {
    --cream: #FAF3E6;
    --cream-2: #F1E8D6;
    --green-dark: #1E2E1B;
    --green: #3D5A32;
    --green-light: #7FA35C;
    --brown: #7A5230;
    --brown-dark: #4E3420;
    --terracotta: #C1622D;
    --terracotta-dark: #A24E22;
    --gold: #D9A441;
    --text: #2B2418;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cream);
    color: var(--text);
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  }
  h1,h2,h3 {
    font-family: Georgia, 'Times New Roman', serif;
    margin: 0;
  }
  a { text-decoration: none; }
  img { display: block; max-width: 100%; }

  /* HEADER (idêntico ao index.html) */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 24px;
    background: var(--cream);
    position: sticky;
    top: 0;
    z-index: 50;
    box-shadow: 0 1px 0 rgba(0,0,0,0.06);
  }
  .logo-wrap { display: flex; align-items: center; gap: 8px; }
  .logo-wrap img { height: 44px; width: 44px; border-radius: 50%; object-fit: cover; }
  .logo-text { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 13px; line-height: 1.15; color: var(--green-dark); }
  nav { display: flex; align-items: center; gap: 26px; font-size: 13px; font-weight: 600; letter-spacing: 0.5px; color: var(--text); }
  nav a { color: var(--text); position: relative; padding-bottom: 4px; transition: color 0.15s ease; }
  nav a::after { content: ""; position: absolute; left: 0; bottom: 0; width: 0; height: 2px; background: var(--gold); transition: width 0.2s ease; }
  nav a:hover { color: var(--green); }
  nav a:hover::after { width: 100%; }
  nav a.active { color: var(--green); }
  nav a.active::after { width: 100%; }
  .header-icons { display: flex; gap: 16px; font-size: 18px; color: var(--green-dark); }
  .menu-toggle { display:none; background:none; border:none; font-size: 22px; cursor:pointer; color: var(--green-dark); }

  @media (max-width: 640px) {
    nav {
      display: none; position: absolute; top: 100%; left: 0; right: 0;
      flex-direction: column; gap: 0; background: var(--cream);
      box-shadow: 0 6px 10px rgba(0,0,0,0.08); padding: 6px 0;
    }
    nav.nav-open { display: flex; }
    nav a { padding: 12px 24px; }
    .menu-toggle { display: inline-block; }
  }

  /* HERO DA PÁGINA */
  .blog-hero { max-width: 1100px; margin: 26px auto 6px; padding: 0 16px; text-align: center; }
  .blog-hero h1 { font-size: clamp(24px, 4vw, 34px); color: var(--green-dark); }
  .blog-hero p { font-size: 14px; color: #4B4432; max-width: 620px; margin: 10px auto 0; line-height: 1.6; }

  /* GRID DE ARTIGOS */
  .blog-grid {
    max-width: 1100px; margin: 26px auto 50px; padding: 0 16px;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  }
  @media (max-width: 900px) { .blog-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 620px) { .blog-grid { grid-template-columns: 1fr; } }

  .post-card {
    background: var(--cream-2); border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: column; box-shadow: 0 2px 8px rgba(33,51,31,0.08);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .post-card:hover { transform: translateY(-4px); box-shadow: 0 10px 22px rgba(33,51,31,0.16); }
  .post-card-img { width: 100%; aspect-ratio: 4/3; overflow: hidden; background: var(--cream); }
  .post-card-img img { width: 100%; height: 100%; object-fit: cover; }
  .post-card-img.sem-imagem { display:flex; align-items:center; justify-content:center; font-size: 40px; }
  .post-card-body { padding: 16px 18px 20px; display:flex; flex-direction:column; gap: 8px; flex: 1; }
  .post-card-cat { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: var(--terracotta); text-transform: uppercase; }
  .post-card-titulo { font-size: 17px; color: var(--green-dark); line-height: 1.3; }
  .post-card-resumo { font-size: 13px; color: #4B4432; line-height: 1.5; flex: 1; }
  .post-card-meta { font-size: 11.5px; color: #8A7A63; margin-top: 4px; }
  .post-card-link { display:inline-block; margin-top: 6px; font-size: 12.5px; font-weight: 700; color: var(--green); }

  .estado-msg { grid-column: 1 / -1; text-align: center; padding: 40px 16px; color: #4B4432; font-size: 14px; }

  /* ARTIGO COMPLETO */
  .post-full { max-width: 760px; margin: 26px auto 60px; padding: 0 16px; }
  .post-voltar { display:inline-block; font-size: 12.5px; font-weight: 700; color: var(--green); margin-bottom: 18px; }
  .post-full-capa { width: 100%; border-radius: 14px; overflow:hidden; margin-bottom: 18px; }
  .post-full-capa img { width: 100%; height: auto; }
  .post-full-cat { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: var(--terracotta); text-transform: uppercase; }
  .post-full h1 { font-size: clamp(22px, 4vw, 32px); color: var(--green-dark); margin: 8px 0 6px; line-height: 1.25; }
  .post-full-meta { font-size: 12.5px; color: #8A7A63; margin-bottom: 22px; }
  .post-full-conteudo { font-size: 15px; line-height: 1.75; color: var(--text); }
  .post-full-conteudo h2, .post-full-conteudo h3 { color: var(--green-dark); margin: 26px 0 10px; }
  .post-full-conteudo p { margin: 0 0 16px; }
  .post-full-conteudo img { border-radius: 12px; margin: 16px 0; }
  .post-full-conteudo ul, .post-full-conteudo ol { padding-left: 22px; margin: 0 0 16px; }
  .post-full-tags { margin-top: 26px; display:flex; flex-wrap:wrap; gap: 8px; }
  .post-full-tags span { background: var(--cream-2); border-radius: 999px; padding: 4px 12px; font-size: 11.5px; color: var(--brown-dark); }

  /* Animações de entrada ao rolar */
  .reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .reveal.in-view { opacity: 1; transform: translateY(0); }
  @media (prefers-reduced-motion: reduce) {
    .reveal { opacity: 1; transform: none; transition: none; }
  }

  /* FOOTER (idêntico ao index.html) */
  footer { position: relative; background: var(--green-dark); color: #EDE7D6; padding: 0; }
  .footer-content { background: var(--green-dark); padding: 22px 16px 26px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .footer-top { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; }
  .footer-top img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; }
  .footer-items { display: flex; flex-wrap: wrap; justify-content: center; gap: 22px; font-size: 11.5px; letter-spacing: 0.3px; opacity: 0.9; }
  .footer-items span { white-space: nowrap; }
  .footer-nap { font-size: 11px; opacity: 0.75; text-align: center; max-width: 640px; line-height: 1.6; margin: 4px 0 0; }

  .wa-float {
    position: fixed; bottom: 22px; right: 22px; background: #25D366; color: #fff;
    width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.3); z-index: 100;
    animation: pulse 2.4s infinite;
  }
  .wa-float svg { width: 28px; height: 28px; fill: #fff; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(37,211,102,0.55); }
    70% { box-shadow: 0 0 0 14px rgba(37,211,102,0); }
    100% { box-shadow: 0 0 0 0 rgba(37,211,102,0); }
  }
</style>
<script type="application/ld+json">${jsonLd(schema)}</script>
<script type="application/ld+json">${jsonLd(breadcrumb)}</script>
</head>
<body>

<header>
  <a href="${SITE_URL}/index.html" class="logo-wrap">
    <img src="${SITE_URL}/images/logo.webp" alt="Fazendinha Turca" width="200" height="266">
    <div class="logo-text">FAZENDINHA<br>TURCA</div>
  </a>
  <nav id="main-nav">
    <a href="${SITE_URL}/index.html#inicio">INÍCIO</a>
    <a href="${SITE_URL}/produtos.html">MERCADINHO</a>
    <a href="${SITE_URL}/atelie.html">ATELIÊ</a>
    <a href="${SITE_URL}/blog.html" class="active">BLOG</a>
    <a href="${SITE_URL}/index.html#sobre">SOBRE</a>
    <a href="https://wa.me/5522988328812?text=Ol%C3%A1%21%20Quero%20falar%20com%20a%20Fazendinha%20Turca." target="_blank" rel="noopener noreferrer">CONTATO</a>
  </nav>
  <div class="header-icons">
    <a href="${SITE_URL}/produtos.html" class="header-icon-btn" aria-label="Ver mercadinho de produtos">&#128722;</a>
    <button class="menu-toggle" id="menu-toggle" aria-label="Abrir menu" aria-controls="main-nav" aria-expanded="false">&#9776;</button>
  </div>
</header>

<main class="post-full">
  <a class="post-voltar" href="${SITE_URL}/blog.html">&larr; Voltar para o blog</a>
  ${image ? `<div class="post-full-capa"><img src="${esc(image)}" alt="${esc(alt)}"></div>` : ''}
  ${category ? `<div class="post-full-cat">${esc(category)}</div>` : ''}
  <h1>${esc(article.titulo)}</h1>
  <div class="post-full-meta">${esc(formatDate(datePublished))}${article.autor ? ` &middot; ${esc(article.autor)}` : ''}</div>
  <div class="post-full-conteudo">${article.conteudo || ''}</div>
  ${tagsHtml}
</main>

<footer>
  <div class="footer-content">
    <div class="footer-top">
      <img src="${SITE_URL}/images/logo.webp" alt="Fazendinha Turca - Araruama RJ" width="200" height="266" loading="lazy">
      <span>Do campo para você.</span>
    </div>
    <div class="footer-items">
      <span>&#127793; Produtos naturais</span>
      <span>&#9878;&#65039; Sustentabilidade de verdade</span>
      <span>&#128106; Família e propósito</span>
      <span>&#127757; Conexão com a natureza</span>
    </div>
    <p class="footer-nap">Fazendinha Turca &middot; Araruama &ndash; RJ &middot; <a href="https://wa.me/5522988328812" target="_blank" rel="noopener noreferrer" style="color:#EDE7D6; text-decoration:underline;">Fale conosco no WhatsApp</a></p>
  </div>
</footer>

<a class="wa-float" href="https://wa.me/5522988328812?text=Ol%C3%A1%21%20Vim%20pelo%20blog%20da%20Fazendinha%20Turca%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es." target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp">
  <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-1.746-.874-2.892-1.56-4.043-3.538-.306-.526.306-.489.874-1.627.099-.198.05-.371-.05-.52-.099-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.148.198 2.043 3.125 4.955 4.26 2.912 1.136 2.912.758 3.858.634.947-.124 3.038-1.24 3.462-2.44.421-1.198.421-2.223.297-2.436-.124-.213-.297-.297-.669-.446z"/></svg>
</a>

<script>
  document.getElementById('menu-toggle').addEventListener('click', function () {
    var nav = document.getElementById('main-nav');
    var isOpen = nav.classList.toggle('nav-open');
    this.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
</script>
</body>
</html>
`;
}

function updateSitemap(articleUrls) {
  const today = new Date().toISOString().slice(0, 10);
  let xml = fs.existsSync(SITEMAP)
    ? fs.readFileSync(SITEMAP, 'utf8')
    : '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n';

  // Remove URLs antigas geradas para o Blog. As demais URLs do sitemap são preservadas.
  const urls = [];
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];

  for (const block of urlBlocks) {
    const match = block.match(/<loc>([\s\S]*?)<\/loc>/);
    if (!match) continue;
    const loc = match[1].trim();
    if (/^https:\/\/www\.fazendinhaturca\.com\.br\/blog\//i.test(loc)) continue;
    urls.push(block);
  }

  for (const item of articleUrls) {
    urls.push(`  <url>\n    <loc>${esc(item.url)}</loc>\n    <lastmod>${esc(item.lastmod || today)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }

  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  fs.writeFileSync(SITEMAP, `${header}\n${urls.join('\n')}\n</urlset>\n`, 'utf8');
}

async function main() {
  validateConfig();

  const articles = await api(
    'blog_artigos?select=*&status=eq.publicado'
  );

  const sorted = (articles || [])
    .filter(a => a && (a.slug || a.titulo))
    .sort((a, b) => {
      const da = new Date(a.data_publicacao || a.criado_em || 0).getTime();
      const db = new Date(b.data_publicacao || b.criado_em || 0).getTime();
      return db - da;
    });

  const usedSlugs = new Set();
  const normalized = [];

  for (const article of sorted) {
    const slug = safeSlug(article.slug || article.titulo);

    if (usedSlugs.has(slug)) {
      console.warn(`Slug duplicado ignorado no Blog: ${slug} (artigo ${article.id || article.titulo})`);
      continue;
    }

    usedSlugs.add(slug);
    normalized.push({ ...article, slug });
  }

  clearGeneratedBlogPages();
  renderBlogHtml(normalized);

  const today = new Date().toISOString().slice(0, 10);
  const sitemapItems = [];

  for (const article of normalized) {
    const filename = `${article.slug}.html`;
    fs.writeFileSync(
      path.join(BLOG_DIR, filename),
      articleTemplate(article, article.slug),
      'utf8'
    );

    sitemapItems.push({
      url: articleUrl(article.slug),
      lastmod: isoDate(article.atualizado_em || article.data_publicacao || article.criado_em, today)
    });
  }

  updateSitemap(sitemapItems);

  console.log(
    `Geradas ${normalized.length} páginas estáticas de artigos do Blog, blog.html atualizado e sitemap.xml sincronizado.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
