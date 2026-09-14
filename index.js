require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const Parser = require("rss-parser");

// ======================================================
// CONFIGURAÇÃO
// ======================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado nas variáveis do Railway.");
  process.exit(1);
}

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const INTERVALO_LOJA = 30 * 1000;

const MAX_IDADE_NOTICIA_DIAS = 14;
const MAX_NOTICIAS_POR_FONTE = 3;

// Quantos resultados do Google News serão analisados.
// Não vamos mais analisar 52/100 links.
const MAX_GOOGLE_ITENS = 6;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
  },
});

const axiosConfig = {
  timeout: 15000,
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 400,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  },
};

// ======================================================
// FRASES
// ======================================================

const FRASES_FORTNITE = [
  "🎮 NOVIDADE QUENTE NO FORTNITE! 👀",
  "🔥 ACABOU DE SAIR! OLHA ESSA NOVIDADE DO FORTNITE!",
  "🚨 ATENÇÃO, PLAYERS! TEM NOVIDADE NOVA NO FORTNITE!",
  "👀 OLHA O QUE ACABOU DE SAIR NO FORTNITE!",
  "🔥 FORTNITE NÃO PARA! CONFIRA ESSA NOVIDADE!",
  "⚡ TEM NOVIDADE FRESQUINHA NO FORTNITE!",
];

const FRASES_GTA = [
  "🚨 NOVIDADE QUENTE NO UNIVERSO GTA! 👀",
  "🔥 ACABOU DE SAIR! OLHA ESSA NOVIDADE!",
  "👀 OLHA O QUE A ROCKSTAR ACABOU DE REVELAR!",
  "🚔 TEM NOVIDADE NO GTA! CONFIRA ESSA!",
  "🔥 MAIS UMA DO UNIVERSO GTA! NÃO PERDE ESSA!",
  "💥 GTA NÃO PARA! CONFIRA A NOVIDADE!",
];

const FRASES_GERAL = [
  "📰 ACABOU DE SAIR! 👀",
  "🔥 TEM NOVIDADE FRESQUINHA!",
  "🚨 ATENÇÃO! OLHA ESSA NOVIDADE!",
  "👀 VOCÊ PRECISA VER ESSA!",
  "🔥 NOVIDADE NOVA CHEGANDO NO MURILITO NEWS!",
];

// ======================================================
// FRASE DETERMINÍSTICA
// ======================================================

function gerarFrase(tipo, titulo = "") {
  let lista = FRASES_GERAL;

  if (tipo === "fortnite") {
    lista = FRASES_FORTNITE;
  }

  if (tipo === "gta") {
    lista = FRASES_GTA;
  }

  let soma = 0;

  for (let i = 0; i < titulo.length; i++) {
    soma += titulo.charCodeAt(i);
  }

  return lista[soma % lista.length];
}

// ======================================================
// RETRY
// ======================================================

async function getComRetry(url, tentativas = 2, configExtra = {}) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const resposta = await axios.get(url, {
        ...axiosConfig,
        ...configExtra,
      });

      console.log(`✅ HTTP ${resposta.status} | ${url}`);

      return resposta;
    } catch (erro) {
      const status = erro.response?.status || "sem resposta";

      console.log(
        `⚠️ Falha HTTP: ${status} | ${url}`
      );

      if (tentativa < tentativas) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1200)
        );
      }
    }
  }

  return null;
}

// ======================================================
// LIMPEZA DE TEXTO
// ======================================================

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function limitarTexto(texto, tamanho = 450) {
  texto = limparTexto(texto);

  if (texto.length <= tamanho) {
    return texto;
  }

  return texto.substring(0, tamanho - 3).trim() + "...";
}

// ======================================================
// DATA
// ======================================================

function dataBuscaGoogle() {
  const data = new Date();

  data.setDate(
    data.getDate() - MAX_IDADE_NOTICIA_DIAS
  );

  return data.toISOString().slice(0, 10);
}

// ======================================================
// URL
// ======================================================

function normalizarUrl(url) {
  if (!url) return null;

  try {
    const u = new URL(url);

    u.hash = "";

    // Remove parâmetros desnecessários
    u.search = "";

    return u.toString();
  } catch {
    return null;
  }
}

function ehGoogleNews(url) {
  if (!url) return true;

  return (
    url.includes("news.google.com") ||
    url.includes("google.com/rss")
  );
}

function ehFortnite(url) {
  if (!url) return false;

  return (
    url.includes("fortnite.com/news/") ||
    url.includes("fortnite.com/news?")
  );
}

function ehRockstar(url) {
  if (!url) return false;

  return (
    url.includes("rockstargames.com") &&
    url.includes("/newswire/")
  );
}

// ======================================================
// GOOGLE NEWS
// ======================================================

async function buscarGoogleNewsRSS(query) {
  const url =
    "https://news.google.com/rss/search?" +
    `q=${encodeURIComponent(query)}` +
    "&hl=pt-BR" +
    "&gl=BR" +
    "&ceid=BR:pt-419";

  const resposta = await getComRetry(
    url,
    2,
    {
      responseType: "text",
    }
  );

  if (!resposta?.data) {
    return [];
  }

  try {
    const feed = await parser.parseString(resposta.data);

    console.log(
      `📰 Google News: ${feed.items.length} itens encontrados.`
    );

    return feed.items.slice(0, MAX_GOOGLE_ITENS);
  } catch (erro) {
    console.log(
      `❌ Erro lendo Google News: ${erro.message}`
    );

    return [];
  }
}

// ======================================================
// DECODIFICADOR GOOGLE NEWS
// ======================================================

function procurarUrlOficialNoTexto(texto, tipo) {
  if (!texto) return null;

  const urls = texto.match(
    /https?:\/\/[^\s"'<>\\]+/gi
  );

  if (!urls) return null;

  for (let url of urls) {
    try {
      url = url
        .replace(/&amp;/g, "&")
        .replace(/[),.;]+$/g, "");

      url = decodeURIComponent(url);

      if (
        tipo === "rockstar" &&
        ehRockstar(url)
      ) {
        return normalizarUrl(url);
      }

      if (
        tipo === "fortnite" &&
        ehFortnite(url)
      ) {
        return normalizarUrl(url);
      }
    } catch {}
  }

  return null;
}

async function decodificarGoogleNews(item, tipo) {
  if (!item?.link) return null;

  // Se já for URL oficial, acabou.
  if (
    tipo === "rockstar" &&
    ehRockstar(item.link)
  ) {
    return normalizarUrl(item.link);
  }

  if (
    tipo === "fortnite" &&
    ehFortnite(item.link)
  ) {
    return normalizarUrl(item.link);
  }

  // Nunca publicaremos o link do Google.
  if (!ehGoogleNews(item.link)) {
    return null;
  }

  try {
    const resposta = await getComRetry(
      item.link,
      1,
      {
        timeout: 8000,
        maxRedirects: 5,
      }
    );

    if (!resposta) {
      return null;
    }

    // 1. URL final após redirects
    const urlFinal =
      resposta.request?.res?.responseUrl ||
      resposta.request?._redirectable?._currentUrl ||
      "";

    if (
      tipo === "rockstar" &&
      ehRockstar(urlFinal)
    ) {
      return normalizarUrl(urlFinal);
    }

    if (
      tipo === "fortnite" &&
      ehFortnite(urlFinal)
    ) {
      return normalizarUrl(urlFinal);
    }

    // 2. Procurar dentro do HTML
    const html =
      typeof resposta.data === "string"
        ? resposta.data
        : "";

    const encontrada =
      procurarUrlOficialNoTexto(
        html,
        tipo
      );

    if (encontrada) {
      return encontrada;
    }

    // 3. Procurar canonical
    if (html) {
      const $ = cheerio.load(html);

      const candidatos = [
        $('link[rel="canonical"]').attr("href"),
        $('meta[property="og:url"]').attr("content"),
        $('meta[name="twitter:url"]').attr("content"),
      ];

      for (const candidato of candidatos) {
        if (!candidato) continue;

        try {
          const absoluta = new URL(
            candidato,
            item.link
          ).href;

          if (
            tipo === "rockstar" &&
            ehRockstar(absoluta)
          ) {
            return normalizarUrl(absoluta);
          }

          if (
            tipo === "fortnite" &&
            ehFortnite(absoluta)
          ) {
            return normalizarUrl(absoluta);
          }
        } catch {}
      }
    }
  } catch {}

  return null;
}

// ======================================================
// METADADOS DA NOTÍCIA
// ======================================================

async function buscarMetadados(url, tipo) {
  if (!url) {
    return {
      titulo: "",
      descricao: "",
      imagem: null,
    };
  }

  console.log(
    `📝 ${tipo.toUpperCase()}: buscando imagem e prévia...`
  );

  const resposta = await getComRetry(
    url,
    2
  );

  if (!resposta?.data) {
    return {
      titulo: "",
      descricao: "",
      imagem: null,
    };
  }

  try {
    const $ = cheerio.load(
      resposta.data
    );

    const titulo =
      limparTexto(
        $('meta[property="og:title"]').attr(
          "content"
        ) ||
          $('meta[name="twitter:title"]').attr(
            "content"
          ) ||
          $("title").text()
      );

    const descricao =
      limparTexto(
        $('meta[property="og:description"]').attr(
          "content"
        ) ||
          $('meta[name="description"]').attr(
            "content"
          ) ||
          $('meta[name="twitter:description"]').attr(
            "content"
          )
      );

    let imagem =
      $('meta[property="og:image"]').attr(
        "content"
      ) ||
      $('meta[name="twitter:image"]').attr(
        "content"
      ) ||
      $('meta[property="twitter:image"]').attr(
        "content"
      );

    // Procurar imagem em JSON-LD
    if (!imagem) {
      $('script[type="application/ld+json"]').each(
        (_, elemento) => {
          if (imagem) return;

          try {
            const json = JSON.parse(
              $(elemento).contents().text()
            );

            const lista = Array.isArray(json)
              ? json
              : [json];

            for (const item of lista) {
              if (!item) continue;

              if (
                typeof item.image === "string"
              ) {
                imagem = item.image;
                break;
              }

              if (
                Array.isArray(item.image) &&
                item.image.length
              ) {
                imagem = item.image[0];
                break;
              }

              if (
                item.image?.url
              ) {
                imagem =
                  item.image.url;
                break;
              }
            }
          } catch {}
        }
      );
    }

    // Último fallback
    if (!imagem) {
      const candidatos = [
        "article img",
        "main img",
        ".article img",
        ".news img",
        ".post img",
      ];

      for (const seletor of candidatos) {
        const src = $(
          seletor
        )
          .first()
          .attr("src");

        if (src) {
          imagem = src;
          break;
        }
      }
    }

    if (imagem) {
      try {
        imagem = new URL(
          imagem,
          url
        ).href;
      } catch {
        imagem = null;
      }
    }

    if (imagem) {
      console.log(
        `🖼️ Imagem encontrada`
      );
    }

    if (descricao) {
      console.log(
        `📢 Prévia encontrada`
      );
    }

    return {
      titulo,
      descricao,
      imagem,
    };
  } catch (erro) {
    console.log(
      `⚠️ Erro nos metadados: ${erro.message}`
    );

    return {
      titulo: "",
      descricao: "",
      imagem: null,
    };
  }
}

// ======================================================
// VERIFICAÇÃO DE DUPLICATA
// ======================================================

async function jaFoiPublicada(
  canal,
  url
) {
  if (!canal || !url) {
    return false;
  }

  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 100,
      });

    const urlNormalizada =
      normalizarUrl(url);

    for (const mensagem of mensagens.values()) {
      if (!mensagem.embeds?.length) {
        continue;
      }

      for (const embed of mensagem.embeds) {
        if (!embed.url) continue;

        if (
          normalizarUrl(embed.url) ===
          urlNormalizada
        ) {
          return true;
        }
      }
    }
  } catch (erro) {
    console.log(
      `⚠️ Erro verificando duplicata: ${erro.message}`
    );
  }

  return false;
}

// ======================================================
// PUBLICAR NOTÍCIA
// ======================================================

async function publicarNoticia({
  canalId,
  tipo,
  titulo,
  descricao,
  imagem,
  url,
}) {
  if (!canalId || !url || !titulo) {
    return false;
  }

  const canal =
    await client.channels.fetch(
      canalId
    );

  if (!canal) {
    console.log(
      `❌ Canal não encontrado: ${canalId}`
    );
    return false;
  }

  if (
    await jaFoiPublicada(
      canal,
      url
    )
  ) {
    console.log(
      `⏭️ ${tipo.toUpperCase()}: já publicada: ${titulo}`
    );

    return false;
  }

  const frase =
    gerarFrase(
      tipo,
      titulo
    );

  const resumo =
    limitarTexto(
      descricao ||
        "Confira todos os detalhes dessa novidade no artigo completo.",
      500
    );

  const embed =
    new EmbedBuilder()
      .setTitle(titulo)
      .setURL(url)
      .setDescription(
        `🔥 ${resumo}`
      )
      .setFooter({
        text:
          tipo === "fortnite"
            ? "Murilito NEWS • Fortnite"
            : "Murilito NEWS • GTA",
      })
      .setTimestamp();

  if (imagem) {
    embed.setImage(imagem);
  }

  await canal.send({
    content: `@everyone ${frase}`,
    embeds: [embed],
    allowedMentions: {
      parse: ["everyone"],
    },
  });

  console.log(
    `📢 NOTÍCIA PUBLICADA!`
  );

  console.log(
    `   ${titulo}`
  );

  console.log(
    `   ${url}`
  );

  return true;
}

// ======================================================
// FORTNITE
// ======================================================

async function buscarFortnite() {
  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

  console.log(
    "🔎 Fortnite: buscando notícias."
  );

  // IMPORTANTE:
  // Não usamos mais "after:" porque estava
  // fazendo o Google News retornar 0 itens.

  const consultas = [
    'Fortnite site:fortnite.com/news',
    '"Fortnite" "Epic Games" site:fortnite.com/news',
  ];

  let itens = [];

  for (const consulta of consultas) {
    itens =
      await buscarGoogleNewsRSS(
        consulta
      );

    if (itens.length > 0) {
      break;
    }
  }

  if (!itens.length) {
    console.log(
      "⚠️ Fortnite: nenhuma notícia encontrada."
    );

    return 0;
  }

  let publicadas = 0;

  const urlsAnalisadas =
    new Set();

  for (
    const item of itens
  ) {
    if (
      publicadas >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    const tituloRSS =
      limparTexto(
        item.title
      );

    console.log(
      `🔎 Fortnite: ${tituloRSS}`
    );

    let url =
      await decodificarGoogleNews(
        item,
        "fortnite"
      );

    // Caso o decoder não consiga,
    // tentamos URLs que eventualmente
    // estejam presentes no próprio item.

    if (!url) {
      url =
        procurarUrlOficialNoTexto(
          item.contentSnippet ||
            item.content ||
            "",
          "fortnite"
        );
    }

    if (!url) {
      console.log(
        "⚠️ Fortnite: URL oficial não encontrada."
      );
      continue;
    }

    if (
      urlsAnalisadas.has(url)
    ) {
      continue;
    }

    urlsAnalisadas.add(url);

    const metadados =
      await buscarMetadados(
        url,
        "fortnite"
      );

    const titulo =
      metadados.titulo ||
      tituloRSS
        .replace(/\s+-\s+Fortnite$/i, "")
        .trim();

    const descricao =
      metadados.descricao ||
      limparTexto(
        item.contentSnippet ||
          item.content ||
          ""
      );

    const publicou =
      await publicarNoticia({
        canalId:
          ID_FORTNITE,
        tipo: "fortnite",
        titulo,
        descricao,
        imagem:
          metadados.imagem,
        url,
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 Fortnite: ${publicadas} notícia(s) nova(s) publicada(s).`
  );

  return publicadas;
}

// ======================================================
// LIBERTYCITY
// ======================================================

function extrairNoticiasLibertyCity(
  html
) {
  const $ =
    cheerio.load(html);

  const noticias = [];
  const urls = new Set();

  $("a[href]").each(
    (_, elemento) => {
      const href =
        $(elemento).attr("href");

      const texto =
        limparTexto(
          $(elemento).text()
        );

      if (!href || !texto) {
        return;
      }

      let url;

      try {
        url =
          new URL(
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

      // Ignorar paginação
      if (
        /\/page\/\d+/i.test(url)
      ) {
        return;
      }

      if (
        /próxima página|pagina anterior|anterior|próxima/i.test(
          texto
        )
      ) {
        return;
      }

      // Precisa parecer artigo
      if (
        !/\.html$/i.test(url)
      ) {
        return;
      }

      if (
        urls.has(url)
      ) {
        return;
      }

      urls.add(url);

      noticias.push({
        titulo: texto,
        url: normalizarUrl(url),
      });
    }
  );

  return noticias;
}

async function buscarLibertyCity() {
  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  console.log(
    "🔎 LibertyCity: buscando notícias."
  );

  const resposta =
    await getComRetry(
      "https://pt.libertycity.net/news/",
      2
    );

  if (!resposta?.data) {
    console.log(
      "⚠️ LibertyCity: não foi possível acessar."
    );

    return 0;
  }

  const noticias =
    extrairNoticiasLibertyCity(
      resposta.data
    );

  console.log(
    `🔎 LibertyCity: ${noticias.length} notícias encontradas.`
  );

  let publicadas = 0;

  for (
    const noticia of noticias
  ) {
    if (
      publicadas >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    if (
      await jaFoiPublicadaPorId(
        ID_GTA,
        noticia.url
      )
    ) {
      console.log(
        `⏭️ GTA: já publicada: ${noticia.titulo}`
      );

      continue;
    }

    const metadados =
      await buscarMetadados(
        noticia.url,
        "gta"
      );

    const titulo =
      metadados.titulo ||
      noticia.titulo;

    const publicou =
      await publicarNoticia({
        canalId:
          ID_GTA,
        tipo: "gta",
        titulo,
        descricao:
          metadados.descricao ||
          "Confira a matéria completa com todos os detalhes dessa novidade.",
        imagem:
          metadados.imagem,
        url: noticia.url,
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 GTA: ${publicadas} notícia(s) nova(s) publicada(s).`
  );

  return publicadas;
}

// ======================================================
// DUPLICATA POR ID
// ======================================================

async function jaFoiPublicadaPorId(
  canalId,
  url
) {
  try {
    const canal =
      await client.channels.fetch(
        canalId
      );

    return await jaFoiPublicada(
      canal,
      url
    );
  } catch {
    return false;
  }
}

// ======================================================
// ROCKSTAR
// ======================================================

async function buscarRockstar() {
  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  // Fazemos pesquisas separadas.
  // Isso evita pegar um feed gigantesco
  // com notícias antigas de Red Dead etc.

  const consultas = [
    'site:rockstargames.com/br/newswire/article "Rockstar Games"',
    'site:rockstargames.com/br/newswire/article GTA',
    'site:rockstargames.com/br/newswire/article "GTA Online"',
  ];

  const mapa =
    new Map();

  for (
    const consulta of consultas
  ) {
    const itens =
      await buscarGoogleNewsRSS(
        consulta
      );

    for (
      const item of itens
    ) {
      const chave =
        limparTexto(
          item.title
        ).toLowerCase();

      if (!chave) continue;

      if (!mapa.has(chave)) {
        mapa.set(
          chave,
          item
        );
      }
    }

    if (
      mapa.size >=
      MAX_GOOGLE_ITENS
    ) {
      break;
    }
  }

  const itens =
    Array.from(
      mapa.values()
    ).slice(
      0,
      MAX_GOOGLE_ITENS
    );

  console.log(
    `🔎 Rockstar: ${itens.length} candidatos selecionados.`
  );

  let publicadas = 0;

  for (
    const item of itens
  ) {
    if (
      publicadas >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    const tituloRSS =
      limparTexto(
        item.title
      );

    console.log(
      `🔓 Rockstar: analisando ${tituloRSS}`
    );

    // Primeiro tenta encontrar URL oficial
    // através do próprio Google News.
    const url =
      await decodificarGoogleNews(
        item,
        "rockstar"
      );

    if (!url) {
      console.log(
        "⚠️ Rockstar: URL oficial não encontrada."
      );

      continue;
    }

    // Segurança extra:
    // NUNCA publicar fora do domínio oficial.
    if (!ehRockstar(url)) {
      console.log(
        "⚠️ Rockstar: URL rejeitada por segurança."
      );

      continue;
    }

    if (
      await jaFoiPublicadaPorId(
        ID_GTA,
        url
      )
    ) {
      console.log(
        `⏭️ GTA: já publicada: ${tituloRSS}`
      );

      continue;
    }

    const metadados =
      await buscarMetadados(
        url,
        "gta"
      );

    const titulo =
      metadados.titulo ||
      tituloRSS;

    const descricao =
      metadados.descricao ||
      limparTexto(
        item.contentSnippet ||
          item.content ||
          "Confira a matéria completa da Rockstar Games."
      );

    const publicou =
      await publicarNoticia({
        canalId:
          ID_GTA,
        tipo: "gta",
        titulo,
        descricao,
        imagem:
          metadados.imagem,
        url,
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 Rockstar: ${publicadas} notícia(s) nova(s) publicada(s).`
  );

  return publicadas;
}

// ======================================================
// LOJA FORTNITE
// ======================================================

async function lojaPostadaHoje() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    const mensagens =
      await canal.messages.fetch({
        limit: 50,
      });

    const hoje =
      new Date().toLocaleDateString(
        "pt-BR"
      );

    for (
      const mensagem of mensagens.values()
    ) {
      if (
        !mensagem.embeds?.length
      ) {
        continue;
      }

      for (
        const embed of mensagem.embeds
      ) {
        if (
          embed.url ===
          LOJA_FORTNITE
        ) {
          const dataMensagem =
            mensagem.createdAt.toLocaleDateString(
              "pt-BR"
            );

          if (
            dataMensagem === hoje
          ) {
            return true;
          }
        }
      }
    }
  } catch {}

  return false;
}

async function publicarLoja() {
  try {
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
            "Murilito NEWS • Loja Fortnite",
        })
        .setTimestamp();

    await canal.send({
      content:
        "@everyone 🛒 CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR! 🔥",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log(
      "🛒 LOJA DO FORTNITE PUBLICADA!"
    );
  } catch (erro) {
    console.log(
      `❌ Erro publicando loja: ${erro.message}`
    );
  }
}

// ======================================================
// HORÁRIO DA LOJA
// ======================================================

async function verificarHorarioLoja() {
  try {
    const agora =
      new Date();

    const hora =
      Number(
        agora.toLocaleString(
          "pt-BR",
          {
            timeZone:
              "America/Sao_Paulo",
            hour: "2-digit",
            hour12: false,
          }
        )
      );

    const minuto =
      Number(
        agora.toLocaleString(
          "pt-BR",
          {
            timeZone:
              "America/Sao_Paulo",
            minute: "2-digit",
          }
        )
      );

    // Janela de 21:00 até 21:05
    if (
      hora === 21 &&
      minuto <= 5
    ) {
      const jaPostou =
        await lojaPostadaHoje();

      if (!jaPostou) {
        await publicarLoja();
      }
    }
  } catch (erro) {
    console.log(
      `⚠️ Erro verificando loja: ${erro.message}`
    );
  }
}

// ======================================================
// CICLO DE NOTÍCIAS
// ======================================================

let cicloEmAndamento = false;

async function cicloNoticias() {
  if (cicloEmAndamento) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando. Ignorando novo ciclo."
    );

    return;
  }

  cicloEmAndamento = true;

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
        timeZone:
          "America/Sao_Paulo",
      }
    )}`
  );

  console.log(
    "========================================"
  );

  try {
    await buscarFortnite();

    await buscarLibertyCity();

    await buscarRockstar();
  } catch (erro) {
    console.log(
      `❌ Erro geral no ciclo: ${erro.message}`
    );
  }

  console.log(
    "========================================"
  );

  console.log(
    "✅ CICLO DE NOTÍCIAS FINALIZADO"
  );

  console.log(
    "========================================"
  );

  cicloEmAndamento = false;
}

// ======================================================
// PIADAS
// ======================================================

const PIADAS = [
  "😂 O cara falou que ia jogar só uma partida... 4 horas depois ainda está no lobby.",
  "🎮 Meu PC não trava. Ele só tira um cochilo estratégico.",
  "🚔 No GTA eu respeito todas as leis... menos as de trânsito.",
  "🔥 Fortnite atualizou a loja. Minha carteira pediu demissão.",
  "😂 Se FPS desse dinheiro, eu já estava rico.",
  "🎮 O problema não é o ping. É o inimigo estar muito perto.",
  "💀 Entrei para jogar uma partida e saí com 17 traumas.",
];

function piadaAleatoria() {
  return PIADAS[
    Math.floor(
      Math.random() *
        PIADAS.length
    )
  ];
}

// ======================================================
// COMANDOS
// ======================================================

client.on(
  "messageCreate",
  async (message) => {
    if (
      message.author.bot
    ) {
      return;
    }

    const texto =
      message.content
        .trim()
        .toLowerCase();

    if (
      texto === "!piada"
    ) {
      await message.reply(
        piadaAleatoria()
      );

      return;
    }

    if (
      texto === "!ajuda"
    ) {
      await message.reply(
        "🤖 **MURILITO NEWS — COMANDOS**\n\n" +
        "`!teste` — testa tudo\n" +
        "`!teste fortnite` — testa Fortnite\n" +
        "`!teste liberty` — testa LibertyCity\n" +
        "`!teste rockstar` — testa Rockstar\n" +
        "`!teste loja` — testa a Loja do Fortnite\n" +
        "`!piada` — manda uma piada 😂"
      );

      return;
    }

    if (
      texto === "!teste fortnite"
    ) {
      await message.reply(
        "🎮 Buscando notícias do Fortnite..."
      );

      await buscarFortnite();

      return;
    }

    if (
      texto === "!teste liberty"
    ) {
      await message.reply(
        "🚔 Buscando notícias da LibertyCity..."
      );

      await buscarLibertyCity();

      return;
    }

    if (
      texto === "!teste rockstar"
    ) {
      await message.reply(
        "🚨 Buscando notícias da Rockstar..."
      );

      await buscarRockstar();

      return;
    }

    if (
      texto === "!teste loja"
    ) {
      await message.reply(
        "🛒 Publicando teste da loja..."
      );

      await publicarLoja();

      return;
    }

    if (
      texto === "!teste"
    ) {
      await message.reply(
        "🧪 Iniciando teste completo do Murilito NEWS..."
      );

      await publicarLoja();

      await buscarFortnite();

      await buscarLibertyCity();

      await buscarRockstar();

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

    // Verifica a loja a cada 30 segundos
    setInterval(
      verificarHorarioLoja,
      INTERVALO_LOJA
    );
  }
);

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
