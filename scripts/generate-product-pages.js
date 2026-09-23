const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://www.fazendinhaturca.com.br';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

const ROOT = path.resolve(__dirname, '..');

const GENERATED = {
  mercadinho: path.join(ROOT, 'produtos'),
  'atelier-verushka': path.join(ROOT, 'atelie')
};

function validateConfig() {
  if (!SUPABASE_URL) {
    throw new Error(
      'SUPABASE_URL não foi definida. Configure o GitHub Secret SUPABASE_URL.'
    );
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY não foi definida. Configure o GitHub Secret SUPABASE_PUBLISHABLE_KEY.'
    );
  }

  if (!/^https?:\/\//i.test(SUPABASE_URL)) {
    throw new Error(
      'SUPABASE_URL inválida. Deve começar com http:// ou https://.'
    );
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

  return s || 'produto';
}

function absoluteUrl(value = '') {
  if (!value) {
    return `${SITE_URL}/images/hero-frutas.webp`;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${SITE_URL}/${String(value).replace(/^\//, '')}`;
}

function productUrl(projectSlug, slug) {
  return `${SITE_URL}/${
    projectSlug === 'atelier-verushka' ? 'atelie' : 'produtos'
  }/${encodeURIComponent(slug)}.html`;
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function jsonLd(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/<\/script/gi, '<\\/script');
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
    throw new Error(
      `Supabase ${res.status}: ${await res.text()}`
    );
  }

  return res.json();
}

function clearGenerated(dir) {
  fs.mkdirSync(dir, { recursive: true });

  for (const file of fs.readdirSync(dir)) {
    if (file.toLowerCase().endsWith('.html')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

function template(p, project, category) {
  const isAtelie = project.slug === 'atelier-verushka';

  const canonical = productUrl(project.slug, p.slug);

  const title =
    p.seo_title ||
    `${p.nome} | ${project.nome_publico || 'Fazendinha Turca'}`;

  const description =
    p.seo_description ||
    stripHtml(
      p.descricao_curta ||
      p.descricao ||
      `${p.nome} disponível na ${
        project.nome_publico || 'Fazendinha Turca'
      }.`
    );

  const alt = p.alt_text || p.nome;

  const mainImage = absoluteUrl(p.imagem_principal_url);

  const gallery = Array.isArray(p.galeria)
    ? p.galeria.filter(Boolean)
    : [];

  const images = [
    ...new Set([
      mainImage,
      ...gallery.map(absoluteUrl)
    ])
  ];

  const descriptionHtml = p.descricao
    ? p.descricao
    : `<p>${esc(
        p.descricao_curta ||
          `${p.nome} disponível na ${
            project.nome_publico || 'Fazendinha Turca'
          }.`
      )}</p>`;

  const categoryName = category?.nome || '';

  const whatsapp =
    project.whatsapp_numero || '5522988328812';

  const message = encodeURIComponent(
    `Olá! Tenho interesse no produto: ${p.nome} — ${canonical}`
  );

  const back = isAtelie
    ? `${SITE_URL}/atelie.html`
    : `${SITE_URL}/produtos.html`;

  const brand = isAtelie
    ? 'Ateliê da Verushka'
    : 'Fazendinha Turca';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    name: p.nome,
    description,
    image: images,
    sku: p.id,
    brand: {
      '@type': 'Brand',
      name: brand
    },
    ...(categoryName
      ? { category: categoryName }
      : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'BRL',
      price: Number(p.preco || 0).toFixed(2),
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: brand,
        url: SITE_URL
      }
    }
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Fazendinha Turca',
        item: `${SITE_URL}/`
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: brand,
        item: back
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: p.nome,
        item: canonical
      }
    ]
  };

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${esc(canonical)}">

  <meta property="og:type" content="product">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(mainImage)}">
  <meta property="og:site_name" content="Fazendinha Turca">

  <style>
    :root{
      --green:#244b2f;
      --green2:#315f3b;
      --cream:#fbf7ed;
      --brown:#4d3528;
      --red:#a53232;
      --gold:#c79a36
    }

    *{
      box-sizing:border-box
    }

    body{
      margin:0;
      background:var(--cream);
      color:var(--brown);
      font-family:Arial,Helvetica,sans-serif;
      line-height:1.6
    }

    header{
      background:var(--green);
      color:#fff;
      padding:14px 22px
    }

    header .nav{
      max-width:1100px;
      margin:auto;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:20px
    }

    header a{
      color:#fff;
      text-decoration:none;
      font-weight:700
    }

    header nav{
      display:flex;
      gap:18px;
      flex-wrap:wrap;
      font-size:.95rem
    }

    main{
      max-width:1100px;
      margin:0 auto;
      padding:28px 22px 70px
    }

    .breadcrumb{
      font-size:.9rem;
      margin-bottom:22px
    }

    .breadcrumb a{
      color:var(--green2)
    }

    .product{
      display:grid;
      grid-template-columns:minmax(0,1fr) minmax(320px,.85fr);
      gap:42px;
      background:#fff;
      border-radius:16px;
      padding:28px;
      box-shadow:0 5px 25px rgba(60,40,20,.08)
    }

    .hero-img{
      width:100%;
      aspect-ratio:1/1;
      object-fit:contain;
      background:#fafafa;
      border-radius:12px
    }

    .thumbs{
      display:flex;
      gap:10px;
      overflow:auto;
      margin-top:12px
    }

    .thumbs img{
      width:78px;
      height:78px;
      object-fit:cover;
      border-radius:8px;
      border:1px solid #ddd
    }

    .category{
      font-size:.85rem;
      text-transform:uppercase;
      letter-spacing:.08em;
      color:var(--green2);
      font-weight:700
    }

    .price{
      font-size:1.8rem;
      color:var(--red);
      font-weight:800;
      margin:15px 0
    }

    .description{
      margin:20px 0
    }

    .description img{
      max-width:100%;
      height:auto
    }

    .cta{
      display:inline-block;
      background:var(--green);
      color:#fff;
      text-decoration:none;
      padding:13px 20px;
      border-radius:9px;
      font-weight:800
    }

    .cta:hover{
      background:var(--green2)
    }

    .back{
      display:inline-block;
      margin-top:24px;
      color:var(--green2);
      font-weight:700
    }

    .seo-copy{
      max-width:900px;
      margin:42px auto 0;
      background:#fff;
      padding:28px;
      border-radius:14px
    }

    .seo-copy h2{
      color:var(--green)
    }

    footer{
      padding:25px 22px;
      text-align:center;
      color:#765f4d;
      border-top:1px solid #eadfce
    }

    @media(max-width:760px){
      .product{
        grid-template-columns:1fr;
        padding:18px
      }

      .product h1{
        font-size:1.7rem
      }

      header .nav{
        align-items:flex-start;
        flex-direction:column
      }

      main{
        padding:18px 14px 50px
      }
    }
  </style>

  <script type="application/ld+json">${jsonLd(schema)}</script>
  <script type="application/ld+json">${jsonLd(breadcrumb)}</script>
</head>

<body>

<header>
  <div class="nav">
    <a href="${SITE_URL}/">Fazendinha Turca</a>

    <nav>
      <a href="${SITE_URL}/">Início</a>
      <a href="${SITE_URL}/produtos.html">Mercadinho</a>
      <a href="${SITE_URL}/atelie.html">Ateliê</a>
      <a href="${SITE_URL}/blog.html">Blog</a>
    </nav>
  </div>
</header>

<main>

  <div class="breadcrumb">
    <a href="${SITE_URL}/">Fazendinha Turca</a>
    ›
    <a href="${back}">${esc(brand)}</a>
    ›
    ${esc(p.nome)}
  </div>

  <article class="product">

    <section>

      <img
        class="hero-img"
        src="${esc(mainImage)}"
        alt="${esc(alt)}"
        width="900"
        height="900"
      >

      ${
        images.length > 1
          ? `<div class="thumbs">
              ${images
                .map(
                  (src, i) =>
                    `<img
                      src="${esc(src)}"
                      alt="${esc(alt)}${
                        i ? ` - foto ${i + 1}` : ''
                      }"
                      loading="lazy"
                    >`
                )
                .join('')}
            </div>`
          : ''
      }

    </section>

    <section>

      ${
        categoryName
          ? `<div class="category">${esc(categoryName)}</div>`
          : ''
      }

      <h1>${esc(p.nome)}</h1>

      ${
        p.descricao_curta
          ? `<p><strong>${esc(p.descricao_curta)}</strong></p>`
          : ''
      }

      <div class="price">${money(p.preco)}</div>

      <div class="description">
        ${descriptionHtml}
      </div>

      <a
        class="cta"
        href="https://wa.me/${esc(whatsapp)}?text=${message}"
        target="_blank"
        rel="noopener"
      >
        Tenho interesse neste produto
      </a>

      <br>

      <a class="back" href="${back}">
        ← Voltar para ${esc(brand)}
      </a>

    </section>

  </article>

  <section class="seo-copy">

    <h2>Sobre ${esc(p.nome)}</h2>

    <p>${esc(description)}</p>

  </section>

</main>

<footer>
  © ${new Date().getFullYear()} Fazendinha Turca · ${esc(brand)}
</footer>

</body>
</html>
`;
}

async function main() {
  validateConfig();

  const projects = await api(
    'projetos?select=id,slug,nome_publico,menu_url,status,whatsapp_numero&status=eq.ativo'
  );

  const projectById = new Map(
    projects.map(p => [p.id, p])
  );

  const categories = await api(
    'categorias?select=id,projeto_id,nome,slug,status&status=eq.ativo'
  );

  const categoryById = new Map(
    categories.map(c => [c.id, c])
  );

  const products = await api(
    'produtos?select=*&status=eq.ativo&order=ordem.asc'
  );

  for (const dir of Object.values(GENERATED)) {
    clearGenerated(dir);
  }

  const sitemap = new Map();

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  sitemap.set(`${SITE_URL}/`, {
    lastmod: today,
    priority: '1.0',
    changefreq: 'weekly'
  });

  sitemap.set(`${SITE_URL}/produtos.html`, {
    lastmod: today,
    priority: '0.9',
    changefreq: 'weekly'
  });

  sitemap.set(`${SITE_URL}/atelie.html`, {
    lastmod: today,
    priority: '0.9',
    changefreq: 'weekly'
  });

  sitemap.set(`${SITE_URL}/blog.html`, {
    lastmod: today,
    priority: '0.8',
    changefreq: 'weekly'
  });

  let generated = 0;

  const usedPaths = new Set();

  for (const p of products) {
    const project = projectById.get(p.projeto_id);

    if (
      !project ||
      !['mercadinho', 'atelier-verushka'].includes(project.slug) ||
      !p.slug
    ) {
      continue;
    }

    const slug = safeSlug(p.slug);

    const projectFolder =
      project.slug === 'atelier-verushka'
        ? 'atelie'
        : 'produtos';

    const uniquePath =
      `${projectFolder}/${slug}.html`;

    if (usedPaths.has(uniquePath)) {
      console.warn(
        `Slug duplicado ignorado: ${uniquePath} (produto ${p.id})`
      );
      continue;
    }

    usedPaths.add(uniquePath);

    const dir = GENERATED[project.slug];

    const category =
      categoryById.get(p.categoria_id);

    const filename = `${slug}.html`;

    fs.writeFileSync(
      path.join(dir, filename),
      template(
        {
          ...p,
          slug
        },
        project,
        category
      ),
      'utf8'
    );

    const url = productUrl(
      project.slug,
      slug
    );

    sitemap.set(url, {
      lastmod: p.atualizado_em
        ? String(p.atualizado_em).slice(0, 10)
        : today,
      priority: '0.8',
      changefreq: 'weekly'
    });

    generated++;
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];

  for (const [url, meta] of sitemap) {
    xml.push('  <url>');
    xml.push(`    <loc>${esc(url)}</loc>`);
    xml.push(`    <lastmod>${esc(meta.lastmod)}</lastmod>`);
    xml.push(`    <changefreq>${meta.changefreq}</changefreq>`);
    xml.push(`    <priority>${meta.priority}</priority>`);
    xml.push('  </url>');
  }

  xml.push(
    '</urlset>',
    ''
  );

  fs.writeFileSync(
    path.join(ROOT, 'sitemap.xml'),
    xml.join('\n'),
    'utf8'
  );

  console.log(
    `Geradas ${generated} páginas estáticas de produtos e ${sitemap.size} URLs no sitemap.`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
