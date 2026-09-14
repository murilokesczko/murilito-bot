require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const puppeteer = require("puppeteer");
const Parser = require("rss-parser");
const axios = require("axios");
const cheerio = require("cheerio");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const parser = new Parser();

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const RSS_FORTNITE = "https://fortnitenews.com/rss";

let browser = null;
let executandoCiclo = false;

/* =========================================================
   BROWSER
========================================================= */

async function getBrowser() {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch (e) {
      browser = null;
    }
  }

  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });

  return browser;
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function limparTexto(texto) {
  return String(texto || "")
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function normalizarUrl(url) {
  try {
    return new URL(url).toString().replace(/\/$/, "");
  } catch (e) {
    return String(url || "").trim().replace(/\/$/, "");
  }
}

function limitarTexto(texto, limite = 1900) {
  const valor = String(texto || "");

  if (valor.length <= limite) {
    return valor;
  }

  return valor.slice(0, limite - 3).trimEnd() + "...";
}

/* =========================================================
   TRADUÇÃO MYMEMORY
   LIMITE REAL DA API: 500 CARACTERES
   USAMOS 450 PARA TER MARGEM
========================================================= */

async function traduzirMyMemory(texto) {
  const textoOriginal = String(texto || "").trim();

  if (!textoOriginal) {
    return "";
  }

  try {
    const url =
      "https://api.mymemory.translated.net/get" +
      `?q=${encodeURIComponent(textoOriginal)}` +
      "&langpair=en|pt-BR";

    const resposta = await fetch(url);

    if (!resposta.ok) {
      console.log(`⚠️ MyMemory HTTP ${resposta.status}`);
      return textoOriginal;
    }

    const dados = await resposta.json();

    const traduzido =
      dados?.responseData?.translatedText ||
      dados?.matches?.[0]?.translation ||
      "";

    if (!traduzido) {
      console.log("⚠️ MyMemory não retornou tradução.");
      return textoOriginal;
    }

    return traduzido.trim();
  } catch (erro) {
    console.log("❌ Erro MyMemory:", erro.message);
    return textoOriginal;
  }
}

/*
 * MyMemory aceita no máximo 500 caracteres.
 * Usamos 450 para evitar qualquer problema.
 */
async function traduzirTextoGrande(texto) {
  const textoOriginal = String(texto || "").trim();

  if (!textoOriginal) {
    return "";
  }

  const LIMITE_TRADUCAO = 450;

  const partes = [];

  let restante = textoOriginal;

  while (restante.length > LIMITE_TRADUCAO) {
    let corte = restante.lastIndexOf(" ", LIMITE_TRADUCAO);

    if (corte < 250) {
      corte = LIMITE_TRADUCAO;
    }

    partes.push(restante.slice(0, corte).trim());
    restante = restante.slice(corte).trim();
  }

  if (restante.length > 0) {
    partes.push(restante);
  }

  console.log(
    `🌐 Traduzindo ${partes.length} bloco(s) de até ${LIMITE_TRADUCAO} caracteres...`
  );

  const traduzidas = [];

  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];

    console.log(
      `🌐 Tradução ${i + 1}/${partes.length} (${parte.length} caracteres)...`
    );

    const traduzida = await traduzirMyMemory(parte);

    traduzidas.push(traduzida);

    /*
     * Pequena pausa para não bombardear a API.
     */
    if (i < partes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }

  return traduzidas.join("\n\n");
}

/*
 * Mantido para compatibilidade com comandos antigos.
 */
async function traduzirGoogle(texto) {
  return traduzirMyMemory(texto);
}

/* =========================================================
   RUMOR / LEAK
========================================================= */

function detectarRumorLeak(titulo, descricao = "") {
  const texto = `${titulo} ${descricao}`.toLowerCase();

  const termos = [
    "leak",
    "leaked",
    "leaks",
    "rumor",
    "rumored",
    "rumour",
    "rumoured",
    "reportedly",
    "unconfirmed",
    "unofficial",
    "according to leakers",
    "according to a leaker",
    "according to reports",
    "leaker",
    "leakers",
  ];

  return termos.some((termo) => texto.includes(termo));
}

/* =========================================================
   VERIFICAR DUPLICADAS
========================================================= */

async function noticiaJaPublicada(canal, link, titulo) {
  try {
    const mensagens = await canal.messages.fetch({ limit: 50 });

    const urlNormalizada = normalizarUrl(link);
    const tituloNormalizado = String(titulo || "")
      .toLowerCase()
      .trim();

    for (const [, mensagem] of mensagens) {
      const conteudo = mensagem.content || "";

      if (
        urlNormalizada &&
        conteudo.includes(urlNormalizada)
      ) {
        return true;
      }

      if (
        tituloNormalizado &&
        tituloNormalizado.length > 15 &&
        conteudo.toLowerCase().includes(tituloNormalizado)
      ) {
        return true;
      }
    }

    return false;
  } catch (erro) {
    console.log("⚠️ Erro verificando duplicada:", erro.message);
    return false;
  }
}

/* =========================================================
   GTA — MANTIDO NO FORMATO QUE FUNCIONOU
========================================================= */

async function publicarGTA(noticia, forcar = false) {
  try {
    const canal = await client.channels.fetch(ID_GTA);

    if (!canal) {
      return false;
    }

    if (!noticia.link) {
      return false;
    }

    if (!forcar) {
      const duplicada = await noticiaJaPublicada(
        canal,
        noticia.link,
        noticia.titulo
      );

      if (duplicada) {
        console.log(
          `⏭️ GTA: já publicada: ${noticia.titulo}`
        );
        return false;
      }
    }

    console.log(
      `🚔 GTA enviando link: ${noticia.link}`
    );

    await canal.send({
      content:
        `@everyone 📰 **Acabou de sair notícia nova do GTA!**\n\n` +
        `${noticia.link}\n\n` +
        `👇 **Clique no título acima para ler a matéria completa.**`,
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log(
      `✅ GTA publicada com prévia do Discord: ${noticia.titulo}`
    );

    return true;
  } catch (erro) {
    console.log(
      "❌ Erro publicando GTA:",
      erro.message
    );

    return false;
  }
}

/* =========================================================
   ROCKSTAR
========================================================= */

async function buscarNoticiasRockstar() {
  let page = null;

  try {
    console.log("🚔 Buscando notícias da Rockstar...");

    const browserAtual = await getBrowser();

    page = await browserAtual.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    );

    await page.goto(
      "https://www.rockstargames.com/br/newswire",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 3000)
    );

    const noticias = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll(
          'a[href*="/newswire/article/"]'
        )
      );

      const resultado = [];
      const vistos = new Set();

      for (const a of links) {
        const href = a.href;
        const titulo =
          a.innerText?.trim() ||
          a.textContent?.trim() ||
          "";

        if (!href) continue;
        if (!titulo) continue;
        if (vistos.has(href)) continue;

        vistos.add(href);

        resultado.push({
          titulo,
          link: href,
        });
      }

      return resultado.slice(0, 20);
    });

    console.log(
      `🚔 Rockstar encontrou ${noticias.length} notícia(s).`
    );

    return noticias;
  } catch (erro) {
    console.log(
      "❌ Erro buscando Rockstar:",
      erro.message
    );

    return [];
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
  }
}

/* =========================================================
   LIBERTYCITY
========================================================= */

async function buscarNoticiasLibertyCity() {
  let page = null;

  try {
    console.log(
      "🚔 Buscando notícias do LibertyCity..."
    );

    const browserAtual = await getBrowser();

    page = await browserAtual.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    );

    await page.goto(
      "https://pt.libertycity.net/news/",
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 2500)
    );

    const noticias = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll("a[href]")
      );

      const resultado = [];
      const vistos = new Set();

      for (const a of links) {
        const href = a.href;

        if (!href) continue;

        const url = href.toLowerCase();

        const ehGTA =
          url.includes("/news/gta-") ||
          url.includes("/news/gtav") ||
          url.includes("/news/gta-6");

        if (!ehGTA) continue;

        const titulo =
          a.innerText?.trim() ||
          a.textContent?.trim() ||
          "";

        if (!titulo) continue;

        if (vistos.has(href)) continue;

        vistos.add(href);

        resultado.push({
          titulo,
          link: href,
        });
      }

      return resultado.slice(0, 20);
    });

    console.log(
      `🚔 LibertyCity encontrou ${noticias.length} notícia(s).`
    );

    return noticias;
  } catch (erro) {
    console.log(
      "❌ Erro buscando LibertyCity:",
      erro.message
    );

    return [];
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
  }
}

/* =========================================================
   PROCESSAR GTA
========================================================= */

async function processarGTA(forcar = false) {
  let total = 0;

  const rockstar =
    await buscarNoticiasRockstar();

  for (const noticia of rockstar.slice(0, 2)) {
    const publicou = await publicarGTA(
      noticia,
      forcar
    );

    if (publicou) {
      total++;
    }
  }

  const liberty =
    await buscarNoticiasLibertyCity();

  for (const noticia of liberty.slice(0, 2)) {
    const publicou = await publicarGTA(
      noticia,
      forcar
    );

    if (publicou) {
      total++;
    }
  }

  console.log(
    `📊 GTA: ${total} notícia(s) nova(s) publicada(s).`
  );

  return total;
}

/* =========================================================
   FORTNITE RSS
========================================================= */

async function buscarNoticiasFortnite() {
  try {
    console.log(
      "📰 Buscando RSS do Fortnite News..."
    );

    const feed = await parser.parseURL(
      RSS_FORTNITE
    );

    const noticias = feed.items
      .slice(0, 10)
      .map((item) => {
        let imagem = "";

        try {
          if (
            item["media:content"] &&
            item["media:content"].$ &&
            item["media:content"].$.url
          ) {
            imagem =
              item["media:content"].$.url;
          }
        } catch (e) {}

        try {
          if (
            !imagem &&
            item["media:thumbnail"] &&
            item["media:thumbnail"].$ &&
            item["media:thumbnail"].$.url
          ) {
            imagem =
              item["media:thumbnail"].$.url;
          }
        } catch (e) {}

        return {
          titulo: limparTexto(item.title),
          link: item.link,
          descricao: limparTexto(
            item.contentSnippet ||
              item.content ||
              item.description ||
              ""
          ),
          data:
            item.isoDate ||
            item.pubDate ||
            "",
          imagem,
          rumorLeak: detectarRumorLeak(
            item.title,
            item.contentSnippet ||
              item.content ||
              item.description ||
              ""
          ),
        };
      })
      .filter(
        (item) =>
          item.titulo &&
          item.link
      );

    console.log(
      `📰 Fortnite encontrou ${noticias.length} notícia(s).`
    );

    return noticias;
  } catch (erro) {
    console.log(
      "❌ Erro buscando RSS Fortnite:",
      erro.message
    );

    return [];
  }
}

/* =========================================================
   MATÉRIA COMPLETA
========================================================= */

async function buscarMateriaCompleta(url) {
  let page = null;

  try {
    console.log(
      `📖 Abrindo matéria completa: ${url}`
    );

    const browserAtual = await getBrowser();

    page = await browserAtual.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await new Promise((resolve) =>
      setTimeout(resolve, 2500)
    );

    const resultado = await page.evaluate(() => {
      function extrair(container) {
        if (!container) {
          return "";
        }

        const clone =
          container.cloneNode(true);

        clone
          .querySelectorAll(
            "script, style, noscript, iframe, svg, form, nav, footer, aside, .sharedaddy, .jp-relatedposts, .related-posts, .comments"
          )
          .forEach((el) => el.remove());

        const elementos = Array.from(
          clone.querySelectorAll(
            "h2, h3, h4, p, li, blockquote"
          )
        );

        const textos = [];

        for (const elemento of elementos) {
          const texto =
            elemento.innerText?.trim() ||
            elemento.textContent?.trim() ||
            "";

          if (!texto) continue;
          if (texto.length < 2) continue;

          textos.push(texto);
        }

        return textos.join("\n\n");
      }

      const seletores = [
        "article .entry-content",
        "article .td-post-content",
        "article .post-content",
        "article .article-content",
        "article .content",
        ".entry-content",
        ".td-post-content",
        ".post-content",
        ".article-content",
        "article",
        "main",
      ];

      let melhorTexto = "";

      for (const seletor of seletores) {
        const elementos =
          document.querySelectorAll(
            seletor
          );

        for (const elemento of elementos) {
          const texto = extrair(elemento);

          if (
            texto.length >
            melhorTexto.length
          ) {
            melhorTexto = texto;
          }
        }
      }

      const titulo =
        document.querySelector("h1")
          ?.innerText?.trim() || "";

      return {
        titulo,
        texto: melhorTexto,
      };
    });

    if (
      !resultado ||
      !resultado.texto ||
      resultado.texto.length < 100
    ) {
      console.log(
        "⚠️ Não foi possível extrair uma matéria completa."
      );

      return null;
    }

    console.log(
      `📖 Matéria extraída: ${resultado.texto.length} caracteres.`
    );

    return {
      titulo: resultado.titulo,
      texto: resultado.texto,
    };
  } catch (erro) {
    console.log(
      "❌ Erro extraindo matéria:",
      erro.message
    );

    return null;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {}
    }
  }
}

/* =========================================================
   DIVIDIR TEXTO PARA DISCORD
========================================================= */

function dividirParaDiscord(
  texto,
  limite = 1900
) {
  const valor = String(texto || "").trim();

  if (!valor) {
    return [];
  }

  const partes = [];

  let restante = valor;

  while (restante.length > limite) {
    let corte =
      restante.lastIndexOf("\n\n", limite);

    if (corte < 500) {
      corte =
        restante.lastIndexOf(". ", limite);
    }

    if (corte < 500) {
      corte =
        restante.lastIndexOf(" ", limite);
    }

    if (corte <= 0) {
      corte = limite;
    }

    const parte =
      restante.slice(0, corte).trim();

    if (parte) {
      partes.push(parte);
    }

    restante =
      restante.slice(corte).trim();
  }

  if (restante) {
    partes.push(restante);
  }

  return partes;
}

/* =========================================================
   PUBLICAR FORTNITE
========================================================= */

async function publicarFortnite(
  noticia,
  forcar = false
) {
  try {
    const canal =
      await client.channels.fetch(
        ID_FORTNITE
      );

    if (!canal) {
      return false;
    }

    if (!noticia.link) {
      return false;
    }

    if (!forcar) {
      const duplicada =
        await noticiaJaPublicada(
          canal,
          noticia.link,
          noticia.titulo
        );

      if (duplicada) {
        console.log(
          `⏭️ Fortnite: já publicada: ${noticia.titulo}`
        );

        return false;
      }
    }

    console.log(
      `📰 Fortnite preparando: ${noticia.titulo}`
    );

    /* =====================================================
       TRADUZIR TÍTULO
    ===================================================== */

    const tituloTraduzido =
      await traduzirMyMemory(
        noticia.titulo
      );

    /* =====================================================
       BUSCAR MATÉRIA COMPLETA
    ===================================================== */

    const materia =
      await buscarMateriaCompleta(
        noticia.link
      );

    let textoOriginal = "";

    if (
      materia &&
      materia.texto
    ) {
      textoOriginal =
        materia.texto;
    } else {
      textoOriginal =
        noticia.descricao ||
        "Confira a matéria completa no link abaixo.";
    }

    /*
     * Limite prático por notícia.
     * O texto pode ser enviado em várias mensagens.
     */
    textoOriginal =
      textoOriginal.slice(0, 15000);

    console.log(
      `📖 Texto utilizado: ${textoOriginal.length} caracteres.`
    );

    /* =====================================================
       TRADUZIR MATÉRIA COMPLETA
    ===================================================== */

    const textoTraduzido =
      await traduzirTextoGrande(
        textoOriginal
      );

    const rumorLeak =
      detectarRumorLeak(
        noticia.titulo,
        textoOriginal
      );

    /* =====================================================
       MONTAR CABEÇALHO
    ===================================================== */

    let cabecalho =
      "@everyone 📰 **Acabou de sair notícia nova do Fortnite!**\n\n";

    if (rumorLeak) {
      cabecalho +=
        "🚨 **RUMOR / LEAK**\n\n";
    }

    cabecalho +=
      `🇺🇸 **Original:** ${noticia.titulo}\n`;

    cabecalho +=
      `🇧🇷 **${tituloTraduzido}**\n\n`;

    cabecalho +=
      "📝 ";

    /*
     * Reservamos espaço para:
     * - cabeçalho
     * - URL
     * - mensagem final
     *
     * A URL também será enviada no primeiro
     * conteúdo para o Discord gerar a prévia.
     */

    const rodape =
      `\n\n${noticia.link}\n\n` +
      "👇 **Clique no título acima para ler a matéria completa.**";

    const espacoDisponivel =
      2000 -
      cabecalho.length -
      rodape.length -
      10;

    const primeiraParte =
      limitarTexto(
        textoTraduzido,
        Math.max(
          100,
          espacoDisponivel
        )
      );

    let primeiraMensagem =
      cabecalho +
      primeiraParte +
      rodape;

    /*
     * Segurança absoluta contra > 2000.
     */
    if (
      primeiraMensagem.length > 2000
    ) {
      const excesso =
        primeiraMensagem.length -
        2000;

      const novoLimite =
        Math.max(
          100,
          primeiraParte.length -
            excesso -
            3
        );

      const primeiraParteSegura =
        limitarTexto(
          textoTraduzido,
          novoLimite
        );

      primeiraMensagem =
        cabecalho +
        primeiraParteSegura +
        rodape;
    }

    console.log(
      `📤 Primeira mensagem: ${primeiraMensagem.length}/2000 caracteres.`
    );

    await canal.send({
      content: primeiraMensagem,
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    /* =====================================================
       CONTINUAÇÕES
    ===================================================== */

    const restante =
      textoTraduzido.slice(
        primeiraParte.length
      ).trim();

    const continuacoes =
      dividirParaDiscord(
        restante,
        1900
      );

    for (
      let i = 0;
      i < continuacoes.length;
      i++
    ) {
      const textoParte =
        continuacoes[i];

      const mensagemContinuacao =
        `📖 **Continuação da matéria**\n\n${textoParte}`;

      await canal.send({
        content: limitarTexto(
          mensagemContinuacao,
          1900
        ),
      });

      await new Promise((resolve) =>
        setTimeout(resolve, 300)
      );
    }

    console.log(
      `✅ Fortnite publicada: ${noticia.titulo}`
    );

    return true;
  } catch (erro) {
    console.log(
      "❌ Erro publicando Fortnite:",
      erro.message
    );

    return false;
  }
}

/* =========================================================
   LOJA FORTNITE
   MANTIDA
========================================================= */

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {
      return false;
    }

    const embed =
      new EmbedBuilder()
        .setTitle("🛒 Loja do Fortnite")
        .setDescription(
          "Confira a loja atual do Fortnite."
        )
        .setImage(
          "https://fortnite.gg/img/og-shop.jpg"
        )
        .setURL(
          "https://www.fortnite.com/item-shop?lang=pt-BR"
        )
        .setFooter({
          text:
            "Murilito NEWS • Fortnite",
        })
        .setTimestamp();

    await canal.send({
      embeds: [embed],
    });

    console.log(
      "🛒 Loja Fortnite publicada."
    );

    return true;
  } catch (erro) {
    console.log(
      "❌ Erro publicando loja:",
      erro.message
    );

    return false;
  }
}

/* =========================================================
   TESTE DE TRADUÇÃO
========================================================= */

async function executarTesteTraducao(
  mensagem
) {
  try {
    await mensagem.channel.send(
      "🧪 **Testando MyMemory... Aguarde alguns segundos.**"
    );

    const original =
      "Fortnite Hotfix Adjusts the 8-Bit Shotgun";

    const traduzido =
      await traduzirMyMemory(
        original
      );

    await mensagem.channel.send(
      `🇺🇸 **Original:** ${original}\n\n` +
      `🇧🇷 **Português:** ${traduzido}`
    );

    console.log(
      "✅ Teste MyMemory concluído."
    );
  } catch (erro) {
    console.log(
      "❌ Erro no teste de tradução:",
      erro.message
    );
  }
}

/* =========================================================
   TESTE FORTNITE
========================================================= */

async function executarTesteFortnite(
  mensagem
) {
  try {
    await mensagem.channel.send(
      "🧪 **TESTE FORTNITE**\n\n" +
      "Buscando RSS + matéria completa + MyMemory..."
    );

    const noticias =
      await buscarNoticiasFortnite();

    if (!noticias.length) {
      await mensagem.channel.send(
        "❌ Nenhuma notícia encontrada no RSS."
      );

      return;
    }

    const noticia =
      noticias[0];

    const tituloTraduzido =
      await traduzirMyMemory(
        noticia.titulo
      );

    const materia =
      await buscarMateriaCompleta(
        noticia.link
      );

    let textoOriginal = "";

    if (
      materia &&
      materia.texto
    ) {
      textoOriginal =
        materia.texto;
    } else {
      textoOriginal =
        noticia.descricao;
    }

    textoOriginal =
      textoOriginal.slice(
        0,
        15000
      );

    const textoTraduzido =
      await traduzirTextoGrande(
        textoOriginal
      );

    const rumorLeak =
      detectarRumorLeak(
        noticia.titulo,
        textoOriginal
      );

    let cabecalho =
      "🧪 **TESTE FORTNITE**\n\n";

    if (rumorLeak) {
      cabecalho +=
        "🚨 **RUMOR / LEAK**\n\n";
    }

    cabecalho +=
      `🇺🇸 **Original:** ${noticia.titulo}\n`;

    cabecalho +=
      `🇧🇷 **${tituloTraduzido}**\n\n`;

    cabecalho += "📝 ";

    const rodape =
      `\n\n${noticia.link}`;

    const espaco =
      2000 -
      cabecalho.length -
      rodape.length -
      5;

    const primeiraParte =
      limitarTexto(
        textoTraduzido,
        Math.max(
          100,
          espaco
        )
      );

    let primeiraMensagem =
      cabecalho +
      primeiraParte +
      rodape;

    if (
      primeiraMensagem.length >
      2000
    ) {
      const excesso =
        primeiraMensagem.length -
        2000;

      const novoLimite =
        Math.max(
          100,
          primeiraParte.length -
            excesso -
            3
        );

      primeiraMensagem =
        cabecalho +
        limitarTexto(
          textoTraduzido,
          novoLimite
        ) +
        rodape;
    }

    await mensagem.channel.send({
      content: primeiraMensagem,
    });

    const restante =
      textoTraduzido.slice(
        primeiraParte.length
      ).trim();

    const continuacoes =
      dividirParaDiscord(
        restante,
        1900
      );

    for (
      let i = 0;
      i < continuacoes.length;
      i++
    ) {
      await mensagem.channel.send({
        content:
          `📖 **Continuação da matéria**\n\n${continuacoes[i]}`,
      });
    }

    console.log(
      "✅ Teste Fortnite concluído."
    );
  } catch (erro) {
    console.log(
      "❌ Erro no teste Fortnite:",
      erro.message
    );

    await mensagem.channel.send(
      `❌ Erro no teste Fortnite: ${erro.message}`
    );
  }
}

/* =========================================================
   TESTES GTA
========================================================= */

async function executarTesteRockstar(
  mensagem
) {
  try {
    await mensagem.channel.send(
      "🧪 **Testando Rockstar...**"
    );

    const noticias =
      await buscarNoticiasRockstar();

    if (!noticias.length) {
      await mensagem.channel.send(
        "❌ Nenhuma notícia da Rockstar encontrada."
      );

      return;
    }

    for (const noticia of noticias.slice(
      0,
      2
    )) {
      await publicarGTA(
        noticia,
        true
      );
    }

    await mensagem.channel.send(
      "✅ **Teste Rockstar concluído.**"
    );
  } catch (erro) {
    console.log(
      "❌ Erro teste Rockstar:",
      erro.message
    );
  }
}

async function executarTesteLiberty(
  mensagem
) {
  try {
    await mensagem.channel.send(
      "🧪 **Testando LibertyCity...**"
    );

    const noticias =
      await buscarNoticiasLibertyCity();

    if (!noticias.length) {
      await mensagem.channel.send(
        "❌ Nenhuma notícia do LibertyCity encontrada."
      );

      return;
    }

    for (const noticia of noticias.slice(
      0,
      2
    )) {
      await publicarGTA(
        noticia,
        true
      );
    }

    await mensagem.channel.send(
      "✅ **Teste LibertyCity concluído.**"
    );
  } catch (erro) {
    console.log(
      "❌ Erro teste LibertyCity:",
      erro.message
    );
  }
}

/* =========================================================
   TESTE LOJA
========================================================= */

async function executarTesteLoja(
  mensagem
) {
  try {
    await mensagem.channel.send(
      "🧪 **Testando publicação da loja...**"
    );

    const resultado =
      await publicarLoja();

    if (resultado) {
      await mensagem.channel.send(
        "✅ **Teste da loja concluído.**"
      );
    } else {
      await mensagem.channel.send(
        "❌ Não foi possível publicar a loja."
      );
    }
  } catch (erro) {
    console.log(
      "❌ Erro teste loja:",
      erro.message
    );
  }
}

/* =========================================================
   PIADA
========================================================= */

async function executarPiada(
  mensagem
) {
  const piadas = [
    "Por que o computador foi ao médico? Porque estava com um vírus. 😂",
    "Meu PC é tão lento que o loading virou parte da gameplay. 😂",
    "O GTA não trava. Ele só está carregando o mapa há 15 minutos. 😂",
    "Fortnite sem skin é igual carro sem roda: funciona, mas ninguém respeita. 😂",
    "Meu Wi-Fi é igual minha sorte no GTA: cai justamente quando mais preciso. 😂",
  ];

  const piada =
    piadas[
      Math.floor(
        Math.random() *
          piadas.length
      )
    ];

  await mensagem.channel.send(
    `😂 ${piada}`
  );
}

/* =========================================================
   AJUDA
========================================================= */

async function executarAjuda(
  mensagem
) {
  await mensagem.channel.send(
    "**🤖 Murilito NEWS — Comandos**\n\n" +
      "`!teste` → teste geral\n" +
      "`!teste rockstar` → testa Rockstar\n" +
      "`!teste liberty` → testa LibertyCity\n" +
      "`!teste fortnite` → testa RSS + matéria + tradução\n" +
      "`!teste loja` → testa loja Fortnite\n" +
      "`!teste traducao` → testa MyMemory\n" +
      "`!piada` → manda uma piada\n" +
      "`!ajuda` → mostra esta mensagem"
  );
}

/* =========================================================
   TESTE GERAL
========================================================= */

async function executarTeste(
  mensagem
) {
  await mensagem.channel.send(
    "🧪 **Teste geral do Murilito NEWS iniciado.**"
  );

  await mensagem.channel.send(
    "🟢 Bot funcionando corretamente!"
  );
}

/* =========================================================
   COMANDOS
========================================================= */

client.on(
  "messageCreate",
  async (mensagem) => {
    try {
      if (
        mensagem.author.bot
      ) {
        return;
      }

      const conteudo =
        mensagem.content
          .trim()
          .toLowerCase();

      if (!conteudo.startsWith("!")) {
        return;
      }

      if (conteudo === "!teste") {
        await executarTeste(
          mensagem
        );

        return;
      }

      if (
        conteudo ===
        "!teste traducao"
      ) {
        await executarTesteTraducao(
          mensagem
        );

        return;
      }

      if (
        conteudo ===
        "!teste fortnite"
      ) {
        await executarTesteFortnite(
          mensagem
        );

        return;
      }

      if (
        conteudo ===
        "!teste rockstar"
      ) {
        await executarTesteRockstar(
          mensagem
        );

        return;
      }

      if (
        conteudo ===
        "!teste liberty"
      ) {
        await executarTesteLiberty(
          mensagem
        );

        return;
      }

      if (
        conteudo ===
        "!teste loja"
      ) {
        await executarTesteLoja(
          mensagem
        );

        return;
      }

      if (
        conteudo ===
        "!piada"
      ) {
        await executarPiada(
          mensagem
        );

        return;
      }

      if (
        conteudo ===
        "!ajuda"
      ) {
        await executarAjuda(
          mensagem
        );

        return;
      }
    } catch (erro) {
      console.log(
        "❌ Erro processando comando:",
        erro.message
      );
    }
  }
);

/* =========================================================
   CICLO AUTOMÁTICO
========================================================= */

async function executarCiclo() {
  if (executandoCiclo) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando. Ignorando."
    );

    return;
  }

  executandoCiclo = true;

  try {
    console.log(
      "🔄 Iniciando ciclo automático..."
    );

    await processarGTA(
      false
    );

    const noticiasFortnite =
      await buscarNoticiasFortnite();

    let totalFortnite = 0;

    for (
      const noticia of noticiasFortnite
    ) {
      if (
        totalFortnite >= 2
      ) {
        break;
      }

      const publicou =
        await publicarFortnite(
          noticia,
          false
        );

      if (publicou) {
        totalFortnite++;
      }
    }

    console.log(
      `📊 Fortnite: ${totalFortnite} notícia(s) nova(s) publicada(s).`
    );

    console.log(
      "✅ Ciclo automático concluído."
    );
  } catch (erro) {
    console.log(
      "❌ Erro no ciclo automático:",
      erro.message
    );
  } finally {
    executandoCiclo = false;
  }
}

/* =========================================================
   READY
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ Murilito NEWS conectado como ${client.user.tag}`
    );

    console.log(
      `🟢 Fortnite RSS: ${RSS_FORTNITE}`
    );

    /*
     * Primeiro ciclo após 10 segundos.
     */
    setTimeout(
      () => {
        executarCiclo();
      },
      10000
    );

    /*
     * Notícias a cada 10 minutos.
     */
    setInterval(
      () => {
        executarCiclo();
      },
      10 * 60 * 1000
    );

    /*
     * Verifica a loja a cada minuto.
     * Publica às 21:00.
     */
    let ultimaPublicacaoLoja = "";

    setInterval(
      async () => {
        try {
          const agora =
            new Date();

          const hora =
            agora.getHours();

          const minuto =
            agora.getMinutes();

          const chave =
            `${agora.getFullYear()}-${agora.getMonth()}-${agora.getDate()}-${hora}`;

          if (
            hora === 21 &&
            minuto === 0 &&
            ultimaPublicacaoLoja !== chave
          ) {
            ultimaPublicacaoLoja =
              chave;

            await publicarLoja();
          }
        } catch (erro) {
          console.log(
            "❌ Erro no verificador da loja:",
            erro.message
          );
        }
      },
      60 * 1000
    );
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(
  process.env.TOKEN
);
