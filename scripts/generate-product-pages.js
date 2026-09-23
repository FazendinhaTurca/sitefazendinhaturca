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

const ATELIE_AREA = [
  'Brasil',
  'Araruama, RJ',
  'Rio de Janeiro',
  'Santa Catarina',
  'Florianópolis, SC',
  'Minas Gerais',
  'Amazonas',
  'Pará'
];

const ATELIE_BANNERS = [
  'topo-lojinha',
  'menu-colecoes',
  'colecao-destaque-vila',
  'feito-a-mao',
  'rodape-vila'
].map(n => `${SITE_URL}/images/atelie/${n}.webp`);

function cut(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max - 1);
  return c.slice(0, c.lastIndexOf(' ') > 40 ? c.lastIndexOf(' ') : c.length)
    .replace(/[\s,.;:-]+$/, '') + '…';
}

// SEO do Ateliê: usa o que foi digitado no painel só quando é bom o bastante
// (título >= 30 e descrição >= 80 caracteres); senão gera automaticamente.
function atelieTitle(p) {
  const custom = String(p.seo_title || '').trim();
  if (custom.length >= 30) return custom;
  const candidates = [
    `${p.nome} | Hama Beads – Ateliê da Verushka`,
    `${p.nome} | Ateliê da Verushka`,
    p.nome
  ];
  return candidates.find(t => t.length <= 65) || p.nome;
}

function atelieDescription(p) {
  const custom = stripHtml(p.seo_description || '');
  if (custom.length >= 80) return cut(custom, 158);
  const short = stripHtml(p.descricao_curta || '').replace(/[.\s]+$/, '');
  const jaCitaHama = /hama|hamma/i.test(short);
  const tail = `${jaCitaHama ? ' Feito' : ' Hama Beads feito'} à mão em Araruama-RJ, sob encomenda em 3 a 10 dias. Envio para todo o Brasil.`;
  const full = `${p.nome}${short ? ` – ${short}.` : '.'}${tail}`;
  return full.length <= 158
    ? full
    : cut(`${p.nome}. Hama Beads feito à mão em Araruama-RJ, sob encomenda em 3 a 10 dias. Envio para todo o Brasil.`, 158);
}

function atelieAlt(p) {
  const custom = String(p.alt_text || '').trim();
  return custom.length >= 15
    ? custom
    : `${p.nome} em Hama Beads – artesanato do Ateliê da Verushka`;
}

const ATELIE_CSS = `    .faq,.related{
      max-width:900px;
      margin:28px auto 0;
      background:#fff;
      padding:28px;
      border-radius:14px
    }

    .faq h2,.related h2{
      color:var(--green);
      margin-top:0
    }

    .faq h3{
      font-size:1.05rem;
      margin:18px 0 4px;
      color:var(--green2)
    }

    .faq p{
      margin:0
    }

    .related-grid{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
      gap:16px
    }

    .related-grid a{
      color:var(--brown);
      text-decoration:none;
      display:block
    }

    .related-grid img{
      width:100%;
      aspect-ratio:1/1;
      object-fit:cover;
      border-radius:10px;
      border:1px solid #eadfce
    }

    .related-grid span{
      display:block;
      font-weight:700;
      margin-top:6px;
      font-size:.95rem
    }

    .related-grid strong{
      color:var(--red)
    }

`;

function template(p, project, category, siblings = []) {
  const isAtelie = project.slug === 'atelier-verushka';

  const canonical = productUrl(project.slug, p.slug);

  const title = isAtelie
    ? atelieTitle(p)
    : p.seo_title ||
    `${p.nome} | ${project.nome_publico || 'Fazendinha Turca'}`;

  const description = isAtelie
    ? atelieDescription(p)
    : p.seo_description ||
    stripHtml(
      p.descricao_curta ||
      p.descricao ||
      `${p.nome} disponível na ${
        project.nome_publico || 'Fazendinha Turca'
      }.`
    );

  const alt = isAtelie ? atelieAlt(p) : p.alt_text || p.nome;

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
    ...(isAtelie ? { url: canonical, mainEntityOfPage: canonical } : {}),
    sku: p.id,
    brand: {
      '@type': 'Brand',
      name: brand
    },
    ...(isAtelie
      ? {
          material: 'Hama Beads',
          manufacturer: { '@id': `${SITE_URL}/atelie.html#atelie` }
        }
      : {}),
    ...(categoryName
      ? { category: categoryName }
      : {}),
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'BRL',
      price: Number(p.preco || 0).toFixed(2),
      availability: 'https://schema.org/InStock',
      ...(isAtelie
        ? {
            itemCondition: 'https://schema.org/NewCondition',
            areaServed: ATELIE_AREA
          }
        : {}),
      seller: isAtelie
        ? { '@id': `${SITE_URL}/atelie.html#atelie` }
        : {
            '@type': 'Organization',
            name: brand,
            url: SITE_URL
          }
    }
  };

  const heroAttrs = isAtelie
    ? ' fetchpriority="high" decoding="async"'
    : '';

  const robots = isAtelie
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : 'index,follow';

  const extraHead = isAtelie
    ? `

  <link rel="alternate" hreflang="pt-BR" href="${esc(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${esc(canonical)}">
  <link rel="preload" as="image" href="${esc(mainImage)}" fetchpriority="high">
  <meta name="geo.region" content="BR-RJ">
  <meta name="geo.placename" content="Araruama">
  <meta name="geo.position" content="-22.8728;-42.3436">
  <meta name="ICBM" content="-22.8728, -42.3436">
  <meta name="theme-color" content="#244b2f">`
    : '';

  const extraOg = isAtelie
    ? `
  <meta property="og:locale" content="pt_BR">
  <meta property="og:image:alt" content="${esc(alt)}">
  <meta property="product:price:amount" content="${Number(p.preco || 0).toFixed(2)}">
  <meta property="product:price:currency" content="BRL">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(mainImage)}">
  <meta name="twitter:image:alt" content="${esc(alt)}">`
    : '';

  const extraCss = isAtelie ? ATELIE_CSS : '';

  const seoCopyHtml = isAtelie
    ? `<h2>Sobre ${esc(p.nome)}</h2>

    <p>${esc(p.nome)} é uma peça artesanal em Hama Beads${
        categoryName ? `, da categoria ${esc(categoryName)}` : ''
      }, feita à mão pelo Ateliê da Verushka em Araruama-RJ, na Região dos Lagos do Rio de Janeiro.</p>

    <p>Cada peça é montada conta por conta e produzida sob encomenda, com prazo de entrega de 3 a 10 dias. O pedido é fechado pelo WhatsApp, onde também dá para combinar cores, tamanho e personalização.</p>

    <p>Enviamos para todo o Brasil, incluindo Florianópolis e Santa Catarina, Minas Gerais, Amazonas e Pará. Informe o seu CEP e combine o frete pelo WhatsApp.</p>`
    : `<h2>Sobre ${esc(p.nome)}</h2>

    <p>${esc(description)}</p>`;

  const faqHtml = isAtelie
    ? `

  <section class="faq">

    <h2>Perguntas frequentes</h2>

    <h3>Qual é o prazo de entrega de ${esc(p.nome)}?</h3>
    <p>As peças são feitas sob encomenda, com prazo de 3 a 10 dias, variando conforme o item.</p>

    <h3>O Ateliê da Verushka envia para outros estados?</h3>
    <p>Sim. Enviamos para todo o Brasil, incluindo Santa Catarina (Florianópolis), Minas Gerais, Amazonas e Pará. O frete é combinado pelo WhatsApp.</p>

    <h3>Dá para personalizar cores ou tamanho?</h3>
    <p>Sim. Fale com a gente pelo WhatsApp para combinar cores, tamanho e tema da peça.</p>

  </section>`
    : '';

  const related = isAtelie
    ? siblings
        .filter(x => x.id !== p.id)
        .sort(
          (a, b) =>
            (b.categoria_id === p.categoria_id) -
            (a.categoria_id === p.categoria_id)
        )
        .slice(0, 4)
    : [];

  const relatedHtml = related.length
    ? `

  <section class="related">

    <h2>Outras peças do Ateliê da Verushka</h2>

    <div class="related-grid">
      ${related
        .map(
          x => `<a href="${esc(x.url)}">
        <img src="${esc(x.img)}" alt="${esc(x.alt)}" width="300" height="300" loading="lazy" decoding="async">
        <span>${esc(x.nome)}</span>
        <strong>${money(x.preco)}</strong>
      </a>`
        )
        .join('\n      ')}
    </div>

  </section>`
    : '';

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
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${esc(canonical)}">${extraHead}

  <meta property="og:type" content="product">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(mainImage)}">
  <meta property="og:site_name" content="Fazendinha Turca">${extraOg}

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

${extraCss}    footer{
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
        height="900"${heroAttrs}
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

    ${seoCopyHtml}

  </section>${faqHtml}${relatedHtml}

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

  const atelieProjectId = projects.find(
    pr => pr.slug === 'atelier-verushka'
  )?.id;

  const atelieSiblings = products
    .filter(x => x.projeto_id === atelieProjectId && x.slug)
    .map(x => {
      const sl = safeSlug(x.slug);
      return {
        id: x.id,
        categoria_id: x.categoria_id,
        nome: x.nome,
        preco: x.preco,
        url: productUrl('atelier-verushka', sl),
        img: absoluteUrl(x.imagem_principal_url),
        alt: `${x.nome} em Hama Beads`
      };
    });

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
    changefreq: 'weekly',
    images: ATELIE_BANNERS
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
        category,
        atelieSiblings
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
      changefreq: 'weekly',
      ...(project.slug === 'atelier-verushka'
        ? {
            images: [
              ...new Set([
                absoluteUrl(p.imagem_principal_url),
                ...(Array.isArray(p.galeria)
                  ? p.galeria.filter(Boolean).map(absoluteUrl)
                  : [])
              ])
            ]
          }
        : {})
    });

    generated++;
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/image-sitemap/1.1">'
  ];

  for (const [url, meta] of sitemap) {
    xml.push('  <url>');
    xml.push(`    <loc>${esc(url)}</loc>`);
    xml.push(`    <lastmod>${esc(meta.lastmod)}</lastmod>`);
    xml.push(`    <changefreq>${meta.changefreq}</changefreq>`);
    xml.push(`    <priority>${meta.priority}</priority>`);

    for (const img of meta.images || []) {
      xml.push('    <image:image>');
      xml.push(`      <image:loc>${esc(img)}</image:loc>`);
      xml.push('    </image:image>');
    }

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
