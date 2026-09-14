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
// CONFIGURAÇÕES
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

// Quantas notícias do Google News serão analisadas.
// Antes estava pegando praticamente tudo.
const MAX_ITENS_GOOGLE = 12;

// ======================================================
// CLIENTE DISCORD
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const parser = new Parser({
  timeout: 15000,
});

// ======================================================
// AXIOS
// ======================================================

const http = axios.create({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

// ======================================================
// UTILIDADES
// ======================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function limitarTexto(texto, limite = 650) {
  texto = limparTexto(texto);

  if (!texto) return "";

  if (texto.length <= limite) {
    return texto;
  }

  return texto.substring(0, limite).replace(/\s+\S*$/, "") + "...";
}

function dataBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

function dataBuscaGoogle() {
  const d = new Date();

  d.setDate(d.getDate() - MAX_IDADE_NOTICIA_DIAS);

  return d.toISOString().slice(0, 10);
}

function urlNormalizada(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    u.hash = "";

    // Remove parâmetros de rastreamento
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
      "oc",
    ].forEach((param) => {
      u.searchParams.delete(param);
    });

    return u.toString();
  } catch {
    return url
      .replace(/[?#].*$/, "")
      .replace(/[),.;]+$/, "");
  }
}

// ======================================================
// FRASES DO BOT
// ======================================================

function gerarFrase(tipo, titulo) {
  const frases = {
    fortnite: [
      "🎮 NOVIDADE QUENTE NO FORTNITE! 👀",
      "🔥 ACABOU DE SAIR! OLHA ESSA NOVIDADE DO FORTNITE!",
      "🚨 ATENÇÃO, PLAYERS! TEM NOVIDADE NOVA NO FORTNITE!",
      "👀 OLHA O QUE ACABOU DE SAIR NO FORTNITE!",
      "🔥 FORTNITE NÃO PARA! CONFIRA ESSA NOVIDADE!",
    ],

    gta: [
      "🚨 NOVIDADE QUENTE NO UNIVERSO GTA! 👀",
      "🔥 ACABOU DE SAIR! OLHA ESSA NOVIDADE!",
      "👀 OLHA O QUE A ROCKSTAR ACABOU DE REVELAR!",
      "🚔 TEM NOVIDADE NO GTA! CONFIRA ESSA!",
      "🔥 MAIS UMA DO UNIVERSO GTA! NÃO PERDE ESSA!",
    ],

    geral: [
      "📰 ACABOU DE SAIR! 👀",
      "🔥 TEM NOVIDADE FRESQUINHA!",
      "🚨 ATENÇÃO! OLHA ESSA NOVIDADE!",
      "👀 VOCÊ PRECISA VER ESSA!",
      "🔥 NOVIDADE NOVA CHEGANDO NO MURILITO NEWS!",
    ],
  };

  let lista = frases.geral;

  if (tipo === "fortnite") {
    lista = frases.fortnite;
  }

  if (tipo === "gta") {
    lista = frases.gta;
  }

  // Escolha determinística baseada no título.
  // Assim não muda toda vez que o ciclo roda.
  let numero = 0;

  for (let i = 0; i < titulo.length; i++) {
    numero = (numero + titulo.charCodeAt(i)) % lista.length;
  }

  return lista[numero];
}

// ======================================================
// HTTP COM RETRY
// ======================================================

async function getComRetry(url, tentativas = 2, opcoes = {}) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const resposta = await http.get(url, {
        ...opcoes,
        validateStatus: () => true,
      });

      if (resposta.status >= 200 && resposta.status < 300) {
        console.log(`✅ HTTP ${resposta.status} | ${url}`);

        return resposta;
      }

      console.log(
        `⚠️ HTTP ${resposta.status} | ${url}`
      );
    } catch (erro) {
      console.log(
        `⚠️ Erro HTTP | ${url}`
      );

      if (erro.message) {
        console.log(`   ${erro.message}`);
      }
    }

    if (tentativa < tentativas) {
      await sleep(1000);
    }
  }

  return null;
}

// ======================================================
// DECODIFICAR GOOGLE NEWS
// ======================================================

function extrairUrlOficial(html, tipo) {
  if (!html) return null;

  let texto = html;

  // Decodifica entidades HTML
  texto = texto
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/");

  let padrao;

  if (tipo === "fortnite") {
    padrao =
      /https?:\/\/(?:www\.)?fortnite\.com\/news\/[^"'<>\\\s]+/gi;
  } else {
    padrao =
      /https?:\/\/(?:www\.)?rockstargames\.com\/(?:br\/)?newswire\/article\/[^"'<>\\\s]+/gi;
  }

  const encontrados = texto.match(padrao) || [];

  if (!encontrados.length) {
    return null;
  }

  let url = encontrados[0];

  // Decodifica até 2 vezes
  for (let i = 0; i < 2; i++) {
    try {
      const decodificada = decodeURIComponent(url);

      if (decodificada === url) break;

      url = decodificada;
    } catch {
      break;
    }
  }

  url = url
    .replace(/&amp;/g, "&")
    .replace(/[),.;]+$/, "");

  // Remove parâmetros
  url = url.split("?")[0].split("#")[0];

  return url;
}

async function decodificarGoogleNews(link, tipo) {
  try {
    const resposta = await getComRetry(link, 1);

    if (!resposta) return null;

    return extrairUrlOficial(resposta.data, tipo);
  } catch {
    return null;
  }
}

// ======================================================
// IMAGEM + PRÉVIA DA MATÉRIA
// ======================================================

async function buscarMetadados(url, tituloFallback = "", descricaoFallback = "") {
  const resultado = {
    titulo: tituloFallback,
    descricao: descricaoFallback,
    imagem: null,
  };

  const resposta = await getComRetry(url, 2, {
    headers: {
      Referer: url,
    },
  });

  if (!resposta || typeof resposta.data !== "string") {
    console.log(`⚠️ Metadados não disponíveis: ${url}`);
    return resultado;
  }

  try {
    const $ = cheerio.load(resposta.data);

    // ------------------------------
    // TÍTULO
    // ------------------------------

    const titulo =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").text();

    if (titulo) {
      resultado.titulo = limparTexto(titulo);
    }

    // ------------------------------
    // DESCRIÇÃO
    // ------------------------------

    const descricao =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content");

    if (descricao) {
      resultado.descricao = limitarTexto(descricao, 700);
    }

    // ------------------------------
    // IMAGEM
    // ------------------------------

    const imagens = [
      $('meta[property="og:image"]').attr("content"),
      $('meta[property="og:image:url"]').attr("content"),
      $('meta[name="twitter:image"]').attr("content"),
      $('meta[name="twitter:image:src"]').attr("content"),
    ];

    // Procurar JSON-LD
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const texto = $(el).html();

        if (!texto) return;

        const json = JSON.parse(texto);

        const itens = Array.isArray(json) ? json : [json];

        for (const item of itens) {
          if (!item) continue;

          if (item.image) {
            if (typeof item.image === "string") {
              imagens.push(item.image);
            } else if (Array.isArray(item.image)) {
              imagens.push(...item.image);
            } else if (item.image.url) {
              imagens.push(item.image.url);
            }
          }
        }
      } catch {
        // Ignora JSON inválido
      }
    });

    // Imagem específica em algumas páginas
    const imagensHtml = [
      $("article img").first().attr("src"),
      $("main img").first().attr("src"),
      $(".article img").first().attr("src"),
      $(".news-article img").first().attr("src"),
    ];

    imagens.push(...imagensHtml);

    for (let imagem of imagens) {
      if (!imagem) continue;

      imagem = String(imagem).trim();

      if (imagem.startsWith("//")) {
        imagem = "https:" + imagem;
      }

      if (imagem.startsWith("/")) {
        try {
          imagem = new URL(imagem, url).toString();
        } catch {
          continue;
        }
      }

      if (
        imagem.startsWith("http://") ||
        imagem.startsWith("https://")
      ) {
        resultado.imagem = imagem;
        break;
      }
    }

    if (resultado.imagem) {
      console.log("🖼️ Imagem encontrada");
    } else {
      console.log("⚠️ Nenhuma imagem encontrada");
    }

    if (resultado.descricao) {
      console.log("📢 Prévia encontrada");
    }

    return resultado;
  } catch (erro) {
    console.log(
      `⚠️ Erro lendo metadados: ${erro.message}`
    );

    return resultado;
  }
}

// ======================================================
// JÁ PUBLICADA?
// ======================================================

async function jaFoiPublicada(canal, url) {
  if (!canal) return false;

  const alvo = urlNormalizada(url);

  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    for (const [, mensagem] of mensagens) {
      if (!mensagem.embeds?.length) continue;

      for (const embed of mensagem.embeds) {
        if (!embed.url) continue;

        if (urlNormalizada(embed.url) === alvo) {
          return true;
        }
      }
    }
  } catch (erro) {
    console.log(
      `⚠️ Erro verificando duplicidade: ${erro.message}`
    );
  }

  return false;
}

// ======================================================
// PUBLICAR NOTÍCIA
// ======================================================

async function publicarNoticia({
  canal,
  tipo,
  titulo,
  url,
  resumo,
  imagem,
  origem,
}) {
  if (!canal || !url) return false;

  titulo = limparTexto(titulo || "Nova notícia");

  if (titulo.length > 256) {
    titulo = titulo.substring(0, 253) + "...";
  }

  resumo =
    limitarTexto(resumo, 750) ||
    "Confira todos os detalhes da notícia no link abaixo.";

  const frase = gerarFrase(tipo, titulo);

  const emoji =
    tipo === "fortnite"
      ? "🎮"
      : tipo === "gta"
      ? "🚔"
      : "📰";

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${titulo}`)
    .setURL(url)
    .setDescription(
      `📝 **${resumo}**\n\n` +
        `👇 Clique no título acima para ler a matéria completa.`
    )
    .setFooter({
      text: `Murilito NEWS • ${origem || "Notícias"}`,
    })
    .setTimestamp(new Date());

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

  console.log("📢 NOTÍCIA PUBLICADA!");
  console.log(`   ${titulo}`);
  console.log(`   ${url}`);

  return true;
}

// ======================================================
// GOOGLE NEWS RSS
// ======================================================

async function buscarGoogleNewsRSS(query) {
  const url =
    "https://news.google.com/rss/search?" +
    new URLSearchParams({
      q: query,
      hl: "pt-BR",
      gl: "BR",
      ceid: "BR:pt-419",
    }).toString();

  const resposta = await getComRetry(url, 2);

  if (!resposta) return [];

  try {
    const feed = await parser.parseString(resposta.data);

    console.log(
      `📰 Google News: ${feed.items.length} itens encontrados.`
    );

    return feed.items;
  } catch (erro) {
    console.log(
      `❌ Erro lendo RSS Google News: ${erro.message}`
    );

    return [];
  }
}

// ======================================================
// FORTNITE
// ======================================================

async function buscarFortnite() {
  console.log(
    "🔎 Fortnite: tentando Google News para contornar bloqueio 403."
  );

  const query =
    `Fortnite notícias site:fortnite.com/news after:${dataBuscaGoogle()}`;

  const itens = await buscarGoogleNewsRSS(query);

  const canal = await client.channels.fetch(ID_FORTNITE);

  if (!canal) {
    console.log("❌ Canal Fortnite não encontrado.");
    return;
  }

  let publicadas = 0;
  let analisadas = 0;

  for (const item of itens) {
    if (analisadas >= MAX_ITENS_GOOGLE) {
      break;
    }

    if (!item.link) continue;

    const tituloRSS = limparTexto(item.title);

    // Evita analisar lixo muito genérico
    if (!tituloRSS) continue;

    console.log(
      `🔓 Fortnite: analisando ${tituloRSS}`
    );

    const url = await decodificarGoogleNews(
      item.link,
      "fortnite"
    );

    analisadas++;

    if (!url) {
      console.log("⚠️ Fortnite: URL oficial não encontrada.");
      continue;
    }

    if (!url.includes("fortnite.com/news/")) {
      continue;
    }

    if (await jaFoiPublicada(canal, url)) {
      console.log(
        `⏭️ Fortnite: já publicada: ${tituloRSS}`
      );
      continue;
    }

    console.log(
      "📝 Fortnite: buscando imagem e prévia..."
    );

    const metadados = await buscarMetadados(
      url,
      tituloRSS,
      item.contentSnippet || item.content || ""
    );

    const publicou = await publicarNoticia({
      canal,
      tipo: "fortnite",
      titulo: metadados.titulo || tituloRSS,
      url,
      resumo:
        metadados.descricao ||
        limparTexto(item.contentSnippet) ||
        "Confira a novidade completa do Fortnite.",
      imagem: metadados.imagem,
      origem: "Fortnite",
    });

    if (publicou) {
      publicadas++;
    }

    // Pequena pausa para não bombardear os sites
    await sleep(500);

    // Limite de segurança
    if (publicadas >= 3) {
      break;
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
  console.log("🔎 LibertyCity: buscando notícias.");

  const url =
    "https://pt.libertycity.net/news/";

  const resposta = await getComRetry(url, 2);

  if (!resposta) {
    console.log("⚠️ LibertyCity indisponível.");
    return;
  }

  const $ = cheerio.load(resposta.data);

  const noticias = [];

  $("a").each((i, el) => {
    const link = $(el).attr("href");
    const titulo = limparTexto($(el).text());

    if (!link || !titulo) return;

    if (
      !link.includes("/news/") ||
      titulo.length < 15
    ) {
      return;
    }

    if (
      titulo.toLowerCase().includes("próxima página") ||
      titulo.toLowerCase().includes("pagina")
    ) {
      return;
    }

    let urlFinal;

    try {
      urlFinal = new URL(
        link,
        "https://pt.libertycity.net"
      ).toString();
    } catch {
      return;
    }

    if (!noticias.some((n) => n.url === urlFinal)) {
      noticias.push({
        titulo,
        url: urlFinal,
      });
    }
  });

  console.log(
    `🔎 LibertyCity: ${noticias.length} notícias encontradas.`
  );

  const canal = await client.channels.fetch(ID_GTA);

  if (!canal) return;

  let publicadas = 0;

  for (const noticia of noticias.slice(0, 10)) {
    if (await jaFoiPublicada(canal, noticia.url)) {
      console.log(
        `⏭️ GTA: já publicada: ${noticia.titulo}`
      );
      continue;
    }

    console.log(
      "📝 GTA: buscando imagem e prévia..."
    );

    const metadados = await buscarMetadados(
      noticia.url,
      noticia.titulo
    );

    const publicou = await publicarNoticia({
      canal,
      tipo: "gta",
      titulo: metadados.titulo || noticia.titulo,
      url: noticia.url,
      resumo:
        metadados.descricao ||
        "Confira todos os detalhes desta novidade do universo GTA.",
      imagem: metadados.imagem,
      origem: "LibertyCity",
    });

    if (publicou) {
      publicadas++;
    }

    await sleep(500);

    if (publicadas >= 3) {
      break;
    }
  }

  console.log(
    `📊 GTA: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}

// ======================================================
// ROCKSTAR
// ======================================================

async function buscarRockstar() {
  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  const query =
    `site:rockstargames.com/br/newswire/article after:${dataBuscaGoogle()}`;

  console.log(`🔎 Rockstar RSS: ${query}`);

  const itens = await buscarGoogleNewsRSS(query);

  const canal = await client.channels.fetch(ID_GTA);

  if (!canal) {
    console.log("❌ Canal GTA não encontrado.");
    return;
  }

  let publicadas = 0;
  let analisadas = 0;

  for (const item of itens) {
    if (analisadas >= MAX_ITENS_GOOGLE) {
      break;
    }

    if (!item.link) continue;

    const tituloRSS = limparTexto(item.title);

    if (!tituloRSS) continue;

    console.log(
      `🔓 Rockstar: analisando ${tituloRSS}`
    );

    const url = await decodificarGoogleNews(
      item.link,
      "rockstar"
    );

    analisadas++;

    if (!url) {
      console.log(
        "⚠️ Rockstar: URL oficial não encontrada."
      );
      continue;
    }

    if (
      !url.includes("rockstargames.com") ||
      !url.includes("/newswire/article/")
    ) {
      continue;
    }

    const urlFinal = urlNormalizada(url);

    if (await jaFoiPublicada(canal, urlFinal)) {
      console.log(
        `⏭️ GTA: já publicada: ${tituloRSS}`
      );
      continue;
    }

    console.log(
      "📝 GTA/Rockstar: buscando imagem e prévia..."
    );

    const metadados = await buscarMetadados(
      urlFinal,
      tituloRSS,
      item.contentSnippet || ""
    );

    const publicou = await publicarNoticia({
      canal,
      tipo: "gta",
      titulo: metadados.titulo || tituloRSS,
      url: urlFinal,
      resumo:
        metadados.descricao ||
        limparTexto(item.contentSnippet) ||
        "Confira a matéria completa da Rockstar Games.",
      imagem: metadados.imagem,
      origem: "Rockstar Games",
    });

    if (publicou) {
      publicadas++;
    }

    await sleep(500);

    if (publicadas >= 3) {
      break;
    }
  }

  console.log(
    `📊 Rockstar: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}

// ======================================================
// LOJA DO FORTNITE
// ======================================================

async function lojaPostadaHoje(canal) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 50,
    });

    const hoje = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    for (const [, mensagem] of mensagens) {
      if (
        !mensagem.embeds ||
        mensagem.embeds.length === 0
      ) {
        continue;
      }

      const embed = mensagem.embeds[0];

      if (
        embed.title !==
        "🛒 LOJA DO FORTNITE ATUALIZADA!"
      ) {
        continue;
      }

      const dataMensagem = new Intl.DateTimeFormat(
        "pt-BR",
        {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      ).format(mensagem.createdAt);

      if (dataMensagem === hoje) {
        return true;
      }
    }
  } catch (erro) {
    console.log(
      `⚠️ Erro verificando loja: ${erro.message}`
    );
  }

  return false;
}

async function publicarLoja(forcar = false) {
  try {
    const canal = await client.channels.fetch(ID_LOJA);

    if (!canal) {
      console.log("❌ Canal da loja não encontrado.");
      return;
    }

    if (!forcar && (await lojaPostadaHoje(canal))) {
      console.log(
        "⏭️ Loja já foi publicada hoje."
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🛒 LOJA DO FORTNITE ATUALIZADA!")
      .setURL(LOJA_FORTNITE)
      .setDescription(
        "🔥 **A Loja de Itens do Fortnite acabou de atualizar!**\n\n" +
          "👀 Confira todas as skins, picaretas, gestos, mochilas e outros itens disponíveis hoje.\n\n" +
          "🛍️ **Veja a loja completa e confira as novidades!**\n\n" +
          "👇 Clique no título acima para abrir a loja oficial."
      )
      .setImage(
        "https://fortnite.gg/img/og-shop.jpg"
      )
      .setFooter({
        text: "Murilito NEWS • Loja Fortnite",
      })
      .setTimestamp(new Date());

    await canal.send({
      content:
        "@everyone 🛒 **CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR!** 🔥",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log("🛒 LOJA PUBLICADA!");
  } catch (erro) {
    console.log(
      `❌ Erro publicando loja: ${erro.message}`
    );
  }
}

// ======================================================
// CICLO COMPLETO
// ======================================================

let cicloEmAndamento = false;

async function cicloNoticias() {
  if (cicloEmAndamento) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando. Ignorando."
    );
    return;
  }

  cicloEmAndamento = true;

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "📰 INICIANDO CICLO DE NOTÍCIAS"
  );
  console.log(
    `🇧🇷 ${dataBrasil()}`
  );
  console.log(
    "========================================"
  );

  try {
    // -------------------------------
    // FORTNITE
    // -------------------------------

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );

    try {
      await buscarFortnite();
    } catch (erro) {
      console.log(
        `❌ Fortnite: ${erro.message}`
      );
    }

    // -------------------------------
    // LIBERTYCITY
    // -------------------------------

    console.log(
      "━━━━━━━━ LibertyCity ━━━━━━━━"
    );

    try {
      await buscarLibertyCity();
    } catch (erro) {
      console.log(
        `❌ LibertyCity: ${erro.message}`
      );
    }

    // -------------------------------
    // ROCKSTAR
    // -------------------------------

    console.log(
      "━━━━━━━━ Rockstar ━━━━━━━━"
    );

    try {
      await buscarRockstar();
    } catch (erro) {
      console.log(
        `❌ Rockstar: ${erro.message}`
      );
    }
  } finally {
    cicloEmAndamento = false;

    console.log(
      "========================================"
    );
    console.log(
      "✅ CICLO DE NOTÍCIAS FINALIZADO"
    );
    console.log(
      "========================================"
    );
  }
}

// ======================================================
// VERIFICAÇÃO AUTOMÁTICA DA LOJA
// ======================================================

async function verificarHorarioLoja() {
  const agora = new Date();

  const partes = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  ).formatToParts(agora);

  const hora = Number(
    partes.find((p) => p.type === "hour")?.value
  );

  const minuto = Number(
    partes.find((p) => p.type === "minute")?.value
  );

  // Janela de segurança:
  // 21:00 até 21:09
  if (
    hora === 21 &&
    minuto >= 0 &&
    minuto <= 9
  ) {
    await publicarLoja(false);
  }
}

// ======================================================
// PIADAS
// ======================================================

const piadas = [
  "😂 Meu PC não é ruim... ele só está vivendo uma experiência de jogo em câmera lenta.",
  "🎮 Fui jogar Fortnite e voltei sem dignidade.",
  "🚔 GTA é tão realista que até o dinheiro desaparece rápido.",
  "😂 Meu FPS é igual minha motivação: cai do nada.",
  "🔥 O problema não é minha mira. É o mouse que não me obedece.",
  "🎮 Entrei só para jogar uma partida... 4 horas depois:",
  "😂 Minha placa de vídeo pediu férias.",
];

function pegarPiada() {
  return piadas[
    Math.floor(Math.random() * piadas.length)
  ];
}

// ======================================================
// COMANDOS
// ======================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const texto = message.content
    .trim()
    .toLowerCase();

  try {
    // -------------------------------
    // TESTE GERAL
    // -------------------------------

    if (texto === "!teste") {
      await message.reply(
        "🧪 Iniciando teste completo do Murilito NEWS..."
      );

      await publicarLoja(true);
      await cicloNoticias();

      await message.reply(
        "✅ Teste completo finalizado!"
      );

      return;
    }

    // -------------------------------
    // TESTE FORTNITE
    // -------------------------------

    if (texto === "!teste fortnite") {
      await message.reply(
        "🎮 Testando notícias do Fortnite..."
      );

      await buscarFortnite();

      return;
    }

    // -------------------------------
    // TESTE LIBERTYCITY
    // -------------------------------

    if (texto === "!teste liberty") {
      await message.reply(
        "📰 Testando LibertyCity..."
      );

      await buscarLibertyCity();

      return;
    }

    // -------------------------------
    // TESTE ROCKSTAR
    // -------------------------------

    if (texto === "!teste rockstar") {
      await message.reply(
        "🚔 Testando Rockstar Games..."
      );

      await buscarRockstar();

      return;
    }

    // -------------------------------
    // TESTE LOJA
    // -------------------------------

    if (texto === "!teste loja") {
      await message.reply(
        "🛒 Testando postagem da Loja Fortnite..."
      );

      await publicarLoja(true);

      return;
    }

    // -------------------------------
    // PIADA
    // -------------------------------

    if (texto === "!piada") {
      await message.reply(pegarPiada());
      return;
    }

    // -------------------------------
    // AJUDA
    // -------------------------------

    if (texto === "!ajuda") {
      const embed = new EmbedBuilder()
        .setTitle("🤖 MURILITO NEWS")
        .setDescription(
          "**Comandos disponíveis:**\n\n" +
            "🧪 `!teste` — testa tudo\n" +
            "🎮 `!teste fortnite` — testa Fortnite\n" +
            "📰 `!teste liberty` — testa LibertyCity\n" +
            "🚔 `!teste rockstar` — testa Rockstar\n" +
            "🛒 `!teste loja` — testa a loja\n" +
            "😂 `!piada` — manda uma piada\n" +
            "❓ `!ajuda` — mostra esta mensagem"
        )
        .setFooter({
          text: "Murilito NEWS",
        });

      await message.reply({
        embeds: [embed],
      });

      return;
    }
  } catch (erro) {
    console.log(
      `❌ Erro no comando: ${erro.message}`
    );
  }
});

// ======================================================
// BOT ONLINE
// ======================================================

client.once("clientReady", async () => {
  console.log("");
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

  // Verifica notícias a cada 10 minutos
  setInterval(
    cicloNoticias,
    INTERVALO_NOTICIAS
  );

  // Verifica a loja a cada 30 segundos
  setInterval(
    verificarHorarioLoja,
    INTERVALO_LOJA
  );

  // Caso o bot seja reiniciado dentro da janela das 21h
  await verificarHorarioLoja();
});

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
