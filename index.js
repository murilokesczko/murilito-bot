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
// CONFIGURAÇÕES
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

// Notícias com no máximo 7 dias
const MAX_IDADE_NOTICIA_DIAS = 7;

// Quantidade máxima por ciclo
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
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  },
});

// ============================================================
// CONTROLE DA LOJA
// ============================================================

let ultimoDiaLoja = null;
let executandoNoticias = false;
let executandoLoja = false;

// ============================================================
// FRASES DO BOT
// ============================================================

const FRASES = [
  "🚨 Atenção, tropa! Tem novidade na área!",
  "🔥 Murilito NEWS trazendo o furo antes do vizinho!",
  "👀 Já viu isso? Então corre porque pode mudar tudo!",
  "🚔 A polícia de Los Santos já está sabendo.",
  "💥 Essa notícia chegou mais rápido que foguete!",
  "🎮 Mais uma novidade para vocês ficarem por dentro!",
  "📰 Plantão Murilito NEWS ativado!",
  "🔥 Los Santos não para e o Murilito NEWS também não.",
  "👀 Fica ligado porque essa pode dar o que falar!",
  "📢 Informação quentinha saindo do forno!",
];

// ============================================================
// FUNÇÕES GERAIS
// ============================================================

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function limitarTexto(texto, limite = 420) {
  texto = limparTexto(texto);

  if (!texto) return "";

  if (texto.length <= limite) {
    return texto;
  }

  return texto.substring(0, limite - 3).trim() + "...";
}

function fraseAleatoria() {
  return FRASES[Math.floor(Math.random() * FRASES.length)];
}

function obterDiaBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function obterHoraBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function noticiaRecente(data) {
  if (!data) return true;

  const dataNoticia = new Date(data);

  if (Number.isNaN(dataNoticia.getTime())) {
    return true;
  }

  const limite =
    Date.now() -
    MAX_IDADE_NOTICIA_DIAS * 24 * 60 * 60 * 1000;

  return dataNoticia.getTime() >= limite;
}

function normalizarUrl(url) {
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
      "oc",
      "hl",
      "gl",
      "ceid",
    ].forEach((param) => {
      u.searchParams.delete(param);
    });

    return u.toString().replace(/\/$/, "");
  } catch {
    return String(url).trim();
  }
}

// ============================================================
// HTTP ROBUSTO
// ============================================================

async function fazerGet(url, tentativas = 3, opcoes = {}) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const resposta = await axios.get(url, {
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...opcoes.headers,
        },
        ...opcoes,
      });

      console.log(`✅ HTTP ${resposta.status} | ${url}`);

      return resposta;
    } catch (erro) {
      ultimoErro = erro;

      const status = erro.response?.status;

      console.log(
        `⚠️ Falha HTTP: ${url}`
      );

      if (status) {
        console.log(`   Status: ${status}`);
      }

      if (tentativa < tentativas) {
        await esperar(1500 * tentativa);
      }
    }
  }

  console.log(`❌ Falha definitiva: ${url}`);

  throw ultimoErro;
}

// ============================================================
// RESUMO DA MATÉRIA
// ============================================================

async function buscarResumoPagina(url, fonte, titulo) {
  try {
    if (!url || url.includes("news.google.com")) {
      return fraseAleatoria();
    }

    const resposta = await fazerGet(url, 2);

    const $ = cheerio.load(resposta.data);

    let resumo = "";

    // Meta tags
    resumo =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content") ||
      "";

    // Seletores específicos
    if (!resumo && fonte === "LibertyCity") {
      const seletores = [
        "article p",
        ".news-text p",
        ".news-content p",
        ".article-content p",
        ".entry-content p",
        ".content p",
        "main p",
      ];

      for (const seletor of seletores) {
        const textos = [];

        $(seletor).each((_, el) => {
          const texto = limparTexto($(el).text());

          if (
            texto.length > 50 &&
            !texto.includes("Leia mais") &&
            !texto.includes("Comentários")
          ) {
            textos.push(texto);
          }
        });

        if (textos.length > 0) {
          resumo = textos.slice(0, 2).join(" ");
          break;
        }
      }
    }

    if (!resumo && fonte === "Rockstar") {
      const seletores = [
        "article p",
        "main p",
        "[class*='article'] p",
        "[class*='Article'] p",
        "[class*='content'] p",
      ];

      for (const seletor of seletores) {
        const textos = [];

        $(seletor).each((_, el) => {
          const texto = limparTexto($(el).text());

          if (texto.length > 50) {
            textos.push(texto);
          }
        });

        if (textos.length > 0) {
          resumo = textos.slice(0, 2).join(" ");
          break;
        }
      }
    }

    if (!resumo && fonte === "Fortnite") {
      const seletores = [
        "article p",
        "main p",
        "[class*='article'] p",
        "[class*='Article'] p",
        "[class*='news'] p",
      ];

      for (const seletor of seletores) {
        const textos = [];

        $(seletor).each((_, el) => {
          const texto = limparTexto($(el).text());

          if (texto.length > 50) {
            textos.push(texto);
          }
        });

        if (textos.length > 0) {
          resumo = textos.slice(0, 2).join(" ");
          break;
        }
      }
    }

    resumo = limitarTexto(resumo);

    if (!resumo || resumo.length < 30) {
      return `${titulo}. Confira a matéria completa pelo link acima.`;
    }

    return resumo;
  } catch (erro) {
    console.log(
      `⚠️ Não foi possível buscar resumo de ${fonte}:`,
      erro.message
    );

    return `${titulo}. Confira a matéria completa pelo link acima.`;
  }
}

// ============================================================
// DUPLICIDADE
// ============================================================

async function noticiaJaPublicada(canal, url, titulo) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    const urlNormalizada = normalizarUrl(url);
    const tituloNormalizado = limparTexto(titulo).toLowerCase();

    for (const mensagem of mensagens.values()) {
      for (const embed of mensagem.embeds) {
        if (embed.url) {
          const embedUrl = normalizarUrl(embed.url);

          if (
            embedUrl &&
            urlNormalizada &&
            embedUrl === urlNormalizada
          ) {
            return true;
          }
        }

        if (
          embed.title &&
          limparTexto(embed.title)
            .toLowerCase()
            .includes(tituloNormalizado)
        ) {
          return true;
        }
      }
    }

    return false;
  } catch (erro) {
    console.log(
      "⚠️ Erro ao verificar duplicidade:",
      erro.message
    );

    return false;
  }
}

// ============================================================
// PUBLICAR NOTÍCIA
// ============================================================

async function publicarNoticia(
  fonte,
  canal,
  noticia
) {
  try {
    if (!noticia?.titulo || !noticia?.url) {
      return false;
    }

    const url = normalizarUrl(noticia.url);

    if (
      !url ||
      url.includes("news.google.com") ||
      url.startsWith("javascript:")
    ) {
      console.log(
        `⛔ ${fonte}: URL inválida ou ainda é Google News.`
      );

      return false;
    }

    if (
      noticia.data &&
      !noticiaRecente(noticia.data)
    ) {
      console.log(
        `⏭️ ${fonte}: notícia antiga ignorada: ${noticia.titulo}`
      );

      return false;
    }

    if (
      await noticiaJaPublicada(
        canal,
        url,
        noticia.titulo
      )
    ) {
      console.log(
        `⏭️ ${fonte}: já publicada: ${noticia.titulo}`
      );

      return false;
    }

    console.log(
      `📝 ${fonte}: buscando resumo...`
    );

    const resumo =
      noticia.resumo ||
      (await buscarResumoPagina(
        url,
        fonte,
        noticia.titulo
      ));

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(noticia.titulo)
      .setURL(url)
      .setDescription(
        `📰 **Resumo:**\n${limitarTexto(resumo, 600)}\n\n` +
        `🔗 **Clique no título acima para ler a matéria completa.**`
      )
      .setFooter({
        text: `Murilito NEWS • ${fonte}`,
      })
      .setTimestamp();

    if (noticia.imagem) {
      try {
        embed.setImage(noticia.imagem);
      } catch {}
    }

    await canal.send({
      content: `@everyone\n${fraseAleatoria()}`,
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log(`📢 ${fonte}: notícia publicada.`);
    console.log(`   ${noticia.titulo}`);
    console.log(`   ${url}`);

    return true;
  } catch (erro) {
    console.log(
      `❌ ${fonte}: erro ao publicar notícia:`,
      erro.message
    );

    return false;
  }
}

// ============================================================
// FORTNITE
// ============================================================

function extrairNoticiasFortnite(obj, resultado = []) {
  if (!obj || typeof obj !== "object") {
    return resultado;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extrairNoticiasFortnite(item, resultado);
    }

    return resultado;
  }

  const chaves = Object.keys(obj);

  const titulo =
    obj.title ||
    obj.name ||
    obj.headline ||
    obj.newsTitle;

  const url =
    obj.url ||
    obj.link ||
    obj.webUrl ||
    obj.websiteUrl;

  const descricao =
    obj.description ||
    obj.body ||
    obj.summary ||
    obj.text;

  const imagem =
    obj.image ||
    obj.imageUrl ||
    obj.banner ||
    obj.bannerImage ||
    obj.background;

  const data =
    obj.date ||
    obj.publishedAt ||
    obj.published ||
    obj.createdAt ||
    obj.timestamp;

  if (
    titulo &&
    typeof titulo === "string" &&
    titulo.length >= 8 &&
    url &&
    typeof url === "string"
  ) {
    const urlValida =
      url.startsWith("http://") ||
      url.startsWith("https://");

    if (urlValida) {
      resultado.push({
        titulo: limparTexto(titulo),
        url,
        resumo: limparTexto(descricao || ""),
        imagem,
        data,
      });
    }
  }

  for (const chave of chaves) {
    const valor = obj[chave];

    if (
      valor &&
      typeof valor === "object"
    ) {
      extrairNoticiasFortnite(
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

      const resposta = await fazerGet(
        url,
        2,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      let noticias =
        extrairNoticiasFortnite(
          resposta.data,
          []
        );

      noticias = noticias.filter(
        (item) =>
          item.url &&
          !item.url.includes(
            "fortnite-api.com"
          )
      );

      // Remove duplicadas
      const mapa = new Map();

      for (const noticia of noticias) {
        const chave =
          normalizarUrl(noticia.url) ||
          noticia.titulo;

        if (!mapa.has(chave)) {
          mapa.set(chave, noticia);
        }
      }

      noticias = [...mapa.values()];

      if (noticias.length > 0) {
        console.log(
          `✅ Fortnite API encontrou ${noticias.length} candidatos.`
        );

        return noticias.slice(
          0,
          MAX_NOTICIAS_POR_FONTE
        );
      }

      console.log(
        "⚠️ Fortnite API respondeu, mas nenhuma notícia compatível foi encontrada."
      );
    } catch (erro) {
      console.log(
        `⚠️ Fortnite API falhou: ${erro.message}`
      );
    }
  }

  return [];
}

// ============================================================
// FORTNITE RSS GOOGLE
// ============================================================

async function buscarFortniteRSS() {
  const hoje = new Date();

  const consultas = [
    `site:fortnite.gg/news after:${obterDataBusca(hoje)}`,
    `site:fortnite.com/news after:${obterDataBusca(hoje)}`,
  ];

  for (const consulta of consultas) {
    try {
      console.log(
        `🔎 Fortnite RSS: ${consulta}`
      );

      const url =
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent(consulta) +
        "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

      const resposta =
        await fazerGet(url, 2);

      const feed =
        await rssParser.parseString(
          resposta.data
        );

      if (
        feed.items &&
        feed.items.length > 0
      ) {
        console.log(
          `✅ Fortnite RSS encontrou ${feed.items.length} notícias.`
        );

        return feed.items
          .filter((item) =>
            noticiaRecente(
              item.pubDate
            )
          )
          .map((item) => ({
            titulo: limparTexto(
              item.title
            ),
            url: item.link,
            resumo: limparTexto(
              item.contentSnippet ||
                item.content ||
                ""
            ),
            data: item.pubDate,
          }))
          .slice(
            0,
            MAX_NOTICIAS_POR_FONTE
          );
      }

      console.log(
        "⚠️ Fortnite RSS: RSS sem itens."
      );
    } catch (erro) {
      console.log(
        `⚠️ Fortnite RSS falhou: ${erro.message}`
      );
    }
  }

  return [];
}

function obterDataBusca(data) {
  const d = new Date(data);
  d.setDate(
    d.getDate() -
      MAX_IDADE_NOTICIA_DIAS
  );

  return d.toISOString().slice(0, 10);
}

async function buscarFortnite() {
  console.log(
    "🔎 Fortnite: iniciando busca de notícias."
  );

  let noticias =
    await buscarFortniteAPI();

  if (noticias.length > 0) {
    return noticias;
  }

  console.log(
    "⚠️ Fortnite API sem notícias. Usando RSS."
  );

  noticias =
    await buscarFortniteRSS();

  return noticias;
}

// ============================================================
// LIBERTYCITY
// ============================================================

function extrairNoticiasLibertyCity(html) {
  const $ = cheerio.load(html);

  const resultado = [];
  const urlsVistas = new Set();

  $('a[href*="/news/"]').each(
    (_, elemento) => {
      const href =
        $(elemento).attr("href");

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

      // Só matérias reais
      if (!/\/news\/.+\/\d+-.*\.html$/i.test(url)) {
        return;
      }

      const normalizada =
        normalizarUrl(url);

      if (urlsVistas.has(normalizada)) {
        return;
      }

      urlsVistas.add(normalizada);

      let titulo =
        $(elemento).attr("title") ||
        limparTexto($(elemento).text());

      // Evita "Leia mais"
      if (
        !titulo ||
        titulo.length < 10 ||
        /^leia mais$/i.test(titulo)
      ) {
        const pai =
          $(elemento).closest(
            "article, li, div"
          );

        const candidatos = [];

        pai
          .find("h1,h2,h3,h4,.title")
          .each((__, el) => {
            const texto =
              limparTexto(
                $(el).text()
              );

            if (
              texto.length >= 10
            ) {
              candidatos.push(
                texto
              );
            }
          });

        if (candidatos.length > 0) {
          titulo =
            candidatos.sort(
              (a, b) =>
                a.length - b.length
            )[0];
        }
      }

      if (
        !titulo ||
        titulo.length < 10 ||
        /^leia mais$/i.test(titulo)
      ) {
        return;
      }

      // Ignora itens que claramente não são notícias
      const tituloLower =
        titulo.toLowerCase();

      if (
        tituloLower.includes(
          "próxima página"
        ) ||
        tituloLower.includes(
          "voltar"
        )
      ) {
        return;
      }

      resultado.push({
        titulo,
        url,
      });
    }
  );

  return resultado;
}

async function buscarLibertyCity() {
  const paginas = [
    "https://pt.libertycity.net/news/",
    "https://pt.libertycity.net/news/page/2/",
  ];

  const todas = [];

  for (const pagina of paginas) {
    try {
      const resposta =
        await fazerGet(
          pagina,
          3
        );

      const noticias =
        extrairNoticiasLibertyCity(
          resposta.data
        );

      console.log(
        `🔎 LibertyCity: ${noticias.length} possíveis notícias em ${pagina}`
      );

      todas.push(...noticias);
    } catch (erro) {
      console.log(
        `⚠️ LibertyCity falhou: ${erro.message}`
      );
    }
  }

  const mapa = new Map();

  for (const noticia of todas) {
    const chave =
      normalizarUrl(noticia.url);

    if (!mapa.has(chave)) {
      mapa.set(chave, noticia);
    }
  }

  const noticias =
    [...mapa.values()]
      .filter((item) =>
        noticiaRecente(
          item.data
        )
      )
      .slice(
        0,
        MAX_NOTICIAS_POR_FONTE
      );

  console.log(
    `📰 LibertyCity: ${noticias.length} notícias recebidas.`
  );

  return noticias;
}

// ============================================================
// GOOGLE NEWS → LINK REAL
// ============================================================

async function decodificarGoogleNews(url) {
  try {
    if (
      !url ||
      !url.includes(
        "news.google.com"
      )
    ) {
      return url;
    }

    const parsed =
      new URL(url);

    const id =
      parsed.pathname
        .split("/")
        .filter(Boolean)
        .pop();

    if (!id) {
      return null;
    }

    console.log(
      `🔓 Google News: decodificando ${id.substring(
        0,
        25
      )}...`
    );

    const pagina =
      await fazerGet(
        `https://news.google.com/articles/${id}`,
        2
      );

    const $ =
      cheerio.load(
        pagina.data
      );

    const div =
      $("c-wiz > div").first();

    const signature =
      div.attr(
        "data-n-a-sg"
      );

    const timestamp =
      div.attr(
        "data-n-a-ts"
      );

    const articleId =
      div.attr(
        "data-n-a-id"
      ) || id;

    if (
      !signature ||
      !timestamp
    ) {
      console.log(
        "⚠️ Google News: parâmetros de decodificação não encontrados."
      );

      return null;
    }

    const requestInterno = [
      "Fbv4je",
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${articleId}",${timestamp},"${signature}"]`,
    ];

    const corpo =
      new URLSearchParams({
        "f.req": JSON.stringify([
          [requestInterno],
        ]),
      }).toString();

    const resposta =
      await axios.post(
        "https://news.google.com/_/DotsSplashUi/data/batchexecute",
        corpo,
        {
          timeout: 20000,
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          },
        }
      );

    const partes =
      String(
        resposta.data
      ).split("\n\n");

    if (partes.length < 2) {
      return null;
    }

    const bruto =
      partes[1];

    const primeiroJson =
      JSON.parse(bruto);

    if (
      !Array.isArray(
        primeiroJson
      ) ||
      !primeiroJson[0] ||
      !primeiroJson[0][2]
    ) {
      return null;
    }

    const interno =
      JSON.parse(
        primeiroJson[0][2]
      );

    const urlOriginal =
      interno?.[1];

    if (
      typeof urlOriginal ===
        "string" &&
      /^https?:\/\//i.test(
        urlOriginal
      )
    ) {
      console.log(
        `✅ Google News decodificado: ${urlOriginal}`
      );

      return urlOriginal;
    }

    return null;
  } catch (erro) {
    console.log(
      `⚠️ Erro ao decodificar Google News: ${erro.message}`
    );

    return null;
  }
}

// ============================================================
// ROCKSTAR
// ============================================================

async function buscarRockstarRSS() {
  const dataBusca =
    obterDataBusca(
      new Date()
    );

  const consultas = [
    `site:rockstargames.com/br/newswire/article after:${dataBusca}`,
    `site:rockstargames.com/newswire/article after:${dataBusca}`,
  ];

  const resultados = [];

  for (const consulta of consultas) {
    try {
      console.log(
        `🔎 Rockstar RSS: ${consulta}`
      );

      const url =
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent(
          consulta
        ) +
        "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

      const resposta =
        await fazerGet(
          url,
          2
        );

      const feed =
        await rssParser.parseString(
          resposta.data
        );

      if (
        !feed.items ||
        feed.items.length === 0
      ) {
        console.log(
          "⚠️ Rockstar RSS: sem itens."
        );

        continue;
      }

      console.log(
        `📰 Rockstar RSS: ${feed.items.length} itens encontrados.`
      );

      for (
        const item of feed.items.slice(
          0,
          8
        )
      ) {
        if (
          !noticiaRecente(
            item.pubDate
          )
        ) {
          continue;
        }

        const titulo =
          limparTexto(
            item.title
          );

        const googleUrl =
          item.link;

        if (
          !titulo ||
          !googleUrl
        ) {
          continue;
        }

        const urlOriginal =
          await decodificarGoogleNews(
            googleUrl
          );

        if (
          !urlOriginal ||
          !urlOriginal.includes(
            "rockstargames.com"
          )
        ) {
          console.log(
            `⛔ Rockstar: não consegui confirmar URL oficial para "${titulo}"`
          );

          continue;
        }

        resultados.push({
          titulo,
          url: urlOriginal,
          resumo:
            limparTexto(
              item.contentSnippet ||
                ""
            ),
          data: item.pubDate,
        });

        if (
          resultados.length >=
          MAX_NOTICIAS_POR_FONTE
        ) {
          break;
        }

        // Pequeno intervalo para evitar muitas requisições
        await esperar(400);
      }

      if (
        resultados.length >=
        MAX_NOTICIAS_POR_FONTE
      ) {
        break;
      }
    } catch (erro) {
      console.log(
        `⚠️ Rockstar RSS falhou: ${erro.message}`
      );
    }
  }

  // Deduplicação
  const mapa = new Map();

  for (const noticia of resultados) {
    const chave =
      normalizarUrl(
        noticia.url
      );

    if (!mapa.has(chave)) {
      mapa.set(
        chave,
        noticia
      );
    }
  }

  const finais =
    [...mapa.values()].slice(
      0,
      MAX_NOTICIAS_POR_FONTE
    );

  console.log(
    `📰 Rockstar: ${finais.length} notícias oficiais encontradas.`
  );

  return finais;
}

async function buscarRockstar() {
  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  const noticias =
    await buscarRockstarRSS();

  return noticias;
}

// ============================================================
// CICLO DE NOTÍCIAS
// ============================================================

async function cicloNoticias() {
  if (executandoNoticias) {
    console.log(
      "⏭️ Ciclo de notícias já está rodando."
    );

    return;
  }

  executandoNoticias = true;

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "📰 INICIANDO CICLO DE NOTÍCIAS"
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
    // ========================================================
    // FORTNITE
    // ========================================================

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );

    try {
      const canal =
        await client.channels.fetch(
          ID_FORTNITE
        );

      const noticias =
        await buscarFortnite();

      if (
        noticias.length === 0
      ) {
        console.log(
          "⚠️ Fortnite: nenhuma notícia encontrada."
        );
      } else {
        console.log(
          `📰 Fortnite: ${noticias.length} notícias recebidas.`
        );

        for (const noticia of noticias) {
          await publicarNoticia(
            "Fortnite",
            canal,
            noticia
          );

          await esperar(1000);
        }
      }
    } catch (erro) {
      console.log(
        "❌ Fortnite: erro no ciclo:",
        erro.message
      );
    }

    // ========================================================
    // LIBERTYCITY
    // ========================================================

    console.log(
      "━━━━━━━━ LibertyCity ━━━━━━━━"
    );

    try {
      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      const noticias =
        await buscarLibertyCity();

      if (
        noticias.length === 0
      ) {
        console.log(
          "⚠️ LibertyCity: nenhuma notícia encontrada."
        );
      } else {
        for (const noticia of noticias) {
          await publicarNoticia(
            "LibertyCity",
            canal,
            noticia
          );

          await esperar(1000);
        }
      }
    } catch (erro) {
      console.log(
        "❌ LibertyCity: erro no ciclo:",
        erro.message
      );
    }

    // ========================================================
    // ROCKSTAR
    // ========================================================

    console.log(
      "━━━━━━━━ Rockstar ━━━━━━━━"
    );

    try {
      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      const noticias =
        await buscarRockstar();

      if (
        noticias.length === 0
      ) {
        console.log(
          "⚠️ Rockstar: nenhuma notícia oficial encontrada."
        );
      } else {
        for (const noticia of noticias) {
          await publicarNoticia(
            "Rockstar",
            canal,
            noticia
          );

          await esperar(1000);
        }
      }
    } catch (erro) {
      console.log(
        "❌ Rockstar: erro no ciclo:",
        erro.message
      );
    }
  } catch (erro) {
    console.log(
      "❌ Erro geral no ciclo:",
      erro.message
    );
  } finally {
    executandoNoticias = false;

    console.log(
      "========================================"
    );
    console.log(
      "🏁 CICLO DE NOTÍCIAS FINALIZADO"
    );
    console.log(
      "========================================"
    );
  }
}

// ============================================================
// LOJA FORTNITE
// ============================================================

async function postarLojaFortnite(
  forcar = false
) {
  if (executandoLoja) {
    return;
  }

  executandoLoja = true;

  try {
    const hoje =
      obterDiaBrasil();

    // Já postou hoje
    if (
      !forcar &&
      ultimoDiaLoja === hoje
    ) {
      return;
    }

    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    // Verifica mensagens recentes
    if (!forcar) {
      try {
        const mensagens =
          await canal.messages.fetch({
            limit: 50,
          });

        for (
          const mensagem of mensagens.values()
        ) {
          for (
            const embed of mensagem.embeds
          ) {
            if (
              embed.url &&
              normalizarUrl(
                embed.url
              ) ===
                normalizarUrl(
                  LOJA_FORTNITE
                )
            ) {
              ultimoDiaLoja =
                hoje;

              console.log(
                "⏭️ Loja Fortnite já publicada hoje."
              );

              return;
            }
          }
        }
      } catch (erro) {
        console.log(
          "⚠️ Não foi possível verificar histórico da loja:",
          erro.message
        );
      }
    }

    console.log(
      "🛒 Publicando Loja do Fortnite..."
    );

    const embed =
      new EmbedBuilder()
        .setColor(0x00a8ff)
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setURL(
          LOJA_FORTNITE
        )
        .setDescription(
          "🔥 **A Loja de Itens do Fortnite acabou de atualizar!**\n\n" +
          "👀 Confira todas as skins, picaretas, gestos, mochilas e outros itens disponíveis hoje.\n\n" +
          "👇 **Clique no título acima para abrir a loja oficial.**"
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
        "@everyone\n" +
        "🛒 **CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR! 🔥**",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    ultimoDiaLoja =
      hoje;

    console.log(
      "✅ Loja Fortnite publicada com sucesso!"
    );
  } catch (erro) {
    console.log(
      "❌ Erro ao publicar Loja Fortnite:",
      erro.message
    );
  } finally {
    executandoLoja = false;
  }
}

// ============================================================
// AGENDAMENTO DA LOJA — 21:00 BRASIL
// ============================================================

function agendarLoja21h() {
  const agora =
    new Date();

  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }
    );

  const partes =
    formatter
      .formatToParts(agora)
      .reduce(
        (obj, item) => {
          obj[item.type] =
            item.value;

          return obj;
        },
        {}
      );

  const ano =
    Number(partes.year);

  const mes =
    Number(partes.month) - 1;

  const dia =
    Number(partes.day);

  const hora =
    Number(partes.hour);

  const minuto =
    Number(partes.minute);

  const segundo =
    Number(partes.second);

  // Próxima execução aproximada.
  // O watchdog de 30 segundos garante a postagem mesmo
  // se houver pequena diferença de horário.

  let proximo =
    new Date(
      Date.UTC(
        ano,
        mes,
        dia,
        21 + 3,
        0,
        5
      )
    );

  // Durante horário padrão o Brasil é UTC-3.
  // O cálculo acima representa 21:00 BRT.

  const agoraMs =
    agora.getTime();

  if (
    hora > 21 ||
    (hora === 21 &&
      minuto >= 1)
  ) {
    proximo =
      new Date(
        Date.UTC(
          ano,
          mes,
          dia + 1,
          24,
          0,
          5
        )
      );
    }

  let delay =
    proximo.getTime() -
    agoraMs;

  // Segurança
  if (
    delay < 1000 ||
    delay >
      48 * 60 * 60 * 1000
  ) {
    delay =
      60 * 1000;
  }

  console.log(
    `⏰ Próxima verificação agendada da loja em aproximadamente ${Math.round(
      delay / 1000
    )} segundos.`
  );

  setTimeout(
    async () => {
      console.log(
        "⏰ HORÁRIO DA LOJA — verificando..."
      );

      await postarLojaFortnite(
        true
      );

      agendarLoja21h();
    },
    delay
  );
}

// ============================================================
// COMANDOS
// ============================================================

client.on(
  "messageCreate",
  async (message) => {
    try {
      if (
        message.author.bot
      ) {
        return;
      }

      const conteudo =
        message.content
          .trim()
          .toLowerCase();

      if (
        !conteudo.startsWith("!")
      ) {
        return;
      }

      // !teste
      if (
        conteudo === "!teste"
      ) {
        await message.reply(
          "🤖 **Murilito NEWS está online e funcionando!** 🔥"
        );

        return;
      }

      // !teste fortnite
      if (
        conteudo ===
        "!teste fortnite"
      ) {
        await message.reply(
          "🎮 Buscando uma notícia do Fortnite..."
        );

        const noticias =
          await buscarFortnite();

        if (
          noticias.length === 0
        ) {
          await message.reply(
            "❌ Não encontrei notícia do Fortnite agora."
          );

          return;
        }

        await publicarNoticia(
          "Fortnite",
          message.channel,
          noticias[0]
        );

        return;
      }

      // !teste liberty
      if (
        conteudo ===
        "!teste liberty"
      ) {
        await message.reply(
          "🚔 Buscando uma notícia da LibertyCity..."
        );

        const noticias =
          await buscarLibertyCity();

        if (
          noticias.length === 0
        ) {
          await message.reply(
            "❌ Não encontrei notícia da LibertyCity agora."
          );

          return;
        }

        await publicarNoticia(
          "LibertyCity",
          message.channel,
          noticias[0]
        );

        return;
      }

      // !teste rockstar
      if (
        conteudo ===
        "!teste rockstar"
      ) {
        await message.reply(
          "🚨 Buscando uma notícia oficial da Rockstar..."
        );

        const noticias =
          await buscarRockstar();

        if (
          noticias.length === 0
        ) {
          await message.reply(
            "❌ Não encontrei notícia oficial da Rockstar agora."
          );

          return;
        }

        await publicarNoticia(
          "Rockstar",
          message.channel,
          noticias[0]
        );

        return;
      }

      // !teste loja
      if (
        conteudo ===
        "!teste loja"
      ) {
        await message.reply(
          "🛒 Publicando teste da Loja Fortnite..."
        );

        await postarLojaFortnite(
          true
        );

        return;
      }

      // !piada
      if (
        conteudo === "!piada"
      ) {
        const piadas = [
          "😂 O GTA 6 atrasou tanto que o GTA 7 já está preocupado.",
          "😂 Fortnite lançou tanta skin que daqui a pouco precisa de um HD só para guardar os cosméticos.",
          "😂 O NPC de Los Santos trabalha menos que eu.",
          "😂 Murilito NEWS: porque fofoca gamer também é informação.",
          "😂 Se não saiu no Murilito NEWS, espera 10 minutos.",
          "😂 GTA 6 está chegando... algum dia. Talvez.",
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

      // !ajuda
      if (
        conteudo === "!ajuda"
      ) {
        const embed =
          new EmbedBuilder()
            .setColor(
              0x5865f2
            )
            .setTitle(
              "🤖 MURILITO NEWS — COMANDOS"
            )
            .setDescription(
              [
                "🎮 **Notícias**",
                "`!teste fortnite` — Testa notícias do Fortnite",
                "`!teste liberty` — Testa notícias da LibertyCity",
                "`!teste rockstar` — Testa notícias da Rockstar",
                "",
                "🛒 **Loja**",
                "`!teste loja` — Testa a postagem da loja",
                "",
                "😂 **Diversão**",
                "`!piada` — Recebe uma piada",
                "",
                "🤖 **Sistema**",
                "`!teste` — Verifica se o bot está online",
              ].join(
                "\n"
              )
            )
            .setFooter({
              text:
                "Murilito NEWS",
            });

        await message.reply({
          embeds: [embed],
        });

        return;
      }
    } catch (erro) {
      console.log(
        "❌ Erro no comando:",
        erro.message
      );
    }
  }
);

// ============================================================
// EVENTO ONLINE
// ============================================================

client.once(
  "clientReady",
  async () => {
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
      `🛒 Loja: ${LOJA_FORTNITE}`
    );

    console.log(
      "========================================"
    );

    // Faz um ciclo logo ao iniciar
    await cicloNoticias();

    // Verifica a loja ao iniciar
    await postarLojaFortnite();

    // Notícias a cada 10 minutos
    setInterval(
      async () => {
        await cicloNoticias();
      },
      INTERVALO_NOTICIAS
    );

    // Watchdog da loja
    setInterval(
      async () => {
        const hora =
          obterHoraBrasil();

        console.log(
          `🕘 Watchdog loja: ${hora}`
        );

        await postarLojaFortnite();
      },
      INTERVALO_VERIFICACAO_LOJA
    );

    // Agendamento 21h
    agendarLoja21h();
  }
);

// ============================================================
// ERROS GERAIS
// ============================================================

process.on(
  "unhandledRejection",
  (erro) => {
    console.error(
      "❌ Unhandled Rejection:",
      erro
    );
  }
);

process.on(
  "uncaughtException",
  (erro) => {
    console.error(
      "❌ Uncaught Exception:",
      erro
    );
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
