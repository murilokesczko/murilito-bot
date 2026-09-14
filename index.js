require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const Parser = require("rss-parser");

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado nas variáveis do Railway.");
  process.exit(1);
}

// Canais
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// Loja oficial
const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

// Intervalos
const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const INTERVALO_VERIFICACAO_LOJA = 30 * 1000;

// Só considera notícias recentes
const MAX_IDADE_NOTICIA_DIAS = 14;

// Quantas notícias novas por fonte em cada ciclo
const MAX_NOTICIAS_POR_FONTE = 3;

// ============================================================
// CLIENTE DISCORD
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  },
});

let ultimoDiaLoja = null;
let cicloEmAndamento = false;

// ============================================================
// UTILITÁRIOS
// ============================================================

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limparTexto(texto = "") {
  return String(texto)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function limitarTexto(texto, limite = 900) {
  texto = limparTexto(texto);

  if (texto.length <= limite) {
    return texto;
  }

  return texto.slice(0, limite - 3).trim() + "...";
}

function obterDataBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

function obterDiaBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function urlValida(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function noticiaRecente(data) {
  if (!data) return true;

  const dataNoticia = new Date(data);

  if (Number.isNaN(dataNoticia.getTime())) {
    return true;
  }

  const limite =
    Date.now() - MAX_IDADE_NOTICIA_DIAS * 24 * 60 * 60 * 1000;

  return dataNoticia.getTime() >= limite;
}

// ============================================================
// HTTP ROBUSTO
// ============================================================

async function getComRetry(url, tentativas = 3, configExtra = {}) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const resposta = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          ...configExtra.headers,
        },

        ...configExtra,
      });

      console.log(`✅ HTTP ${resposta.status} | ${url}`);

      return resposta;
    } catch (erro) {
      const status = erro.response?.status || "sem resposta";

      console.log(`⚠️ Falha HTTP: ${url}`);
      console.log(`   ${status}`);

      if (tentativa < tentativas) {
        await esperar(1500 * tentativa);
      }
    }
  }

  throw new Error(`Falha ao acessar ${url}`);
}

// ============================================================
// URL ROCKSTAR — LIMPEZA
// ============================================================

function limparUrlRockstar(url) {
  if (!url) return null;

  try {
    url = url
      .replace(/&amp;/gi, "&")
      .replace(/&#38;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/%29/g, ")");

    const parsed = new URL(url);

    if (!parsed.hostname.includes("rockstargames.com")) {
      return null;
    }

    // Remove absolutamente todos os parâmetros
    // como fbclid, amp, domain-check-failed etc.
    parsed.search = "";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

// ============================================================
// RESUMO DA NOTÍCIA
// ============================================================

async function buscarResumoPagina(url, fonte) {
  try {
    console.log(`📝 ${fonte}: buscando resumo...`);

    const resposta = await getComRetry(url, 2);
    const $ = cheerio.load(resposta.data);

    const candidatos = [
      $('meta[property="og:description"]').attr("content"),
      $('meta[name="description"]').attr("content"),
      $('meta[name="twitter:description"]').attr("content"),

      $("article p").first().text(),
      $("main p").first().text(),
      $(".article-content p").first().text(),
      $(".news-content p").first().text(),
      $(".post-content p").first().text(),
      $(".content p").first().text(),
    ];

    for (const candidato of candidatos) {
      const texto = limitarTexto(candidato, 900);

      if (
        texto &&
        texto.length >= 40 &&
        !texto.toLowerCase().includes("javascript")
      ) {
        return texto;
      }
    }

    return "Confira a notícia completa clicando no título acima.";
  } catch (erro) {
    console.log(
      `⚠️ ${fonte}: não foi possível obter resumo.`
    );

    return "Confira a notícia completa clicando no título acima.";
  }
}

// ============================================================
// DUPLICIDADE
// ============================================================

async function noticiaJaPublicada(canal, url) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    const urlLimpa = url.split("?")[0];

    for (const [, mensagem] of mensagens) {
      for (const embed of mensagem.embeds) {
        if (!embed.url) continue;

        const embedUrl = embed.url.split("?")[0];

        if (embedUrl === urlLimpa) {
          return true;
        }
      }
    }

    return false;
  } catch (erro) {
    console.log(
      `⚠️ Não foi possível verificar duplicidade: ${erro.message}`
    );

    return false;
  }
}

// ============================================================
// PUBLICAÇÃO PADRÃO
// ============================================================

async function publicarNoticia({
  canal,
  categoria,
  titulo,
  url,
  resumo,
  imagem = null,
}) {
  if (!canal) {
    console.log(
      `❌ ${categoria}: canal não encontrado.`
    );
    return false;
  }

  if (!urlValida(url)) {
    console.log(
      `❌ ${categoria}: URL inválida: ${url}`
    );
    return false;
  }

  if (await noticiaJaPublicada(canal, url)) {
    console.log(
      `⏭️ ${categoria}: já publicada: ${titulo}`
    );
    return false;
  }

  const icones = {
    Fortnite: "🎮",
    GTA: "🚔",
    LibertyCity: "🚔",
  };

  const icone = icones[categoria] || "📰";

  const embed = new EmbedBuilder()
    .setTitle(`${icone} ${limitarTexto(titulo, 250)}`)
    .setURL(url)
    .setDescription(
      `🔥 ${limitarTexto(
        resumo ||
          "Confira as novidades clicando no título acima.",
        900
      )}\n\n👇 **Clique no título acima para ler a notícia completa.**`
    )
    .setFooter({
      text: `Murilito NEWS • ${categoria}`,
    })
    .setTimestamp();

  if (imagem && urlValida(imagem)) {
    embed.setImage(imagem);
  }

  try {
    await canal.send({
      content: "@everyone",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log(`📢 ${categoria}: notícia publicada.`);
    console.log(`   ${titulo}`);
    console.log(`   ${url}`);

    return true;
  } catch (erro) {
    console.error(
      `❌ ${categoria}: erro ao publicar:`
    );
    console.error(erro.message);

    return false;
  }
}

// ============================================================
// FORTNITE — FONTE OFICIAL
// ============================================================

async function buscarNoticiasFortnite() {
  console.log("🔎 Fortnite: iniciando busca de notícias.");

  const urls = [
    "https://www.fortnite.com/news/tag/all-news?lang=pt-BR",
    "https://www.fortnite.com/news?lang=pt-BR",
  ];

  const encontrados = [];
  const urlsVistas = new Set();

  for (const url of urls) {
    try {
      const resposta = await getComRetry(url, 3);
      const $ = cheerio.load(resposta.data);

      console.log(
        `🔎 Fortnite: analisando ${url}`
      );

      $("a[href*='/news/']").each((_, elemento) => {
        const href = $(elemento).attr("href");
        const texto = limparTexto($(elemento).text());

        if (!href || !texto) return;

        let link;

        try {
          link = new URL(
            href,
            "https://www.fortnite.com"
          ).toString();
        } catch {
          return;
        }

        if (!link.includes("fortnite.com/news/")) {
          return;
        }

        // Ignora páginas de categoria
        if (
          link.includes("/tag/") ||
          link.endsWith("/news/") ||
          link.includes("?")
        ) {
          return;
        }

        if (texto.length < 8) {
          return;
        }

        if (urlsVistas.has(link)) {
          return;
        }

        urlsVistas.add(link);

        encontrados.push({
          titulo: texto,
          url: link,
          data: null,
        });
      });

      if (encontrados.length >= MAX_NOTICIAS_POR_FONTE) {
        break;
      }
    } catch (erro) {
      console.log(
        `⚠️ Fortnite: erro ao acessar ${url}`
      );
    }
  }

  // Remove títulos muito genéricos
  const filtrados = encontrados.filter((item) => {
    const titulo = item.titulo.toLowerCase();

    return (
      !titulo.includes("view more") &&
      !titulo.includes("saiba mais") &&
      !titulo.includes("ver mais") &&
      titulo.length >= 10
    );
  });

  console.log(
    `📰 Fortnite: ${filtrados.length} notícias encontradas.`
  );

  return filtrados.slice(0, MAX_NOTICIAS_POR_FONTE);
}

// ============================================================
// LIBERTYCITY
// ============================================================

async function buscarNoticiasLibertyCity() {
  console.log("━━━━━━━━ LibertyCity ━━━━━━━━");

  const paginas = [
    "https://pt.libertycity.net/news/",
    "https://pt.libertycity.net/news/page/2/",
  ];

  const encontrados = [];
  const urlsVistas = new Set();

  for (const pagina of paginas) {
    try {
      const resposta = await getComRetry(pagina, 3);
      const $ = cheerio.load(resposta.data);

      let contador = 0;

      $("a[href]").each((_, elemento) => {
        const href = $(elemento).attr("href");
        const titulo = limparTexto($(elemento).text());

        if (!href || !titulo) return;

        if (
          !href.includes("/news/") ||
          !/\/news\/[^/]+\/\d+-[^/]+\.html/i.test(href)
        ) {
          return;
        }

        if (
          titulo.length < 15 ||
          titulo.toLowerCase().includes("próxima página")
        ) {
          return;
        }

        let link;

        try {
          link = new URL(
            href,
            "https://pt.libertycity.net"
          ).toString();
        } catch {
          return;
        }

        if (urlsVistas.has(link)) {
          return;
        }

        urlsVistas.add(link);

        encontrados.push({
          titulo,
          url: link,
          data: null,
        });

        contador++;
      });

      console.log(
        `🔎 LibertyCity: ${contador} possíveis notícias em ${pagina}`
      );
    } catch (erro) {
      console.log(
        `⚠️ LibertyCity: erro em ${pagina}`
      );
    }

    if (encontrados.length >= MAX_NOTICIAS_POR_FONTE) {
      break;
    }
  }

  console.log(
    `📰 LibertyCity: ${encontrados.length} notícias recebidas.`
  );

  return encontrados.slice(0, MAX_NOTICIAS_POR_FONTE);
}

// ============================================================
// GOOGLE NEWS → URL ORIGINAL
// ============================================================

async function decodificarGoogleNews(urlGoogle) {
  try {
    if (!urlGoogle) return null;

    if (
      urlGoogle.includes("rockstargames.com") ||
      urlGoogle.includes("fortnite.com")
    ) {
      return urlGoogle;
    }

    console.log(
      `🔓 Google News: decodificando ${urlGoogle.slice(
        0,
        45
      )}...`
    );

    const resposta = await getComRetry(
      urlGoogle,
      2
    );

    const html = String(resposta.data);

    const matches = html.match(
      /https?:\/\/[^"'\\\s<>]+/gi
    ) || [];

    for (const encontrada of matches) {
      const limpa = encontrada
        .replace(/\\u003d/g, "=")
        .replace(/\\u0026/g, "&")
        .replace(/&amp;/g, "&");

      if (
        limpa.includes("rockstargames.com/newswire") ||
        limpa.includes("rockstargames.com/br/newswire")
      ) {
        const urlFinal = limparUrlRockstar(limpa);

        if (urlFinal) {
          console.log(
            `✅ Google News decodificado: ${urlFinal}`
          );

          return urlFinal;
        }
      }
    }

    // Tentativa alternativa procurando URLs escapadas
    const rockstarMatch = html.match(
      /https?:\\\/\\\/(?:www\.)?rockstargames\.com[^"'\\\s<>]+/gi
    );

    if (rockstarMatch) {
      let url = rockstarMatch[0]
        .replace(/\\\//g, "/")
        .replace(/\\u003d/g, "=")
        .replace(/\\u0026/g, "&");

      url = limparUrlRockstar(url);

      if (url) {
        console.log(
          `✅ Google News decodificado: ${url}`
        );

        return url;
      }
    }

    return null;
  } catch (erro) {
    console.log(
      `⚠️ Google News: erro ao decodificar.`
    );

    return null;
  }
}

// ============================================================
// ROCKSTAR
// ============================================================

async function buscarNoticiasRockstar() {
  console.log("━━━━━━━━ Rockstar ━━━━━━━━");
  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  const dataBusca = new Date(
    Date.now() -
      MAX_IDADE_NOTICIA_DIAS *
        24 *
        60 *
        60 *
        1000
  )
    .toISOString()
    .slice(0, 10);

  const consultas = [
    `site:rockstargames.com/br/newswire/article after:${dataBusca}`,
    `site:rockstargames.com/newswire/article after:${dataBusca}`,
  ];

  const encontrados = [];
  const urlsVistas = new Set();

  for (const consulta of consultas) {
    try {
      const rssUrl =
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent(consulta) +
        "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

      console.log(
        `🔎 Rockstar RSS: ${consulta}`
      );

      const resposta = await getComRetry(
        rssUrl,
        2
      );

      const feed = await rssParser.parseString(
        resposta.data
      );

      console.log(
        `📰 Rockstar RSS: ${feed.items.length} itens encontrados.`
      );

      for (const item of feed.items) {
        if (
          encontrados.length >=
          MAX_NOTICIAS_POR_FONTE
        ) {
          break;
        }

        const titulo = limparTexto(item.title);

        if (!titulo) continue;

        let urlOriginal = await decodificarGoogleNews(
          item.link
        );

        if (!urlOriginal) {
          continue;
        }

        urlOriginal =
          limparUrlRockstar(urlOriginal);

        if (!urlOriginal) continue;

        if (!urlOriginal.includes("/newswire/article/")) {
          continue;
        }

        if (urlsVistas.has(urlOriginal)) {
          continue;
        }

        urlsVistas.add(urlOriginal);

        encontrados.push({
          titulo,
          url: urlOriginal,
          data: item.pubDate || null,
        });
      }
    } catch (erro) {
      console.log(
        `⚠️ Rockstar RSS: erro: ${erro.message}`
      );
    }

    if (
      encontrados.length >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }
  }

  console.log(
    `📰 Rockstar: ${encontrados.length} notícias oficiais encontradas.`
  );

  return encontrados;
}

// ============================================================
// PROCESSAR FONTE
// ============================================================

async function processarNoticias(
  noticias,
  categoria,
  canal
) {
  if (!noticias || noticias.length === 0) {
    console.log(
      `⚠️ ${categoria}: nenhuma notícia encontrada.`
    );
    return;
  }

  let publicadas = 0;

  for (const noticia of noticias) {
    if (
      !noticiaRecente(noticia.data)
    ) {
      console.log(
        `⏭️ ${categoria}: notícia antiga ignorada: ${noticia.titulo}`
      );
      continue;
    }

    const resumo =
      await buscarResumoPagina(
        noticia.url,
        categoria
      );

    const publicou =
      await publicarNoticia({
        canal,
        categoria,
        titulo: noticia.titulo,
        url: noticia.url,
        resumo,
      });

    if (publicou) {
      publicadas++;
      await esperar(1200);
    }
  }

  console.log(
    `📊 ${categoria}: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}

// ============================================================
// CICLO PRINCIPAL
// ============================================================

async function executarCicloNoticias() {
  if (cicloEmAndamento) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando."
    );
    return;
  }

  cicloEmAndamento = true;

  console.log("========================================");
  console.log("📰 INICIANDO CICLO DE NOTÍCIAS");
  console.log(`🇧🇷 ${obterDataBrasil()}`);
  console.log("========================================");

  try {
    const canalFortnite =
      await client.channels.fetch(
        ID_FORTNITE
      );

    const canalGTA =
      await client.channels.fetch(
        ID_GTA
      );

    // --------------------------------------------------------
    // FORTNITE
    // --------------------------------------------------------

    try {
      const noticiasFortnite =
        await buscarNoticiasFortnite();

      await processarNoticias(
        noticiasFortnite,
        "Fortnite",
        canalFortnite
      );
    } catch (erro) {
      console.error(
        "❌ Fortnite:",
        erro.message
      );
    }

    // --------------------------------------------------------
    // LIBERTYCITY
    // --------------------------------------------------------

    try {
      const noticiasLiberty =
        await buscarNoticiasLibertyCity();

      await processarNoticias(
        noticiasLiberty,
        "GTA",
        canalGTA
      );
    } catch (erro) {
      console.error(
        "❌ LibertyCity:",
        erro.message
      );
    }

    // --------------------------------------------------------
    // ROCKSTAR
    // --------------------------------------------------------

    try {
      const noticiasRockstar =
        await buscarNoticiasRockstar();

      await processarNoticias(
        noticiasRockstar,
        "GTA",
        canalGTA
      );
    } catch (erro) {
      console.error(
        "❌ Rockstar:",
        erro.message
      );
    }
  } catch (erro) {
    console.error(
      "❌ Erro geral no ciclo:",
      erro.message
    );
  } finally {
    cicloEmAndamento = false;

    console.log("========================================");
    console.log("🏁 CICLO DE NOTÍCIAS FINALIZADO");
    console.log("========================================");
  }
}

// ============================================================
// LOJA FORTNITE
// ============================================================

async function postarLojaFortnite(
  forcar = false
) {
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

    const hoje = obterDiaBrasil();

    if (
      !forcar &&
      ultimoDiaLoja === hoje
    ) {
      console.log(
        "⏭️ Loja Fortnite já publicada hoje."
      );
      return;
    }

    // Evita duplicação mesmo se o bot reiniciar
    if (!forcar) {
      const mensagens =
        await canal.messages.fetch({
          limit: 30,
        });

      for (const [, mensagem] of mensagens) {
        const existe =
          mensagem.embeds.some(
            (embed) =>
              embed.url ===
              LOJA_FORTNITE
          );

        if (existe) {
          ultimoDiaLoja = hoje;

          console.log(
            "⏭️ Loja Fortnite já encontrada no canal hoje."
          );

          return;
        }
      }
    }

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setURL(LOJA_FORTNITE)
        .setDescription(
          "🔥 **A Loja de Itens do Fortnite acabou de atualizar!**\n\n" +
            "👀 Confira todas as skins, picaretas, gestos, mochilas e outros itens disponíveis hoje.\n\n" +
            "👇 **Clique no título acima para abrir a loja oficial.**"
        )
        .setImage(
          "https://fortnite.gg/img/og-shop.jpg"
        )
        .setFooter({
          text: "Murilito NEWS • Loja Fortnite",
        })
        .setTimestamp();

    await canal.send({
      content:
        "@everyone\n🛒 **CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR!** 🔥",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    ultimoDiaLoja = hoje;

    console.log(
      "🛒 Loja Fortnite publicada com sucesso."
    );
  } catch (erro) {
    console.error(
      "❌ Erro na loja Fortnite:",
      erro.message
    );
  }
}

// ============================================================
// AGENDAMENTO DA LOJA — 21:00 BRASIL
// ============================================================

function agendarLoja21h() {
  const agora = new Date();

  const brasil = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }
  ).formatToParts(agora);

  const partes = {};

  for (const parte of brasil) {
    partes[parte.type] = parte.value;
  }

  const hora = Number(partes.hour);
  const minuto = Number(partes.minute);
  const segundo = Number(partes.second);

  let segundosAte21 =
    (21 * 60 * 60) -
    (hora * 60 * 60 +
      minuto * 60 +
      segundo);

  if (segundosAte21 <= 0) {
    segundosAte21 += 24 * 60 * 60;
  }

  console.log(
    `⏰ Próxima verificação agendada da loja em aproximadamente ${segundosAte21} segundos.`
  );

  setTimeout(async () => {
    await postarLojaFortnite(false);
    agendarLoja21h();
  }, segundosAte21 * 1000);
}

// ============================================================
// COMANDOS
// ============================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const comando =
    message.content.trim().toLowerCase();

  try {
    // --------------------------------------------------------
    // TESTE GERAL
    // --------------------------------------------------------

    if (comando === "!teste") {
      await message.reply(
        "🧪 **Iniciando teste completo do Murilito NEWS...**"
      );

      await postarLojaFortnite(true);
      await executarCicloNoticias();

      return;
    }

    // --------------------------------------------------------
    // TESTE FORTNITE
    // --------------------------------------------------------

    if (
      comando === "!teste fortnite"
    ) {
      await message.reply(
        "🎮 **Testando notícias do Fortnite...**"
      );

      const canal =
        await client.channels.fetch(
          ID_FORTNITE
        );

      const noticias =
        await buscarNoticiasFortnite();

      if (
        noticias.length === 0
      ) {
        await message.reply(
          "⚠️ Não encontrei notícias do Fortnite agora."
        );
        return;
      }

      await processarNoticias(
        noticias,
        "Fortnite",
        canal
      );

      return;
    }

    // --------------------------------------------------------
    // TESTE LIBERTYCITY
    // --------------------------------------------------------

    if (
      comando === "!teste liberty"
    ) {
      await message.reply(
        "🚔 **Testando LibertyCity...**"
      );

      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      const noticias =
        await buscarNoticiasLibertyCity();

      await processarNoticias(
        noticias,
        "GTA",
        canal
      );

      return;
    }

    // --------------------------------------------------------
    // TESTE ROCKSTAR
    // --------------------------------------------------------

    if (
      comando === "!teste rockstar"
    ) {
      await message.reply(
        "🚔 **Testando Rockstar Newswire...**"
      );

      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      const noticias =
        await buscarNoticiasRockstar();

      await processarNoticias(
        noticias,
        "GTA",
        canal
      );

      return;
    }

    // --------------------------------------------------------
    // TESTE LOJA
    // --------------------------------------------------------

    if (
      comando === "!teste loja"
    ) {
      await message.reply(
        "🛒 **Testando Loja Fortnite...**"
      );

      await postarLojaFortnite(true);

      return;
    }

    // --------------------------------------------------------
    // PIADA
    // --------------------------------------------------------

    if (comando === "!piada") {
      const piadas = [
        "Por que o jogador levou o Fortnite para o médico? Porque estava com falta de skin. 😂",
        "GTA Online é igual boleto: quando você acha que acabou, aparece outro. 😂",
        "Meu PC não trava no GTA... ele só precisa pensar um pouco. 😂",
        "Eu ia economizar dinheiro, mas a Loja do Fortnite atualizou. 💸😂",
        "Meu personagem no GTA tem mais carro que eu na vida real. 😂",
      ];

      const piada =
        piadas[
          Math.floor(
            Math.random() *
              piadas.length
          )
        ];

      await message.reply(
        `😂 ${piada}`
      );

      return;
    }

    // --------------------------------------------------------
    // AJUDA
    // --------------------------------------------------------

    if (comando === "!ajuda") {
      const embed =
        new EmbedBuilder()
          .setTitle(
            "🤖 Murilito NEWS — Comandos"
          )
          .setDescription(
            [
              "🧪 **Testes**",
              "`!teste` — testa tudo",
              "`!teste fortnite` — testa Fortnite",
              "`!teste liberty` — testa LibertyCity",
              "`!teste rockstar` — testa Rockstar",
              "`!teste loja` — testa a Loja Fortnite",
              "",
              "😂 **Diversão**",
              "`!piada` — manda uma piada",
              "",
              "📰 **Automático**",
              "Fortnite e GTA são verificados automaticamente a cada 10 minutos.",
              "A Loja do Fortnite é verificada diariamente às 21:00.",
            ].join("\n")
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
    console.error(
      "❌ Erro no comando:",
      erro.message
    );

    try {
      await message.reply(
        "❌ Ocorreu um erro ao executar esse comando."
      );
    } catch {}
  }
});

// ============================================================
// BOT ONLINE
// ============================================================

client.once(
  "clientReady",
  async () => {
    console.log("========================================");
    console.log(
      `🤖 ${client.user.tag} está ONLINE!`
    );
    console.log("========================================");

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
      `🛒 Loja: ${LOJA_FORTNITE}`
    );

    console.log("========================================");

    // Primeiro ciclo
    await executarCicloNoticias();

    // Verificação da loja
    await postarLojaFortnite(false);

    // Notícias a cada 10 minutos
    setInterval(
      executarCicloNoticias,
      INTERVALO_NOTICIAS
    );

    // Watchdog da loja
    setInterval(() => {
      console.log(
        `🕘 Watchdog loja: ${obterDataBrasil()}`
      );

      const horaAtual =
        new Intl.DateTimeFormat(
          "en-US",
          {
            timeZone:
              "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }
        ).format(new Date());

      if (
        horaAtual === "21:00"
      ) {
        postarLojaFortnite(false);
      }
    }, INTERVALO_VERIFICACAO_LOJA);

    agendarLoja21h();
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
