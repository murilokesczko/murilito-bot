const {
Client,
GatewayIntentBits,
EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
require("dotenv").config();

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TOKEN = process.env.TOKEN;

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const LOJA_FORTNITE =
"https://www.fortnite.com/item-shop?lang=pt-BR";

const INTERVALO_NOTICIAS = 10 * 60 * 1000;

const MAX_NOTICIAS_POR_FONTE = 3;

// Não aceitar notícias muito antigas.
// Para fontes que não informam a data, usamos o filtro de títulos/URLs
// e a deduplicação normalmente.
const DIAS_MAXIMOS_NOTICIA = 30;

// ============================================================
// CLIENT DISCORD
// ============================================================

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

// ============================================================
// BROWSER PUPPETEER REUTILIZÁVEL
// ============================================================

let browser = null;

async function getBrowser() {
if (browser && browser.connected) {
return browser;
}

console.log("🌐 Iniciando navegador Puppeteer...");

browser = await puppeteer.launch({
headless: true,
args: [
"--no-sandbox",
"--disable-setuid-sandbox",
"--disable-dev-shm-usage",
"--disable-gpu"
]
});

console.log("✅ Puppeteer iniciado.");

return browser;
}

async function fecharBrowser() {
if (!browser) return;

try {
await browser.close();
} catch (e) {
console.log("⚠️ Erro ao fechar Puppeteer:", e.message);
}

browser = null;
}

async function criarPagina() {
const b = await getBrowser();

const page = await b.newPage();

await page.setUserAgent(
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
"AppleWebKit/537.36 (KHTML, like Gecko) " +
"Chrome/140.0.0.0 Safari/537.36"
);

await page.setViewport({
width: 1440,
height: 900
});

await page.setExtraHTTPHeaders({
"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
});

page.setDefaultNavigationTimeout(45000);

return page;
}

async function abrirPagina(url, espera = 2500) {
let page = null;

try {
page = await criarPagina();

```
console.log(`🌐 Puppeteer abrindo: ${url}`);

const response = await page.goto(url, {
  waitUntil: "domcontentloaded",
  timeout: 45000
});

const status = response ? response.status() : "desconhecido";

console.log(`🌐 Puppeteer status: ${status}`);

if (status === 403 || status === 401) {
  await page.close();
  return null;
}

await new Promise(resolve => setTimeout(resolve, espera));

return page;
```

} catch (erro) {
console.log(`❌ Erro abrindo ${url}: ${erro.message}`);

```
if (page) {
  try {
    await page.close();
  } catch {}
}

return null;
```

}
}

// ============================================================
// AXIOS
// ============================================================

async function axiosGet(url, tentativas = 2) {
for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
try {
console.log(
`🌐 Axios GET ${url} | tentativa ${tentativa}/${tentativas}`
);

```
  const resposta = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 Chrome/140 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8"
    },
    validateStatus: () => true
  });

  console.log(`✅ HTTP ${resposta.status} | ${url}`);

  if (resposta.status >= 200 && resposta.status < 300) {
    return resposta.data;
  }

  if (
    resposta.status === 403 ||
    resposta.status === 401 ||
    resposta.status === 404
  ) {
    return null;
  }

} catch (erro) {
  console.log(`⚠️ Axios erro: ${erro.message}`);
}

if (tentativa < tentativas) {
  await new Promise(resolve => setTimeout(resolve, 1500));
}
```

}

return null;
}

// ============================================================
// UTILIDADES
// ============================================================

function normalizarTexto(texto) {
return String(texto || "")
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/\s+/g, " ")
.trim();
}

function urlValida(url) {
return (
typeof url === "string" &&
/^https?:///i.test(url)
);
}

function tituloValido(titulo) {
const t = String(titulo || "").trim();

if (t.length < 15) return false;

const invalido = [
"noticias",
"próxima página",
"proxima pagina",
"next page",
"previous page",
"pagina anterior",
"1",
"2",
"3",
"4",
"5"
];

if (invalido.includes(normalizarTexto(t))) {
return false;
}

return true;
}

function dataRecente(data) {
if (!data) return true;

const d = new Date(data);

if (Number.isNaN(d.getTime())) {
return true;
}

const limite =
Date.now() -
DIAS_MAXIMOS_NOTICIA * 24 * 60 * 60 * 1000;

return d.getTime() >= limite;
}

function limparDescricao(texto) {
if (!texto) return "";

return String(texto)
.replace(/\s+/g, " ")
.trim()
.slice(0, 900);
}

function extrairData(valor) {
if (!valor) return null;

const d = new Date(valor);

if (Number.isNaN(d.getTime())) {
return null;
}

return d;
}

// ============================================================
// DUPLICAÇÃO
// ============================================================

async function noticiaJaPublicada(canal, noticia) {
try {
const mensagens = await canal.messages.fetch({
limit: 100
});

```
const urlNova = String(noticia.url || "").trim();
const tituloNovo = normalizarTexto(noticia.titulo);

for (const [, mensagem] of mensagens) {
  if (!mensagem.embeds || mensagem.embeds.length === 0) {
    continue;
  }

  for (const embed of mensagem.embeds) {
    const urlExistente = String(embed.url || "").trim();

    if (
      urlNova &&
      urlExistente &&
      urlNova === urlExistente
    ) {
      return true;
    }

    const tituloExistente = normalizarTexto(
      embed.title
    );

    if (
      tituloNovo &&
      tituloExistente &&
      tituloNovo === tituloExistente
    ) {
      return true;
    }
  }
}
```

} catch (erro) {
console.log(
`⚠️ Erro verificando duplicata: ${erro.message}`
);
}

return false;
}

// ============================================================
// IMAGEM — UTILIDADES
// ============================================================

function escolherImagem(imagens) {
const lista = [
...new Set(
(imagens || [])
.filter(urlValida)
.map(x => String(x).trim())
.filter(Boolean)
)
];

if (!lista.length) {
return null;
}

// Preferir imagens maiores/mais completas quando possível.
const preferidas = lista.filter(url =>
/jpg|jpeg|png|webp/i.test(url)
);

return preferidas[0] || lista[0];
}

// ============================================================
// FORTNITE.GG
// ============================================================

async function buscarFortniteGG() {
let page = null;

try {
console.log(
"🔎 Fortnite: tentando Fortnite.GG via navegador..."
);

```
page = await abrirPagina(
  "https://fortnite.gg/news",
  3500
);

if (!page) {
  return [];
}

// Pequeno scroll para forçar lazy-loading.
await page.evaluate(async () => {
  window.scrollTo(0, document.body.scrollHeight * 0.5);
});

await new Promise(resolve => setTimeout(resolve, 1200));

const candidatos = await page.evaluate(() => {
  const resultado = [];

  const anchors = [
    ...document.querySelectorAll("a[href]")
  ];

  for (const a of anchors) {
    const href = a.href || "";

    if (!href) continue;

    let url;

    try {
      url = new URL(href, location.href).href;
    } catch {
      continue;
    }

    if (!/fortnite\.gg/i.test(url)) {
      continue;
    }

    const path = url.pathname || "";

    // Aceitar páginas individuais de notícias.
    if (!/^\/news\/.+/i.test(path)) {
      continue;
    }

    if (
      /^\/news\/?$/i.test(path) ||
      /\/page\/?\d*$/i.test(path)
    ) {
      continue;
    }

    const texto =
      a.innerText ||
      a.textContent ||
      "";

    let titulo = texto.trim();

    const heading = a.querySelector(
      "h1,h2,h3,h4,h5,h6"
    );

    if (heading) {
      titulo =
        heading.innerText ||
        heading.textContent ||
        titulo;
    }

    titulo = titulo
      .replace(/\s+/g, " ")
      .trim();

    if (titulo.length < 15) {
      continue;
    }

    const imagens = [];

    const imgs = [
      ...a.querySelectorAll("img")
    ];

    for (const img of imgs) {
      const attrs = [
        img.currentSrc,
        img.src,
        img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"),
        img.getAttribute("data-original"),
        img.getAttribute("data-image")
      ];

      for (const imagem of attrs) {
        if (imagem) {
          try {
            imagens.push(
              new URL(imagem, location.href).href
            );
          } catch {}
        }
      }

      const srcset =
        img.getAttribute("srcset") ||
        img.getAttribute("data-srcset");

      if (srcset) {
        const primeiro = srcset
          .split(",")[0]
          .trim()
          .split(" ")[0];

        if (primeiro) {
          try {
            imagens.push(
              new URL(
                primeiro,
                location.href
              ).href
            );
          } catch {}
        }
      }
    }

    const parent =
      a.closest("article,li,div");

    if (parent) {
      const parentImgs = [
        ...parent.querySelectorAll("img")
      ];

      for (const img of parentImgs) {
        const src =
          img.currentSrc ||
          img.src ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src");

        if (src) {
          try {
            imagens.push(
              new URL(
                src,
                location.href
              ).href
            );
          } catch {}
        }
      }
    }

    const p = a.querySelector("p");

    const descricao =
      p?.innerText ||
      p?.textContent ||
      "";

    resultado.push({
      titulo,
      url,
      descricao,
      imagem: imagens[0] || null
    });
  }

  return resultado;
});

console.log(
  `🔎 Fortnite.GG: ${candidatos.length} candidatos.`
);

await page.close();
page = null;

const unicos = [];
const urls = new Set();

for (const item of candidatos) {
  if (!tituloValido(item.titulo)) continue;

  if (urls.has(item.url)) continue;

  urls.add(item.url);
  unicos.push(item);
}

return unicos.slice(
  0,
  MAX_NOTICIAS_POR_FONTE
);
```

} catch (erro) {
console.log(
`❌ Fortnite.GG erro: ${erro.message}`
);

```
if (page) {
  try {
    await page.close();
  } catch {}
}

return [];
```

}
}

// ============================================================
// FORTNITE OFICIAL
// ============================================================

async function buscarFortniteOficial() {
const urls = [
"https://www.fortnite.com/news?lang=pt-BR",
"https://www.fortnite.com/news/tag/all-news?lang=pt-BR"
];

for (const url of urls) {
let page = null;

```
try {
  console.log(
    `↩️ Fortnite: tentando fonte oficial...`
  );

  page = await abrirPagina(url, 3000);

  if (!page) {
    continue;
  }

  const candidatos = await page.evaluate(() => {
    const resultado = [];

    for (const a of document.querySelectorAll(
      "a[href]"
    )) {
      const href = a.href || "";

      if (
        !href.includes("fortnite.com/news/")
      ) {
        continue;
      }

      const texto =
        a.innerText ||
        a.textContent ||
        "";

      let titulo = texto
        .replace(/\s+/g, " ")
        .trim();

      const heading = a.querySelector(
        "h1,h2,h3,h4,h5,h6"
      );

      if (heading) {
        titulo =
          heading.innerText ||
          heading.textContent ||
          titulo;
      }

      titulo = titulo
        .replace(/\s+/g, " ")
        .trim();

      if (titulo.length < 15) continue;

      const imgs = [
        ...a.querySelectorAll("img")
      ];

      let imagem = null;

      for (const img of imgs) {
        imagem =
          img.currentSrc ||
          img.src ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original");

        if (imagem) break;
      }

      const p = a.querySelector("p");

      resultado.push({
        titulo,
        url: href,
        descricao:
          p?.innerText ||
          p?.textContent ||
          "",
        imagem
      });
    }

    return resultado;
  });

  await page.close();
  page = null;

  const unicos = [];
  const urlsVistas = new Set();

  for (const item of candidatos) {
    if (!tituloValido(item.titulo)) continue;

    if (urlsVistas.has(item.url)) continue;

    urlsVistas.add(item.url);
    unicos.push(item);
  }

  if (unicos.length) {
    return unicos.slice(
      0,
      MAX_NOTICIAS_POR_FONTE
    );
  }

} catch (erro) {
  console.log(
    `⚠️ Fortnite oficial erro: ${erro.message}`
  );

  if (page) {
    try {
      await page.close();
    } catch {}
  }
}
```

}

return [];
}

// ============================================================
// FORTNITE
// SEM GOOGLE NEWS
// ============================================================

async function buscarFortnite() {
let noticias = await buscarFortniteGG();

if (noticias.length) {
return noticias;
}

console.log(
"↩️ Fortnite.GG falhou. Tentando oficial..."
);

noticias = await buscarFortniteOficial();

if (noticias.length) {
return noticias;
}

console.log(
"⚠️ Fortnite: nenhuma fonte confiável disponível neste ciclo."
);

return [];
}

// ============================================================
// LIBERTYCITY
// ============================================================

async function buscarLibertyCity() {
let page = null;

try {
console.log(
"🔎 LibertyCity: tentando navegador..."
);

```
page = await abrirPagina(
  "https://pt.libertycity.net/news/",
  3000
);

if (!page) {
  return [];
}

const candidatos = await page.evaluate(() => {
  const resultado = [];

  for (const a of document.querySelectorAll(
    "a[href]"
  )) {
    const href = a.href || "";

    if (!/pt\.libertycity\.net\/news\//i.test(href)) {
      continue;
    }

    if (!/\.html(?:[?#].*)?$/i.test(href)) {
      continue;
    }

    const texto =
      a.innerText ||
      a.textContent ||
      "";

    let titulo = texto
      .replace(/\s+/g, " ")
      .trim();

    const heading = a.querySelector(
      "h1,h2,h3,h4,h5,h6"
    );

    if (heading) {
      titulo =
        heading.innerText ||
        heading.textContent ||
        titulo;
    }

    if (titulo.length < 15) {
      continue;
    }

    const lower = titulo.toLowerCase();

    if (
      lower.includes("próxima página") ||
      lower.includes("proxima pagina") ||
      lower === "notícias" ||
      /^[0-9]+$/.test(titulo)
    ) {
      continue;
    }

    const card =
      a.closest("article,li,div");

    const container = card || a;

    const img =
      container.querySelector("img");

    let imagem = null;

    if (img) {
      imagem =
        img.currentSrc ||
        img.src ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-original");
    }

    const p =
      container.querySelector("p");

    resultado.push({
      titulo,
      url: href,
      descricao:
        p?.innerText ||
        p?.textContent ||
        "",
      imagem
    });
  }

  return resultado;
});

console.log(
  `🔎 LibertyCity Puppeteer: ${candidatos.length} candidatos.`
);

await page.close();
page = null;

const unicos = [];
const urls = new Set();

for (const item of candidatos) {
  if (!tituloValido(item.titulo)) continue;

  const texto =
    normalizarTexto(item.titulo);

  // Evita matérias claramente não relacionadas ao GTA.
  if (
    !texto.includes("gta") &&
    !texto.includes("grand theft auto") &&
    !texto.includes("vice city") &&
    !texto.includes("los santos") &&
    !texto.includes("rockstar")
  ) {
    continue;
  }

  if (urls.has(item.url)) continue;

  urls.add(item.url);
  unicos.push(item);
}

return unicos.slice(
  0,
  MAX_NOTICIAS_POR_FONTE
);
```

} catch (erro) {
console.log(
`❌ LibertyCity erro: ${erro.message}`
);

```
if (page) {
  try {
    await page.close();
  } catch {}
}

return [];
```

}
}

// ============================================================
// EXTRAÇÃO DE IMAGEM DO CARD ROCKSTAR
// ============================================================

async function extrairCardRockstar(a) {
const resultado = await a.evaluate(anchor => {

```
function adicionarImagem(lista, valor) {
  if (!valor) return;

  let texto = String(valor).trim();

  // srcset
  if (texto.includes(",")) {
    texto = texto
      .split(",")[0]
      .trim()
      .split(" ")[0];
  }

  // background-image: url(...)
  const match = texto.match(
    /url\(["']?(.*?)["']?\)/i
  );

  if (match) {
    texto = match[1];
  }

  if (
    /^https?:\/\//i.test(texto)
  ) {
    lista.push(texto);
  }
}

const imagens = [];

// Percorrer o anchor e os pais.
let elemento = anchor;

for (let nivel = 0; nivel < 7 && elemento; nivel++) {

  const imgs = [
    ...elemento.querySelectorAll("img")
  ];

  for (const img of imgs) {
    adicionarImagem(
      imagens,
      img.currentSrc
    );

    adicionarImagem(
      imagens,
      img.src
    );

    adicionarImagem(
      imagens,
      img.getAttribute("data-src")
    );

    adicionarImagem(
      imagens,
      img.getAttribute("data-lazy-src")
    );

    adicionarImagem(
      imagens,
      img.getAttribute("data-original")
    );

    adicionarImagem(
      imagens,
      img.getAttribute("data-image")
    );

    adicionarImagem(
      imagens,
      img.getAttribute("srcset")
    );

    adicionarImagem(
      imagens,
      img.getAttribute("data-srcset")
    );
  }

  // picture/source
  const sources = [
    ...elemento.querySelectorAll(
      "source"
    )
  ];

  for (const source of sources) {
    adicionarImagem(
      imagens,
      source.getAttribute("src")
    );

    adicionarImagem(
      imagens,
      source.getAttribute("srcset")
    );
  }

  // background-image
  const elementos = [
    elemento,
    ...elemento.querySelectorAll("*")
  ];

  for (const el of elementos) {
    try {
      const bg =
        getComputedStyle(el)
          .backgroundImage;

      if (
        bg &&
        bg !== "none"
      ) {
        adicionarImagem(
          imagens,
          bg
        );
      }
    } catch {}
  }

  elemento = elemento.parentElement;
}

// Procurar descrição no card.
let descricao = "";

let card = anchor;

for (
  let nivel = 0;
  nivel < 6 && card;
  nivel++
) {
  const p = card.querySelector("p");

  if (
    p &&
    p.innerText &&
    p.innerText.trim().length > 20
  ) {
    descricao =
      p.innerText
        .replace(/\s+/g, " ")
        .trim();

    break;
  }

  card = card.parentElement;
}

return {
  imagens: [
    ...new Set(imagens)
  ],
  descricao
};
```

});

return resultado;
}

// ============================================================
// ROCKSTAR NEWSWIRE
// ============================================================

async function buscarRockstar() {
let page = null;

try {
console.log(
"🔎 Rockstar: abrindo Newswire..."
);

```
page = await abrirPagina(
  "https://www.rockstargames.com/br/newswire",
  4000
);

if (!page) {
  return [];
}

// Forçar carregamento de imagens lazy.
await page.evaluate(async () => {
  window.scrollTo(0, document.body.scrollHeight);

  await new Promise(resolve =>
    setTimeout(resolve, 1200)
  );

  window.scrollTo(0, 0);
});

await new Promise(resolve =>
  setTimeout(resolve, 1000)
);

const anchors = await page.$(
  'a[href*="/br/newswire/article/"]'
);

console.log(
  `🔎 Rockstar: ${anchors.length} artigos GTA encontrados.`
);

const resultado = [];

for (
  let i = 0;
  i < anchors.length;
  i++
) {
  const a = anchors[i];

  try {
    const dados = await a.evaluate(anchor => {

      let titulo =
        anchor.innerText ||
        anchor.textContent ||
        "";

      const heading =
        anchor.querySelector(
          "h1,h2,h3,h4,h5,h6"
        );

      if (heading) {
        titulo =
          heading.innerText ||
          heading.textContent ||
          titulo;
      }

      titulo = titulo
        .replace(/\s+/g, " ")
        .trim();

      return {
        titulo,
        url: anchor.href
      };
    });

    if (!tituloValido(dados.titulo)) {
      continue;
    }

    const texto =
      normalizarTexto(dados.titulo);

    // Somente GTA.
    if (
      !texto.includes("gta") &&
      !texto.includes("grand theft auto") &&
      !texto.includes("los santos") &&
      !texto.includes("vice city")
    ) {
      continue;
    }

    const card =
      await extrairCardRockstar(a);

    const imagem =
      escolherImagem(
        card.imagens
      );

    const descricao =
      limparDescricao(
        card.descricao
      );

    console.log(
      imagem
        ? `🖼️ COM imagem | ${dados.titulo}`
        : `🖼️ SEM imagem | ${dados.titulo}`
    );

    resultado.push({
      titulo: dados.titulo,
      url: dados.url,
      imagem,
      descricao
    });

  } catch (erro) {
    console.log(
      `⚠️ Erro lendo card Rockstar: ${erro.message}`
    );
  }
}

await page.close();
page = null;

const unicos = [];
const urls = new Set();

for (const item of resultado) {
  if (urls.has(item.url)) continue;

  urls.add(item.url);
  unicos.push(item);
}

return unicos.slice(
  0,
  MAX_NOTICIAS_POR_FONTE
);
```

} catch (erro) {
console.log(
`❌ Rockstar erro: ${erro.message}`
);

```
if (page) {
  try {
    await page.close();
  } catch {}
}

return [];
```

}
}

// ============================================================
// METADADOS DE ARTIGO INDIVIDUAL
// ============================================================

async function buscarMetadados(url) {
let page = null;

try {
console.log(
`📝 Buscando metadados: ${url}`
);

```
page = await abrirPagina(
  url,
  2500
);

if (!page) {
  return {};
}

const dados = await page.evaluate(() => {

  const getMeta = (...nomes) => {
    for (const nome of nomes) {
      const el =
        document.querySelector(
          `meta[property="${nome}"],meta[name="${nome}"]`
        );

      if (el?.content) {
        return el.content;
      }
    }

    return null;
  };

  return {
    titulo:
      getMeta("og:title") ||
      document.title,

    descricao:
      getMeta(
        "og:description",
        "description"
      ),

    imagem:
      getMeta(
        "og:image",
        "twitter:image"
      )
  };
});

await page.close();
page = null;

return {
  titulo: dados.titulo || "",
  descricao:
    limparDescricao(
      dados.descricao
    ),
  imagem:
    urlValida(dados.imagem)
      ? dados.imagem
      : null
};
```

} catch (erro) {
console.log(
`⚠️ Erro metadados: ${erro.message}`
);

```
if (page) {
  try {
    await page.close();
  } catch {}
}

return {};
```

}
}

// ============================================================
// PUBLICAÇÃO
// ============================================================

async function publicarNoticia(tipo, noticia) {
try {
const canalId =
tipo === "FORTNITE"
? ID_FORTNITE
: ID_GTA;

```
const canal =
  await client.channels.fetch(
    canalId
  );

if (!canal) {
  console.log(
    `❌ Canal ${tipo} não encontrado.`
  );

  return false;
}

if (
  await noticiaJaPublicada(
    canal,
    noticia
  )
) {
  console.log(
    `⏭️ ${tipo}: já publicada: ${noticia.titulo}`
  );

  return false;
}

let titulo =
  noticia.titulo;

let descricao =
  limparDescricao(
    noticia.descricao
  );

let imagem =
  urlValida(noticia.imagem)
    ? noticia.imagem
    : null;

// Só buscar metadados quando realmente
// não temos imagem E descrição.
if (
  !imagem &&
  !descricao &&
  noticia.url
) {
  console.log(
    `📝 ${tipo}: card sem imagem/descrição, tentando metadados...`
  );

  const meta =
    await buscarMetadados(
      noticia.url
    );

  if (meta.titulo) {
    titulo = meta.titulo;
  }

  if (meta.descricao) {
    descricao = meta.descricao;
  }

  if (meta.imagem) {
    imagem = meta.imagem;
  }
}

if (!descricao) {
  descricao =
    tipo === "FORTNITE"
      ? "🎮 Confira todos os detalhes desta novidade do Fortnite."
      : "🚔 Confira todos os detalhes desta novidade do GTA.";
}

descricao +=
  "\n\n👇 Clique no título acima para ler a matéria completa.";

const emoji =
  tipo === "FORTNITE"
    ? "🎮"
    : "🚔";

const footer =
  tipo === "FORTNITE"
    ? "Murilito NEWS • Fortnite"
    : "Murilito NEWS • GTA";

const embed = new EmbedBuilder()
  .setTitle(
    `${emoji} ${titulo}`
  )
  .setURL(noticia.url)
  .setDescription(descricao)
  .setFooter({
    text: footer
  })
  .setTimestamp();

if (imagem) {
  embed.setImage(imagem);
}

const mensagem =
  tipo === "FORTNITE"
    ? "@everyone 🎮 NOVIDADE DO FORTNITE! 🔥"
    : "@everyone 🚔 NOVIDADE DO GTA! 🔥";

try {
  await canal.send({
    content: mensagem,
    embeds: [embed]
  });

} catch (erroImagem) {

  // Se Discord rejeitar a imagem,
  // tenta publicar sem imagem.
  if (imagem) {
    console.log(
      `⚠️ ${tipo}: Discord rejeitou a imagem. Tentando sem imagem...`
    );

    const embedSemImagem =
      new EmbedBuilder()
        .setTitle(
          `${emoji} ${titulo}`
        )
        .setURL(noticia.url)
        .setDescription(descricao)
        .setFooter({
          text: footer
        })
        .setTimestamp();

    await canal.send({
      content: mensagem,
      embeds: [embedSemImagem]
    });

  } else {
    throw erroImagem;
  }
}

console.log(
  `📢 ${tipo}: notícia publicada: ${titulo}`
);

return true;
```

} catch (erro) {
console.log(
`❌ Erro publicando ${tipo}: ${erro.message}`
);

```
return false;
```

}
}

// ============================================================
// PROCESSAR FONTE
// ============================================================

async function processarFortnite() {
console.log(
"━━━━━━━━ Fortnite ━━━━━━━━"
);

const noticias =
await buscarFortnite();

if (!noticias.length) {
console.log(
"📊 Fortnite: 0 notícia(s) nova(s) publicada(s)."
);

```
return;
```

}

let publicadas = 0;

for (const noticia of noticias) {

```
if (
  publicadas >=
  MAX_NOTICIAS_POR_FONTE
) {
  break;
}

const sucesso =
  await publicarNoticia(
    "FORTNITE",
    noticia
  );

if (sucesso) {
  publicadas++;
}
```

}

console.log(
`📊 Fortnite: ${publicadas} notícia(s) nova(s) publicada(s).`
);
}

async function processarLiberty() {
console.log(
"━━━━━━━━ LibertyCity ━━━━━━━━"
);

const noticias =
await buscarLibertyCity();

if (!noticias.length) {
console.log(
"📊 LibertyCity: 0 notícia(s) nova(s) publicada(s)."
);

```
return;
```

}

let publicadas = 0;

for (const noticia of noticias) {

```
if (
  publicadas >=
  MAX_NOTICIAS_POR_FONTE
) {
  break;
}

const sucesso =
  await publicarNoticia(
    "GTA",
    noticia
  );

if (sucesso) {
  publicadas++;
}
```

}

console.log(
`📊 LibertyCity: ${publicadas} notícia(s) nova(s) publicada(s).`
);
}

async function processarRockstar() {
console.log(
"━━━━━━━━ Rockstar ━━━━━━━━"
);

const noticias =
await buscarRockstar();

if (!noticias.length) {
console.log(
"📊 Rockstar: 0 notícia(s) nova(s) publicada(s)."
);

```
return;
```

}

let publicadas = 0;

for (const noticia of noticias) {

```
if (
  publicadas >=
  MAX_NOTICIAS_POR_FONTE
) {
  break;
}

const sucesso =
  await publicarNoticia(
    "GTA",
    noticia
  );

if (sucesso) {
  publicadas++;
}
```

}

console.log(
`📊 Rockstar: ${publicadas} notícia(s) nova(s) publicada(s).`
);
}

// ============================================================
// CICLO DE NOTÍCIAS
// ============================================================

let cicloExecutando = false;

async function cicloNoticias() {

if (cicloExecutando) {
console.log(
"⏳ Ciclo já está em andamento. Ignorando nova chamada."
);

```
return;
```

}

cicloExecutando = true;

console.log(
"========================================"
);

console.log(
"📰 INICIANDO CICLO DE NOTÍCIAS"
);

console.log(
"========================================"
);

console.log(
`🇧🇷 ${new Date().toLocaleString(
      "pt-BR",
      {
        timeZone: "America/Sao_Paulo"
      }
    )}`
);

try {

```
await processarFortnite();

await processarLiberty();

await processarRockstar();
```

} catch (erro) {

```
console.log(
  `❌ Erro geral no ciclo: ${erro.message}`
);
```

} finally {

```
cicloExecutando = false;

console.log(
  "========================================"
);

console.log(
  "✅ CICLO DE NOTÍCIAS FINALIZADO"
);

console.log(
  "========================================"
);
```

}
}

// ============================================================
// LOJA DO FORTNITE
// ============================================================

let ultimaLoja = null;

async function publicarLoja() {
try {

```
const canal =
  await client.channels.fetch(
    ID_LOJA
  );

if (!canal) {
  console.log(
    "❌ Canal da loja não encontrado."
  );

  return;
}

const hoje =
  new Date().toLocaleDateString(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo"
    }
  );

if (ultimaLoja === hoje) {
  console.log(
    "⏭️ Loja já publicada hoje."
  );

  return;
}

const embed =
  new EmbedBuilder()
    .setTitle(
      "🛒 LOJA DO FORTNITE ATUALIZADA!"
    )
    .setURL(
      LOJA_FORTNITE
    )
    .setDescription(
      "🔥 A Loja de Itens do Fortnite acabou de atualizar!\n\n" +
      "👀 Confira todas as skins, picaretas, gestos, mochilas e outros itens disponíveis hoje.\n\n" +
      "👇 Clique no título acima para abrir a loja oficial."
    )
    .setImage(
      "https://fortnite.gg/img/og-shop.jpg"
    )
    .setFooter({
      text:
        "Murilito NEWS • Loja Fortnite"
    })
    .setTimestamp();

await canal.send({
  content:
    "@everyone 🛒 CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR! 🔥",
  embeds: [embed]
});

ultimaLoja = hoje;

console.log(
  "🛒 Loja do Fortnite publicada."
);
```

} catch (erro) {

```
console.log(
  `❌ Erro publicando loja: ${erro.message}`
);
```

}
}

// ============================================================
// HORÁRIO DA LOJA
// ============================================================

function verificarHorarioLoja() {

const agora =
new Date();

const partes =
new Intl.DateTimeFormat(
"pt-BR",
{
timeZone:
"America/Sao_Paulo",
hour: "2-digit",
minute: "2-digit",
hour12: false
}
).formatToParts(agora);

const hora = Number(
partes.find(
p => p.type === "hour"
)?.value
);

const minuto = Number(
partes.find(
p => p.type === "minute"
)?.value
);

if (
hora === 21 &&
minuto === 0
) {
publicarLoja();
}
}

// ============================================================
// COMANDOS
// ============================================================

client.on(
"messageCreate",
async message => {

```
if (message.author.bot) {
  return;
}

const comando =
  message.content
    .trim()
    .toLowerCase();

try {

  if (comando === "!teste") {
    await cicloNoticias();
    return;
  }

  if (
    comando ===
    "!teste fortnite"
  ) {
    await processarFortnite();
    return;
  }

  if (
    comando ===
    "!teste liberty"
  ) {
    await processarLiberty();
    return;
  }

  if (
    comando ===
    "!teste rockstar"
  ) {
    await processarRockstar();
    return;
  }

  if (
    comando ===
    "!teste loja"
  ) {
    await publicarLoja();
    return;
  }

  if (
    comando ===
    "!piada"
  ) {

    const piadas = [
      "😂 Por que o PC foi ao médico? Porque estava com muitos bugs!",
      "🤣 Meu GTA não trava... ele só faz uma pausa dramática.",
      "😂 O Fortnite pediu férias porque estava cansado de cair do ônibus.",
      "🤣 Meu computador é tão forte que roda GTA... mas só o menu.",
      "😂 Fui jogar GTA e acabei dirigindo igual na vida real: sem saber onde estava indo."
    ];

    const piada =
      piadas[
        Math.floor(
          Math.random() *
          piadas.length
        )
      ];

    await message.reply(
      piada
    );

    return;
  }

  if (
    comando ===
    "!ajuda"
  ) {

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🤖 Murilito NEWS — Comandos"
        )
        .setDescription(
          [
            "`!teste` — Testa todas as notícias",
            "`!teste fortnite` — Testa Fortnite",
            "`!teste liberty` — Testa LibertyCity",
            "`!teste rockstar` — Testa Rockstar",
            "`!teste loja` — Testa a Loja do Fortnite",
            "`!piada` — Manda uma piada",
            "`!ajuda` — Mostra esta mensagem"
          ].join("\n")
        )
        .setFooter({
          text:
            "Murilito NEWS"
        });

    await message.reply({
      embeds: [embed]
    });

    return;
  }

} catch (erro) {

  console.log(
    `❌ Erro no comando: ${erro.message}`
  );
}
```

}
);

// ============================================================
// BOT ONLINE
// ============================================================

client.once(
"clientReady",
async () => {

```
console.log(
  "========================================"
);

console.log(
  `🤖 ${client.user.tag} está ONLINE!`
);

console.log(
  "========================================"
);

console.log(
  `🛒 Canal Loja: ${ID_LOJA}`
);

console.log(
  `🎮 Canal Fortnite: ${ID_FORTNITE}`
);

console.log(
  `🚔 Canal GTA: ${ID_GTA}`
);

console.log(
  "========================================"
);

// Primeiro ciclo.
await cicloNoticias();

// Notícias a cada 10 minutos.
setInterval(
  () => {
    cicloNoticias();
  },
  INTERVALO_NOTICIAS
);

// Verificação da loja.
setInterval(
  verificarHorarioLoja,
  30 * 1000
);

console.log(
  "⏰ Sistema automático iniciado."
);

console.log(
  "📰 Notícias: a cada 10 minutos."
);

console.log(
  "🛒 Loja: diariamente às 21:00."
);

console.log(
  "========================================"
);
```

}
);

// ============================================================
// ERROS
// ============================================================

process.on(
"unhandledRejection",
erro => {
console.log(
"⚠️ Unhandled Rejection:",
erro?.message ||
erro
);
}
);

process.on(
"uncaughtException",
erro => {
console.log(
"⚠️ Uncaught Exception:",
erro?.message ||
erro
);
}
);

// ============================================================
// ENCERRAMENTO
// ============================================================

async function encerrar() {

console.log(
"🛑 Encerrando Murilito NEWS..."
);

await fecharBrowser();

try {
client.destroy();
} catch {}

process.exit(0);
}

process.on(
"SIGINT",
encerrar
);

process.on(
"SIGTERM",
encerrar
);

// ============================================================
// LOGIN
// ============================================================

if (!TOKEN) {

console.error(
"❌ ERRO: variável TOKEN não encontrada."
);

process.exit(1);
}

client.login(TOKEN);
