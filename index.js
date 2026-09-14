require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

// ======================================================
// CONFIGURAÇÃO
// ======================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado nas variáveis do Railway.");
  process.exit(1);
}

// IDs DOS CANAIS
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// URLs
const FORTNITE_NEWS = "https://fortnite.gg/news";
const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

const LIBERTYCITY_NEWS =
  "https://pt.libertycity.net/news/";

// Intervalos
const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const INTERVALO_LOJA = 30 * 1000;

// Quantidade máxima por ciclo
const MAX_NOTICIAS_FORTNITE = 3;
const MAX_NOTICIAS_GTA = 3;

// ======================================================
// CLIENT DISCORD
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
// AXIOS
// ======================================================

const http = axios.create({
  timeout: 30000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language":
      "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  }
});

// ======================================================
// PUPPETEER
// ======================================================

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

// ======================================================
// RETRY HTTP
// ======================================================

async function getComRetry(url, tentativas = 2) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${i}/${tentativas}`
      );

      const response = await http.get(url);

      console.log(
        `✅ HTTP ${response.status} | ${url}`
      );

      return response.data;
    } catch (error) {
      const status = error.response?.status;

      console.log(
        `⚠️ Falha HTTP: ${status || error.message} | ${url}`
      );

      if (i === tentativas) {
        return null;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  return null;
}

// ======================================================
// LIMPAR TEXTO
// ======================================================

function limparTexto(texto) {
  if (!texto) return "";

  return texto
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

// ======================================================
// LIMITAR TEXTO
// ======================================================

function limitarTexto(texto, limite = 500) {
  texto = limparTexto(texto);

  if (!texto) {
    return "Confira todos os detalhes da notícia.";
  }

  if (texto.length <= limite) {
    return texto;
  }

  return texto.substring(0, limite - 3).trim() + "...";
}

// ======================================================
// FRASES
// ======================================================

const frasesFortnite = [
  "🔥 Tem novidade nova no Fortnite!",
  "🎮 Saiu notícia nova do Fortnite!",
  "🚨 Atenção, comunidade Fortnite!",
  "👀 Olha essa novidade no Fortnite!",
  "⚡ Novidades fresquinhas do Fortnite!",
  "📰 Acabou de sair notícia nova do Fortnite!"
];

const frasesGTA = [
  "🚨 Saiu notícia nova sobre GTA!",
  "🔥 Novidade quente no universo GTA!",
  "🚔 Atenção, comunidade GTA!",
  "👀 Olha essa novidade sobre GTA!",
  "📰 Acabou de sair notícia nova do GTA!",
  "💥 Tem novidade nova no mundo do GTA!"
];

function escolherFrase(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// ======================================================
// VERIFICAR DUPLICADA
// ======================================================

async function jaFoiPublicada(canal, url) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100
    });

    const urlNormalizada = url.split("?")[0].replace(/\/$/, "");

    for (const [, mensagem] of mensagens) {
      if (!mensagem.embeds?.length) continue;

      for (const embed of mensagem.embeds) {
        if (!embed.url) continue;

        const embedUrl = embed.url
          .split("?")[0]
          .replace(/\/$/, "");

        if (embedUrl === urlNormalizada) {
          return true;
        }
      }
    }

    return false;

  } catch (error) {
    console.error(
      "❌ Erro verificando duplicada:",
      error.message
    );

    return false;
  }
}

// ======================================================
// METADADOS DE UMA NOTÍCIA
// ======================================================

async function buscarMetadados(url) {
  try {
    const html = await getComRetry(url, 2);

    if (!html) {
      return {};
    }

    const $ = cheerio.load(html);

    const titulo =
      $("meta[property='og:title']").attr("content") ||
      $("meta[name='twitter:title']").attr("content") ||
      $("title").text() ||
      "";

    const descricao =
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content") ||
      $("meta[name='twitter:description']").attr("content") ||
      "";

    const imagem =
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      "";

    return {
      titulo: limparTexto(titulo),
      descricao: limparTexto(descricao),
      imagem
    };

  } catch (error) {
    console.log(
      `⚠️ Não foi possível obter metadados: ${error.message}`
    );

    return {};
  }
}

// ======================================================
// PUBLICAR NOTÍCIA
// ======================================================

async function publicarNoticia({
  canalId,
  titulo,
  url,
  descricao,
  imagem,
  tipo
}) {
  try {
    const canal = await client.channels.fetch(canalId);

    if (!canal) {
      console.error(
        `❌ Canal não encontrado: ${canalId}`
      );
      return false;
    }

    if (await jaFoiPublicada(canal, url)) {
      console.log(
        `⏭️ ${tipo}: já publicada: ${titulo}`
      );

      return false;
    }

    let frase;

    if (tipo === "Fortnite") {
      frase = escolherFrase(frasesFortnite);
    } else {
      frase = escolherFrase(frasesGTA);
    }

    const embed = new EmbedBuilder()
      .setTitle(titulo || `Nova notícia de ${tipo}`)
      .setURL(url)
      .setDescription(
        `📝 ${limitarTexto(descricao, 650)}\n\n` +
        `👇 **Clique no título acima para ler a matéria completa.**`
      )
      .setFooter({
        text: `Murilito NEWS • ${tipo}`
      })
      .setTimestamp();

    if (imagem) {
      embed.setImage(imagem);
    }

    await canal.send({
      content: `@everyone ${frase}`,
      embeds: [embed]
    });

    console.log(
      `📢 ${tipo}: notícia publicada: ${titulo}`
    );

    return true;

  } catch (error) {
    console.error(
      `❌ Erro publicando ${tipo}:`,
      error.message
    );

    return false;
  }
}

// ======================================================
// FORTNITE.GG
// ======================================================

async function buscarFortnite() {
  console.log(
    "🔎 Fortnite: buscando no Fortnite.GG..."
  );

  const html = await getComRetry(
    FORTNITE_NEWS,
    2
  );

  if (!html) {
    console.log(
      "⚠️ Fortnite.GG não respondeu."
    );
    return [];
  }

  const $ = cheerio.load(html);

  const noticias = [];
  const urlsVistas = new Set();

  // Procura links de notícias
  $("a[href*='/news/']").each((i, el) => {
    try {
      const href = $(el).attr("href");

      if (!href) return;

      if (
        href === "/news" ||
        href === "/news/" ||
        href.startsWith("/news?") ||
        href.includes("/news/tag/")
      ) {
        return;
      }

      let url;

      try {
        url = new URL(
          href,
          "https://fortnite.gg"
        ).href;
      } catch {
        return;
      }

      if (!url.includes("fortnite.gg/news/")) {
        return;
      }

      const urlNormalizada =
        url.split("?")[0].replace(/\/$/, "");

      if (urlsVistas.has(urlNormalizada)) {
        return;
      }

      urlsVistas.add(urlNormalizada);

      // Tenta achar título dentro do card
      let titulo =
        $(el)
          .find("h1,h2,h3,h4,h5,h6")
          .first()
          .text();

      if (!titulo) {
        titulo = $(el).text();
      }

      titulo = limparTexto(titulo);

      // Ignorar textos pequenos ou links genéricos
      if (
        !titulo ||
        titulo.length < 8 ||
        titulo.toLowerCase() === "fortnite news"
      ) {
        return;
      }

      // Imagem
      let imagem =
        $(el).find("img").first().attr("src") ||
        $(el).find("img").first().attr("data-src") ||
        "";

      if (imagem) {
        try {
          imagem = new URL(
            imagem,
            "https://fortnite.gg"
          ).href;
        } catch {}
      }

      // Tenta pegar preview do próprio card
      let descricao = "";

      const textos = $(el)
        .find("p")
        .map((i, p) => $(p).text())
        .get();

      if (textos.length) {
        descricao = limparTexto(
          textos.join(" ")
        );
      }

      noticias.push({
        titulo,
        url: urlNormalizada,
        imagem,
        descricao
      });

    } catch {}
  });

  console.log(
    `🔎 Fortnite.GG: ${noticias.length} possíveis notícias encontradas.`
  );

  return noticias;
}

// ======================================================
// PROCESSAR FORTNITE
// ======================================================

async function processarFortnite() {
  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

  const noticias = await buscarFortnite();

  if (!noticias.length) {
    console.log(
      "⚠️ Fortnite: nenhuma notícia encontrada."
    );
    return;
  }

  let publicadas = 0;

  for (const noticia of noticias) {
    if (
      publicadas >= MAX_NOTICIAS_FORTNITE
    ) {
      break;
    }

    console.log(
      `🔎 Fortnite: ${noticia.titulo}`
    );

    let titulo = noticia.titulo;
    let descricao = noticia.descricao;
    let imagem = noticia.imagem;

    // Se o card não trouxe informações suficientes,
    // abre a matéria para pegar metadados.
    if (
      !descricao ||
      !imagem ||
      !titulo
    ) {
      console.log(
        "📝 Fortnite: buscando dados completos da matéria..."
      );

      const meta =
        await buscarMetadados(noticia.url);

      titulo =
        meta.titulo ||
        titulo;

      descricao =
        meta.descricao ||
        descricao;

      imagem =
        meta.imagem ||
        imagem;
    }

    const publicou =
      await publicarNoticia({
        canalId: ID_FORTNITE,
        titulo,
        url: noticia.url,
        descricao,
        imagem,
        tipo: "Fortnite"
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 Fortnite: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}

// ======================================================
// LIBERTYCITY
// ======================================================

async function buscarLibertyCity() {
  console.log(
    "🔎 LibertyCity: buscando notícias."
  );

  const html = await getComRetry(
    LIBERTYCITY_NEWS,
    2
  );

  if (!html) {
    console.log(
      "⚠️ LibertyCity não respondeu."
    );
    return [];
  }

  const $ = cheerio.load(html);

  const noticias = [];
  const urlsVistas = new Set();

  $("a").each((i, el) => {
    try {
      const href = $(el).attr("href");

      if (!href) return;

      let url;

      try {
        url = new URL(
          href,
          "https://pt.libertycity.net"
        ).href;
      } catch {
        return;
      }

      if (
        !url.includes(
          "pt.libertycity.net/news/"
        )
      ) {
        return;
      }

      if (
        url === "https://pt.libertycity.net/news/" ||
        url.includes("/page/")
      ) {
        return;
      }

      const urlNormalizada =
        url.split("?")[0].replace(/\/$/, "");

      if (urlsVistas.has(urlNormalizada)) {
        return;
      }

      urlsVistas.add(urlNormalizada);

      let titulo =
        $(el)
          .find("h1,h2,h3,h4,h5")
          .first()
          .text();

      if (!titulo) {
        titulo = $(el).text();
      }

      titulo = limparTexto(titulo);

      if (
        !titulo ||
        titulo.length < 10 ||
        titulo.length > 250
      ) {
        return;
      }

      // Evita links genéricos
      const tituloLower =
        titulo.toLowerCase();

      if (
        tituloLower.includes("próxima página") ||
        tituloLower.includes("anterior") ||
        tituloLower === "notícias"
      ) {
        return;
      }

      let imagem =
        $(el)
          .find("img")
          .first()
          .attr("src") ||
        $(el)
          .find("img")
          .first()
          .attr("data-src") ||
        "";

      if (imagem) {
        try {
          imagem = new URL(
            imagem,
            "https://pt.libertycity.net"
          ).href;
        } catch {}
      }

      let descricao = "";

      const textos = $(el)
        .find("p")
        .map((i, p) => $(p).text())
        .get();

      if (textos.length) {
        descricao = limparTexto(
          textos.join(" ")
        );
      }

      noticias.push({
        titulo,
        url: urlNormalizada,
        imagem,
        descricao
      });

    } catch {}
  });

  console.log(
    `🔎 LibertyCity: ${noticias.length} notícias encontradas.`
  );

  return noticias;
}

// ======================================================
// PROCESSAR LIBERTYCITY
// ======================================================

async function processarLibertyCity() {
  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  const noticias =
    await buscarLibertyCity();

  if (!noticias.length) {
    console.log(
      "⚠️ GTA: nenhuma notícia encontrada."
    );
    return;
  }

  let publicadas = 0;

  for (const noticia of noticias) {
    if (
      publicadas >= MAX_NOTICIAS_GTA
    ) {
      break;
    }

    let titulo = noticia.titulo;
    let descricao = noticia.descricao;
    let imagem = noticia.imagem;

    if (
      !descricao ||
      !imagem
    ) {
      console.log(
        `📝 GTA: buscando imagem e preview...`
      );

      const meta =
        await buscarMetadados(noticia.url);

      titulo =
        meta.titulo ||
        titulo;

      descricao =
        meta.descricao ||
        descricao;

      imagem =
        meta.imagem ||
        imagem;
    }

    const publicou =
      await publicarNoticia({
        canalId: ID_GTA,
        titulo,
        url: noticia.url,
        descricao,
        imagem,
        tipo: "GTA"
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 GTA: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}

// ======================================================
// ROCKSTAR — TENTATIVA COM PUPPETEER
// ======================================================

async function buscarRockstarPuppeteer() {
  console.log(
    "🔎 Rockstar: buscando no Newswire oficial com navegador."
  );

  let page = null;

  try {
    const browser =
      await getBrowser();

    page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    await page.setViewport({
      width: 1440,
      height: 1000
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language":
        "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
    });

    const url =
      "https://www.rockstargames.com/br/newswire";

    console.log(
      `🌐 Puppeteer: abrindo ${url}`
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await new Promise(resolve =>
      setTimeout(resolve, 5000)
    );

    const noticias =
      await page.evaluate(() => {
        const resultado = [];
        const vistos = new Set();

        document
          .querySelectorAll(
            'a[href*="/newswire/article/"]'
          )
          .forEach(a => {
            const href = a.href;

            if (!href) return;

            const url =
              href.split("?")[0];

            if (vistos.has(url)) {
              return;
            }

            vistos.add(url);

            const heading =
              a.querySelector(
                "h1,h2,h3,h4,h5,h6"
              );

            let titulo =
              heading?.innerText ||
              a.innerText ||
              "";

            titulo =
              titulo
                .replace(/\s+/g, " ")
                .trim();

            if (
              !titulo ||
              titulo.length < 8
            ) {
              return;
            }

            const img =
              a.querySelector("img");

            const imagem =
              img?.src ||
              img?.getAttribute(
                "data-src"
              ) ||
              "";

            resultado.push({
              titulo,
              url,
              imagem
            });
          });

        return resultado;
      });

    console.log(
      `🔎 Rockstar: ${noticias.length} artigos encontrados pelo navegador.`
    );

    return noticias;

  } catch (error) {
    console.error(
      "❌ Rockstar Puppeteer:",
      error.message
    );

    return [];

  } finally {
    if (page) {
      try {
        await page.close();
      } catch {}
    }
  }
}

// ======================================================
// FILTRO GTA PARA ROCKSTAR
// ======================================================

function pareceGTA(titulo) {
  const texto =
    titulo.toLowerCase();

  const termos = [
    "gta",
    "grand theft auto",
    "gta online",
    "grand theft auto vi",
    "gta vi",
    "gta 6",
    "vice city",
    "los santos"
  ];

  return termos.some(
    termo => texto.includes(termo)
  );
}

// ======================================================
// PROCESSAR ROCKSTAR
// ======================================================

async function processarRockstar() {
  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  const noticias =
    await buscarRockstarPuppeteer();

  if (!noticias.length) {
    console.log(
      "⚠️ Rockstar: nenhum artigo encontrado."
    );
    return;
  }

  let publicadas = 0;

  for (const noticia of noticias) {
    if (
      publicadas >= MAX_NOTICIAS_GTA
    ) {
      break;
    }

    if (!pareceGTA(noticia.titulo)) {
      continue;
    }

    let titulo = noticia.titulo;
    let descricao = "";
    let imagem = noticia.imagem;

    console.log(
      `🔎 Rockstar GTA: ${titulo}`
    );

    const meta =
      await buscarMetadados(noticia.url);

    titulo =
      meta.titulo ||
      titulo;

    descricao =
      meta.descricao ||
      "";

    imagem =
      meta.imagem ||
      imagem;

    const publicou =
      await publicarNoticia({
        canalId: ID_GTA,
        titulo,
        url: noticia.url,
        descricao,
        imagem,
        tipo: "GTA"
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 Rockstar: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}

// ======================================================
// LOJA DO FORTNITE
// ======================================================

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {
      console.error(
        "❌ Canal da loja não encontrado."
      );
      return;
    }

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setURL(LOJA_FORTNITE)
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
        "@everyone 🛒 **CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR!** 🔥",
      embeds: [embed]
    });

    console.log(
      "🛒 Loja do Fortnite publicada."
    );

  } catch (error) {
    console.error(
      "❌ Erro publicando loja:",
      error.message
    );
  }
}

// ======================================================
// CONTROLE DA LOJA
// ======================================================

let ultimoDiaLoja = null;

function dataBrasil() {
  const agora =
    new Date();

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(agora);
}

async function verificarHorarioLoja() {
  const agora =
    new Date();

  const brasil =
    new Intl.DateTimeFormat(
      "pt-BR",
      {
        timeZone:
          "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    ).format(agora);

  const [hora, minuto] =
    brasil.split(":").map(Number);

  const hoje =
    dataBrasil();

  // Entre 21:00 e 21:05
  if (
    hora === 21 &&
    minuto >= 0 &&
    minuto <= 5 &&
    ultimoDiaLoja !== hoje
  ) {
    console.log(
      "🛒 Horário da loja atingido. Publicando..."
    );

    await publicarLoja();

    ultimoDiaLoja =
      hoje;
  }
}

// ======================================================
// CICLO COMPLETO
// ======================================================

let cicloExecutando = false;

async function cicloNoticias() {
  if (cicloExecutando) {
    console.log(
      "⏳ Ciclo anterior ainda está executando."
    );
    return;
  }

  cicloExecutando = true;

  console.log(
    "\n========================================"
  );

  console.log(
    "📰 INICIANDO CICLO DE NOTÍCIAS"
  );

  console.log(
    "========================================"
  );

  console.log(
    "🇧🇷 " +
      new Date().toLocaleString(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo"
        }
      )
  );

  console.log(
    "========================================"
  );

  try {
    // Fortnite
    await processarFortnite();

    // GTA / LibertyCity
    await processarLibertyCity();

    // Rockstar oficial
    await processarRockstar();

  } catch (error) {
    console.error(
      "❌ Erro geral no ciclo:",
      error.message
    );

  } finally {
    console.log(
      "========================================"
    );

    console.log(
      "✅ CICLO DE NOTÍCIAS FINALIZADO"
    );

    console.log(
      "========================================"
    );

    cicloExecutando = false;
  }
}

// ======================================================
// COMANDOS
// ======================================================

client.on(
  "messageCreate",
  async message => {

    if (
      message.author.bot
    ) {
      return;
    }

    const texto =
      message.content
        .trim()
        .toLowerCase();

    // --------------------------------------------
    // !teste
    // --------------------------------------------

    if (
      texto === "!teste"
    ) {
      await message.reply(
        "🧪 Iniciando teste completo..."
      );

      await cicloNoticias();

      return;
    }

    // --------------------------------------------
    // !teste fortnite
    // --------------------------------------------

    if (
      texto === "!teste fortnite"
    ) {
      await message.reply(
        "🎮 Testando notícias do Fortnite..."
      );

      await processarFortnite();

      return;
    }

    // --------------------------------------------
    // !teste liberty
    // --------------------------------------------

    if (
      texto === "!teste liberty"
    ) {
      await message.reply(
        "🚔 Testando LibertyCity..."
      );

      await processarLibertyCity();

      return;
    }

    // --------------------------------------------
    // !teste rockstar
    // --------------------------------------------

    if (
      texto === "!teste rockstar"
    ) {
      await message.reply(
        "🚨 Testando Rockstar Newswire..."
      );

      await processarRockstar();

      return;
    }

    // --------------------------------------------
    // !teste loja
    // --------------------------------------------

    if (
      texto === "!teste loja"
    ) {
      await message.reply(
        "🛒 Publicando teste da loja..."
      );

      await publicarLoja();

      return;
    }

    // --------------------------------------------
    // !piada
    // --------------------------------------------

    if (
      texto === "!piada"
    ) {
      const piadas = [
        "😂 O jogador disse que ia jogar só uma partida. Duas horas depois: 'só mais uma'.",
        "🤣 GTA 6 vai lançar antes do meu PC terminar de atualizar o Windows.",
        "😂 Fortnite: onde você cai para pegar uma arma e termina dançando com um banana.",
        "🤣 Eu não sou viciado em GTA. Só conheço Los Santos melhor que minha cidade."
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

    // --------------------------------------------
    // !ajuda
    // --------------------------------------------

    if (
      texto === "!ajuda"
    ) {
      const embed =
        new EmbedBuilder()
          .setTitle(
            "🤖 MURILITO NEWS"
          )
          .setDescription(
            "Confira os comandos disponíveis:"
          )
          .addFields(
            {
              name: "🧪 Testes",
              value:
                "`!teste`\n" +
                "`!teste fortnite`\n" +
                "`!teste liberty`\n" +
                "`!teste rockstar`\n" +
                "`!teste loja`"
            },
            {
              name: "😂 Diversão",
              value:
                "`!piada`"
            }
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
  }
);

// ======================================================
// BOT ONLINE
// ======================================================

client.once(
  "clientReady",
  async () => {

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

    // Primeiro ciclo imediatamente
    await cicloNoticias();

    // Notícias a cada 10 minutos
    setInterval(
      cicloNoticias,
      INTERVALO_NOTICIAS
    );

    // Verificação da loja a cada 30 segundos
    setInterval(
      verificarHorarioLoja,
      INTERVALO_LOJA
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
  }
);

// ======================================================
// ENCERRAMENTO LIMPO
// ======================================================

async function encerrar() {
  console.log(
    "🛑 Encerrando Murilito NEWS..."
  );

  try {
    if (browser) {
      await browser.close();
    }
  } catch {}

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

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
