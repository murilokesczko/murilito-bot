require("dotenv").config();

const axios = require("axios");
const cheerio = require("cheerio");
const Parser = require("rss-parser");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

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

const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const INTERVALO_VERIFICACAO_LOJA = 30 * 1000;

const MAX_IDADE_NOTICIA_DIAS = 7;

const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  },
});

// ======================================================
// DISCORD
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ======================================================
// FRASES ENGRAÇADAS
// ======================================================

const FRASES_FORTNITE = [
  "🎮 A ilha está pegando fogo. E o Murilito NEWS também.",
  "🚨 Mais uma novidade direto da ilha. Corre antes que a skin suma.",
  "🔥 A Epic mexeu de novo. Já pode preparar os V-Bucks.",
  "👀 Tem novidade no Fortnite. E você soube primeiro aqui.",
  "🎯 Informação quentinha direto da ilha.",
  "🛒 Se tiver V-Bucks, é melhor nem olhar.",
  "⚡ A ilha não para e o Murilito NEWS também não.",
];

const FRASES_GTA = [
  "🚔 A polícia de Los Santos já está sabendo. E você?",
  "🔥 Los Santos não para e o Murilito NEWS também não.",
  "🚨 Mais uma ocorrência registrada diretamente de Los Santos.",
  "👀 A Rockstar aprontou de novo.",
  "💰 Prepare o bolso, porque Los Santos nunca dá notícia de graça.",
  "🚔 Atenção, cidadão de Los Santos: temos novidades.",
  "🔥 GTA NEWS chegando quente diretamente para vocês.",
];

function fraseAleatoria(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// ======================================================
// HTTP COM RETRY
// ======================================================

async function getComRetry(url, opcoes = {}, tentativas = 3) {
  let ultimoErro;

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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":
            "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          Referer: "https://www.google.com/",
          ...opcoes.headers,
        },

        ...opcoes,
      });

      console.log(`✅ HTTP ${resposta.status} | ${url}`);

      return resposta;
    } catch (erro) {
      ultimoErro = erro;

      console.log(`⚠️ Falha HTTP: ${url}`);

      if (erro.response) {
        console.log(`   ${erro.response.status}`);
      } else {
        console.log(`   ${erro.message}`);
      }

      if (tentativa < tentativas) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1500 * tentativa)
        );
      }
    }
  }

  throw ultimoErro;
}

// ======================================================
// LIMPEZA DE TEXTO
// ======================================================

function normalizarTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function limitarTexto(texto, limite = 420) {
  texto = normalizarTexto(texto);

  if (!texto) return "";

  if (texto.length <= limite) {
    return texto;
  }

  let cortado = texto.substring(0, limite);

  const ultimoEspaco = cortado.lastIndexOf(" ");

  if (ultimoEspaco > 250) {
    cortado = cortado.substring(0, ultimoEspaco);
  }

  return `${cortado}...`;
}

function resumoValido(texto, titulo = "") {
  texto = normalizarTexto(texto);
  titulo = normalizarTexto(titulo);

  if (!texto) return false;

  if (texto.length < 50) return false;

  const textoLower = texto.toLowerCase();

  const genericos = [
    "leia mais",
    "read more",
    "clique aqui",
    "confira a notícia",
    "confira a noticia",
    "saiba mais",
    "veja mais",
    "acesse o site",
  ];

  if (
    genericos.some((palavra) =>
      textoLower === palavra ||
      textoLower.startsWith(`${palavra}.`)
    )
  ) {
    return false;
  }

  if (
    titulo &&
    textoLower === titulo.toLowerCase()
  ) {
    return false;
  }

  return true;
}

// ======================================================
// BUSCA RESUMO DIRETAMENTE DA MATÉRIA
// ======================================================

async function buscarResumoPagina(url, fonte, titulo = "") {
  if (!url) return "";

  if (
    url.includes("news.google.com") ||
    url.includes("google.com/search")
  ) {
    return "";
  }

  try {
    console.log(`📝 ${fonte}: buscando resumo da matéria...`);

    const resposta = await getComRetry(
      url,
      {
        responseType: "text",
      },
      2
    );

    const html = resposta.data;
    const $ = cheerio.load(html);

    // -----------------------------------------------
    // 1. Open Graph
    // -----------------------------------------------

    const ogDescription = normalizarTexto(
      $('meta[property="og:description"]').attr("content")
    );

    if (resumoValido(ogDescription, titulo)) {
      console.log(`✅ ${fonte}: resumo encontrado via og:description`);

      return limitarTexto(ogDescription);
    }

    // -----------------------------------------------
    // 2. Meta description
    // -----------------------------------------------

    const metaDescription = normalizarTexto(
      $('meta[name="description"]').attr("content")
    );

    if (resumoValido(metaDescription, titulo)) {
      console.log(`✅ ${fonte}: resumo encontrado via meta description`);

      return limitarTexto(metaDescription);
    }

    // -----------------------------------------------
    // 3. Twitter description
    // -----------------------------------------------

    const twitterDescription = normalizarTexto(
      $('meta[name="twitter:description"]').attr("content")
    );

    if (resumoValido(twitterDescription, titulo)) {
      console.log(
        `✅ ${fonte}: resumo encontrado via Twitter description`
      );

      return limitarTexto(twitterDescription);
    }

    // -----------------------------------------------
    // 4. Seletores específicos
    // -----------------------------------------------

    let seletores = [];

    if (fonte === "LibertyCity") {
      seletores = [
        "article p",
        ".article-content p",
        ".news-content p",
        ".news-text p",
        ".content-news p",
        ".post-content p",
        "main article p",
        "main p",
      ];
    }

    if (fonte === "Fortnite") {
      seletores = [
        "article p",
        ".article-content p",
        ".news-content p",
        ".content p",
        "main article p",
        "main p",
      ];
    }

    if (fonte === "Rockstar") {
      seletores = [
        "article p",
        ".article-content p",
        ".news-content p",
        ".wysiwyg p",
        "main article p",
        "main p",
      ];
    }

    const paragrafos = [];

    for (const seletor of seletores) {
      $(seletor).each((i, el) => {
        if (paragrafos.length >= 5) return;

        const texto = normalizarTexto($(el).text());

        if (
          resumoValido(texto, titulo) &&
          texto.length >= 60
        ) {
          paragrafos.push(texto);
        }
      });

      if (paragrafos.length >= 2) {
        break;
      }
    }

    if (paragrafos.length > 0) {
      let resumo = paragrafos.slice(0, 2).join(" ");

      resumo = normalizarTexto(resumo);

      if (resumoValido(resumo, titulo)) {
        console.log(
          `✅ ${fonte}: resumo encontrado nos parágrafos da matéria`
        );

        return limitarTexto(resumo);
      }
    }

    console.log(`⚠️ ${fonte}: não consegui extrair resumo.`);

    return "";
  } catch (erro) {
    console.log(
      `⚠️ ${fonte}: erro ao buscar resumo: ${erro.message}`
    );

    return "";
  }
}

// ======================================================
// DATA DA NOTÍCIA
// ======================================================

function dataValida(data) {
  if (!data) return true;

  const dataNoticia = new Date(data);

  if (isNaN(dataNoticia.getTime())) {
    return true;
  }

  const agora = Date.now();

  const idade =
    (agora - dataNoticia.getTime()) /
    (1000 * 60 * 60 * 24);

  return idade <= MAX_IDADE_NOTICIA_DIAS;
}

// ======================================================
// GOOGLE NEWS → LINK ORIGINAL
// ======================================================

async function converterGoogleNewsParaOriginal(urlGoogle) {
  if (!urlGoogle) return "";

  if (!urlGoogle.includes("news.google.com")) {
    return urlGoogle;
  }

  try {
    const resposta = await getComRetry(
      urlGoogle,
      {
        responseType: "text",
      },
      2
    );

    const $ = cheerio.load(resposta.data);

    const links = [];

    $("a[href]").each((i, el) => {
      const href = $(el).attr("href");

      if (href) {
        links.push(href);
      }
    });

    const candidatos = links.filter((link) => {
      return (
        link.includes("fortnite.gg/news") ||
        link.includes("fortnite.com/news") ||
        link.includes("rockstargames.com/newswire")
      );
    });

    if (candidatos.length > 0) {
      const original = candidatos[0];

      console.log(
        `🔗 Google News convertido para: ${original}`
      );

      return original;
    }

    return "";
  } catch (erro) {
    console.log(
      `⚠️ Não consegui converter Google News: ${erro.message}`
    );

    return "";
  }
}

// ======================================================
// RSS
// ======================================================

async function buscarRSS(url, fonte) {
  try {
    const feed = await parser.parseURL(url);

    if (!feed.items || feed.items.length === 0) {
      console.log(`⚠️ ${fonte}: RSS sem itens.`);
      return [];
    }

    const noticias = [];

    for (const item of feed.items) {
      let link = item.link || "";

      if (link.includes("news.google.com")) {
        link = await converterGoogleNewsParaOriginal(link);
      }

      if (!link) continue;

      let titulo = normalizarTexto(
        item.title ||
          item.creator ||
          item.name
      );

      if (!titulo) continue;

      let descricao = normalizarTexto(
        item.contentSnippet ||
          item.content ||
          item.summary ||
          item.description
      );

      let data =
        item.isoDate ||
        item.pubDate ||
        item.date ||
        null;

      noticias.push({
        titulo,
        url: link,
        descricao,
        data,
        imagem: null,
      });
    }

    return noticias;
  } catch (erro) {
    console.log(
      `⚠️ ${fonte}: erro RSS: ${erro.message}`
    );

    return [];
  }
}

// ======================================================
// FORTNITE API
// ======================================================

function extrairObjetosRecursivamente(obj, resultado = []) {
  if (!obj || typeof obj !== "object") {
    return resultado;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extrairObjetosRecursivamente(item, resultado);
    }

    return resultado;
  }

  const titulo =
    obj.title ||
    obj.name ||
    obj.headline ||
    obj.displayName;

  const descricao =
    obj.body ||
    obj.description ||
    obj.message ||
    obj.summary ||
    obj.content;

  const url =
    obj.url ||
    obj.link ||
    obj.href;

  if (
    titulo &&
    typeof titulo === "string" &&
    (
      descricao ||
      url
    )
  ) {
    resultado.push({
      titulo: normalizarTexto(titulo),
      descricao: normalizarTexto(descricao || ""),
      url: url || "",
      data:
        obj.date ||
        obj.publishedAt ||
        obj.published ||
        obj.createdAt ||
        null,
      imagem:
        obj.image ||
        obj.imageUrl ||
        obj.thumbnail ||
        null,
    });
  }

  for (const chave of Object.keys(obj)) {
    const valor = obj[chave];

    if (
      valor &&
      typeof valor === "object"
    ) {
      extrairObjetosRecursivamente(
        valor,
        resultado
      );
    }
  }

  return resultado;
}

async function buscarFortniteAPI() {
  const urls = [
    "https://fortnite-api.com/v2/news?language=pt-BR",
    "https://fortnite-api.com/v2/news/br",
    "https://fortnite-api.com/v2/news",
  ];

  for (const url of urls) {
    try {
      console.log(
        `🔎 Fortnite API: tentando ${url}`
      );

      const resposta = await getComRetry(
        url,
        {
          responseType: "json",
        },
        2
      );

      const candidatos =
        extrairObjetosRecursivamente(
          resposta.data
        );

      const unicos = [];
      const vistos = new Set();

      for (const item of candidatos) {
        const chave =
          `${item.titulo}|${item.url}`;

        if (vistos.has(chave)) continue;

        vistos.add(chave);

        if (!item.titulo) continue;

        if (
          item.url &&
          (
            item.url.includes("fortnite") ||
            item.url.includes("epicgames")
          )
        ) {
          unicos.push(item);
        }
      }

      if (unicos.length > 0) {
        console.log(
          `✅ Fortnite API encontrou ${unicos.length} candidatos.`
        );

        return unicos;
      }

      console.log(
        "⚠️ Fortnite API respondeu, mas não encontrei notícias na estrutura."
      );
    } catch (erro) {
      console.log(
        `⚠️ Fortnite API falhou: ${erro.message}`
      );
    }
  }

  return [];
}

// ======================================================
// FORTNITE RSS FALLBACK
// ======================================================

async function buscarFortniteRSS() {
  const consultas = [
    "site:fortnite.gg/news after:2026-09-01",
    "site:fortnite.com/news after:2026-09-01",
  ];

  for (const consulta of consultas) {
    const url =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(consulta) +
      "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

    console.log(
      `🔎 Fortnite RSS: ${consulta}`
    );

    const noticias = await buscarRSS(
      url,
      "Fortnite"
    );

    const filtradas = noticias.filter(
      (noticia) =>
        noticia.url.includes("fortnite.gg/news") ||
        noticia.url.includes("fortnite.com/news")
    );

    if (filtradas.length > 0) {
      console.log(
        `✅ Fortnite RSS encontrou ${filtradas.length} notícias.`
      );

      return filtradas;
    }
  }

  return [];
}

// ======================================================
// FORTNITE
// ======================================================

async function buscarFortnite() {
  console.log(
    "🔎 Fortnite: iniciando busca de notícias."
  );

  let noticias = await buscarFortniteAPI();

  if (noticias.length === 0) {
    console.log(
      "⚠️ Fortnite API sem notícias. Usando RSS."
    );

    noticias = await buscarFortniteRSS();
  }

  noticias = noticias.filter((noticia) =>
    dataValida(noticia.data)
  );

  return noticias;
}

// ======================================================
// LIBERTYCITY
// ======================================================

async function buscarLibertyCity() {
  const paginas = [
    "https://pt.libertycity.net/news/",
    "https://pt.libertycity.net/news/page/2/",
  ];

  const noticias = [];

  for (const pagina of paginas) {
    try {
      const resposta = await getComRetry(
        pagina,
        {
          responseType: "text",
        },
        3
      );

      const $ = cheerio.load(
        resposta.data
      );

      const linksEncontrados = new Set();

      $("a[href]").each((i, el) => {
        let href = $(el).attr("href");

        if (!href) return;

        if (href.startsWith("/")) {
          href =
            "https://pt.libertycity.net" +
            href;
        }

        if (!href.includes("pt.libertycity.net/news/")) {
          return;
        }

        // Ignorar paginação
        if (
          /\/news\/page\/\d+\/?$/i.test(href)
        ) {
          return;
        }

        // Ignorar categorias
        if (
          /\/news\/(gta-6|gta-5|gta-online|tag|search|category)\//i.test(
            href
          )
        ) {
          return;
        }

        // Só aceitar matérias .html
        if (!href.endsWith(".html")) {
          return;
        }

        linksEncontrados.add(href);
      });

      console.log(
        `🔎 LibertyCity: ${linksEncontrados.size} possíveis notícias.`
      );

      for (const url of linksEncontrados) {
        let titulo = "";

        const link = $(
          `a[href="${url}"]`
        ).first();

        if (link.length) {
          titulo = normalizarTexto(
            link.text()
          );
        }

        if (!titulo) {
          titulo = normalizarTexto(
            link
              .closest("article")
              .find("h2,h3,h4")
              .first()
              .text()
          );
        }

        if (!titulo) continue;

        noticias.push({
          titulo,
          url,
          descricao: "",
          data: null,
          imagem: null,
        });
      }
    } catch (erro) {
      console.log(
        `⚠️ LibertyCity: erro em ${pagina}: ${erro.message}`
      );
    }
  }

  // Remover duplicados
  const unicas = [];
  const urls = new Set();

  for (const noticia of noticias) {
    if (urls.has(noticia.url)) continue;

    urls.add(noticia.url);
    unicas.push(noticia);
  }

  console.log(
    `📰 LibertyCity: ${unicas.length} notícias recebidas.`
  );

  return unicas.slice(0, 10);
}

// ======================================================
// ROCKSTAR RSS
// ======================================================

async function buscarRockstarRSS() {
  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  const consultas = [
    "site:rockstargames.com/br/newswire after:2026-09-01",
    "site:rockstargames.com/newswire after:2026-09-01",
  ];

  for (const consulta of consultas) {
    const url =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(consulta) +
      "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

    const noticias = await buscarRSS(
      url,
      "Rockstar"
    );

    const filtradas = noticias.filter(
      (noticia) => {
        return (
          noticia.url.includes(
            "rockstargames.com/br/newswire/"
          ) ||
          noticia.url.includes(
            "rockstargames.com/newswire/"
          )
        );
      }
    );

    if (filtradas.length > 0) {
      console.log(
        `✅ Rockstar RSS encontrou ${filtradas.length} notícias.`
      );

      return filtradas;
    }
  }

  return [];
}

// ======================================================
// ROCKSTAR HTML
// ======================================================

async function buscarRockstarHTML() {
  const urls = [
    "https://www.rockstargames.com/br/newswire",
    "https://www.rockstargames.com/newswire",
  ];

  for (const url of urls) {
    try {
      const resposta = await getComRetry(
        url,
        {
          responseType: "text",
        },
        2
      );

      const html = resposta.data;

      console.log(
        `🔎 Rockstar: HTML recebido (${html.length} caracteres).`
      );

      const encontrados = new Set();

      const regex =
        /https?:\/\/(?:www\.)?rockstargames\.com\/(?:br\/)?newswire\/[a-zA-Z0-9/_-]+/gi;

      const matches =
        html.match(regex) || [];

      for (const match of matches) {
        encontrados.add(match);
      }

      console.log(
        `🔎 Rockstar: ${encontrados.size} possíveis URLs encontradas.`
      );

      const noticias = [];

      for (const link of encontrados) {
        noticias.push({
          titulo: "Notícia Rockstar",
          url: link,
          descricao: "",
          data: null,
          imagem: null,
        });
      }

      if (noticias.length > 0) {
        return noticias;
      }
    } catch (erro) {
      console.log(
        `⚠️ Rockstar HTML: ${erro.message}`
      );
    }
  }

  return [];
}

// ======================================================
// ROCKSTAR
// ======================================================

async function buscarRockstar() {
  let noticias =
    await buscarRockstarRSS();

  if (noticias.length === 0) {
    console.log(
      "⚠️ Rockstar RSS sem notícias. Tentando HTML oficial."
    );

    noticias =
      await buscarRockstarHTML();
  }

  noticias = noticias.filter((noticia) =>
    dataValida(noticia.data)
  );

  if (noticias.length === 0) {
    console.log(
      "⚠️ Rockstar: nenhuma notícia válida encontrada."
    );
  }

  return noticias;
}

// ======================================================
// VERIFICAR DUPLICIDADE NO DISCORD
// ======================================================

async function noticiaJaPublicada(canal, url) {
  if (!url) return false;

  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 100,
      });

    for (const [, mensagem] of mensagens) {
      for (const embed of mensagem.embeds) {
        if (embed.url === url) {
          return true;
        }

        if (
          embed.description &&
          embed.description.includes(url)
        ) {
          return true;
        }
      }

      if (
        mensagem.content &&
        mensagem.content.includes(url)
      ) {
        return true;
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

async function publicarNoticia(
  canal,
  noticia,
  fonte
) {
  if (!noticia || !noticia.url) {
    return false;
  }

  let url = noticia.url;

  // Nunca publicar Google News
  if (url.includes("news.google.com")) {
    console.log(
      `⏭️ ${fonte}: link Google News ignorado.`
    );

    return false;
  }

  if (
    await noticiaJaPublicada(
      canal,
      url
    )
  ) {
    console.log(
      `⏭️ ${fonte}: já publicada: ${noticia.titulo}`
    );

    return false;
  }

  let titulo =
    normalizarTexto(noticia.titulo) ||
    "Nova notícia";

  let descricao =
    normalizarTexto(noticia.descricao);

  // ====================================================
  // NOVA PARTE DA V4
  // Buscar resumo real quando não temos
  // ====================================================

  if (!resumoValido(descricao, titulo)) {
    descricao =
      await buscarResumoPagina(
        url,
        fonte,
        titulo
      );
  }

  if (!descricao) {
    descricao =
      "Confira todos os detalhes da notícia acessando a matéria completa.";
  }

  descricao = limitarTexto(
    descricao,
    420
  );

  let frase = "";

  if (fonte === "Fortnite") {
    frase =
      fraseAleatoria(FRASES_FORTNITE);
  } else {
    frase =
      fraseAleatoria(FRASES_GTA);
  }

  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setURL(url)
    .setDescription(
      `📰 **Resumo:**\n${descricao}\n\n🔗 **Clique no título acima para ler a matéria completa.**`
    )
    .setFooter({
      text: `Murilito NEWS • ${fonte}`,
    })
    .setTimestamp();

  if (noticia.imagem) {
    try {
      embed.setImage(noticia.imagem);
    } catch (_) {}
  }

  try {
    await canal.send({
      content: `@everyone\n${frase}`,
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log(
      `📢 ${fonte}: notícia publicada.`
    );

    console.log(
      `   ${titulo}`
    );

    console.log(
      `   ${url}`
    );

    console.log(
      `   💬 ${frase}`
    );

    console.log(
      `   📰 Resumo: ${descricao}`
    );

    return true;
  } catch (erro) {
    console.log(
      `❌ ${fonte}: erro ao publicar: ${erro.message}`
    );

    return false;
  }
}

// ======================================================
// PROCESSAR FONTE
// ======================================================

async function processarFonte(
  nome,
  canalId,
  buscarFuncao
) {
  console.log(
    `━━━━━━━━ ${nome} ━━━━━━━━`
  );

  try {
    const canal =
      await client.channels.fetch(
        canalId
      );

    if (!canal) {
      console.log(
        `❌ ${nome}: canal não encontrado.`
      );

      return;
    }

    const noticias =
      await buscarFuncao();

    if (!noticias || noticias.length === 0) {
      console.log(
        `⚠️ ${nome}: nenhuma notícia encontrada.`
      );

      return;
    }

    console.log(
      `📰 ${nome}: ${noticias.length} notícias recebidas.`
    );

    for (const noticia of noticias) {
      const publicada =
        await publicarNoticia(
          canal,
          noticia,
          nome
        );

      if (publicada) {
        break;
      }
    }

    // Pequena pausa entre fontes
    await new Promise((resolve) =>
      setTimeout(resolve, 2000)
    );
  } catch (erro) {
    console.log(
      `❌ ${nome}: erro geral: ${erro.message}`
    );
  }
}

// ======================================================
// CICLO DE NOTÍCIAS
// ======================================================

let executandoNoticias = false;

async function cicloNoticias() {
  if (executandoNoticias) {
    console.log(
      "⚠️ Ciclo anterior ainda está rodando. Ignorando."
    );

    return;
  }

  executandoNoticias = true;

  console.log(
    "========================================"
  );

  console.log(
    "📰 INICIANDO CICLO DE NOTÍCIAS"
  );

  console.log(
    `🇧🇷 ${new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    })}`
  );

  console.log(
    "========================================"
  );

  try {
    await processarFonte(
      "Fortnite",
      ID_FORTNITE,
      buscarFortnite
    );

    await processarFonte(
      "LibertyCity",
      ID_GTA,
      buscarLibertyCity
    );

    await processarFonte(
      "Rockstar",
      ID_GTA,
      buscarRockstar
    );
  } catch (erro) {
    console.log(
      `❌ Erro no ciclo: ${erro.message}`
    );
  }

  console.log(
    "========================================"
  );

  console.log(
    "✅ CICLO FINALIZADO"
  );

  console.log(
    "========================================"
  );

  executandoNoticias = false;
}

// ======================================================
// LOJA FORTNITE
// ======================================================

let ultimoDiaLoja = null;

function obterDiaBrasil() {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(new Date());
}

async function postarLojaFortnite(
  forcar = false
) {
  const hoje = obterDiaBrasil();

  if (!forcar && ultimoDiaLoja === hoje) {
    return;
  }

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

    // Evita postar várias vezes no mesmo dia
    const mensagens =
      await canal.messages.fetch({
        limit: 30,
      });

    if (!forcar) {
      for (const [, mensagem] of mensagens) {
        if (
          mensagem.embeds.some(
            (embed) =>
              embed.url ===
              LOJA_FORTNITE
          )
        ) {
          ultimoDiaLoja = hoje;

          console.log(
            "⏭️ Loja Fortnite já publicada hoje."
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
        .setURL(
          LOJA_FORTNITE
        )
        .setDescription(
          "🔥 A Loja de Itens do Fortnite acabou de atualizar!\n\n" +
          "👀 Confira as skins, emotes, picaretas, gestos e outros itens disponíveis hoje.\n\n" +
          "🔗 **Clique no título acima para abrir a loja oficial.**"
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
        "@everyone\n🛒 CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR! 🔥",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    ultimoDiaLoja = hoje;

    console.log(
      `🛒 Loja Fortnite publicada em ${hoje}.`
    );
  } catch (erro) {
    console.log(
      `❌ Erro ao publicar loja Fortnite: ${erro.message}`
    );
  }
}

// ======================================================
// COMANDOS
// ======================================================

client.on(
  "messageCreate",
  async (message) => {
    if (message.author.bot) return;

    const texto =
      message.content
        .trim()
        .toLowerCase();

    if (texto === "!teste") {
      await message.reply(
        "🤖 Murilito NEWS está online e funcionando!"
      );

      return;
    }

    if (texto === "!teste fortnite") {
      const noticias =
        await buscarFortnite();

      if (
        !noticias ||
        noticias.length === 0
      ) {
        await message.reply(
          "⚠️ Não encontrei notícias do Fortnite."
        );

        return;
      }

      await message.reply(
        `🎮 Encontrei ${noticias.length} notícias do Fortnite.`
      );

      return;
    }

    if (texto === "!teste liberty") {
      const noticias =
        await buscarLibertyCity();

      await message.reply(
        `📰 LibertyCity encontrou ${noticias.length} notícias.`
      );

      return;
    }

    if (texto === "!teste rockstar") {
      const noticias =
        await buscarRockstar();

      await message.reply(
        `🚔 Rockstar encontrou ${noticias.length} notícias.`
      );

      return;
    }

    if (texto === "!teste loja") {
      await postarLojaFortnite(true);

      await message.reply(
        "🛒 Teste da loja Fortnite enviado."
      );

      return;
    }

    if (texto === "!piada") {
      const piadas = [
        "😂 O jogador caiu de uma altura de 1 metro e perdeu a partida.",
        "😂 O maior inimigo do GTA é o boleto.",
        "😂 Fortnite sem V-Bucks é igual GTA sem carro: triste.",
        "😂 O Murilito NEWS nunca dorme. Só o servidor.",
        "😂 A polícia de Los Santos pediu para eu parar de publicar notícia.",
      ];

      await message.reply(
        piadas[
          Math.floor(
            Math.random() *
              piadas.length
          )
        ]
      );

      return;
    }

    if (texto === "!ajuda") {
      await message.reply(
        "🤖 **MURILITO NEWS**\n\n" +
          "`!teste` → testa o bot\n" +
          "`!teste fortnite` → testa notícias Fortnite\n" +
          "`!teste liberty` → testa LibertyCity\n" +
          "`!teste rockstar` → testa Rockstar\n" +
          "`!teste loja` → testa a Loja Fortnite\n" +
          "`!piada` → manda uma piada\n" +
          "`!ajuda` → mostra os comandos"
      );

      return;
    }
  }
);

// ======================================================
// BOT ONLINE
// ======================================================

client.once(
  "ready",
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
      `🛒 Loja: ${LOJA_FORTNITE}`
    );

    console.log(
      "========================================"
    );

    // Executa notícias imediatamente
    await cicloNoticias();

    // Verifica loja
    await postarLojaFortnite();

    // Notícias a cada 10 minutos
    setInterval(
      cicloNoticias,
      INTERVALO_NOTICIAS
    );

    // Verificação da loja
    setInterval(
      postarLojaFortnite,
      INTERVALO_VERIFICACAO_LOJA
    );
  }
);

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
