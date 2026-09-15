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

    if (i < partes.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, 700)
      );
    }
  }

  return traduzidas.join("\n\n");
}

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
    console.log(
      "⚠️ Erro verificando duplicada:",
      erro.message
    );

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
        noticia.descricao ||
        "Confira a matéria completa no link abaixo.";
    }

    textoOriginal =
      textoOriginal.slice(0, 15000);

    console.log(
      `📖 Texto utilizado: ${textoOriginal.length} caracteres.`
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
   TIO KHREBIS
========================================================= */

const IMAGEM_TIOKHREBIS =
  "https://cdn.discordapp.com/attachments/1517333302032470191/1548861867429208105/Copilot_20260913_220355.png?ex=6aa94245&is=6aa7f0c5&hm=b3acd2390d58ee0aafd1803b8414bc57db7fe6f185ae1518276376825980be5c";

const FRASES_TIOKHREBIS = [
  "🎯 Quer ajudar o Tio Khrebis sem gastar nem 1 centavo? Use o código **TIOKHREBIS** na loja! O homem agradece e o café dele também. 😂",

  "😂 O Tio Khrebis não pediu dinheiro... só pediu o código **TIOKHREBIS** na loja. Vamos ajudar o homem!",

  "🫡 Missão do dia: entrar na loja, usar **TIOKHREBIS** e sair como uma pessoa de caráter duvidoso, porém solidária.",

  "💰 Você não perde nada usando **TIOKHREBIS**, mas o Tio Khrebis ganha aquela força! Bora fortalecer o streamer do servidor!",

  "🚨 ATENÇÃO: usar **TIOKHREBIS** na loja pode causar um aumento repentino na felicidade do Tio Khrebis. 😂",

  "🛒 Vai comprar alguma coisa na loja? Então coloca **TIOKHREBIS**. O skin fica mais bonita? Não sabemos. O Tio fica feliz? COM CERTEZA.",

  "🤣 Se você esquecer de usar **TIOKHREBIS**, o Tio Khrebis vai descobrir. E ele tem memória de elefante.",

  "🔥 Uma skin por **TIOKHREBIS** e um Tio Khrebis feliz. Parece um ótimo negócio!",

  "👀 A Epic não paga boleto do Tio Khrebis... mas você pode ajudar usando **TIOKHREBIS** na loja.",

  "😂 Use **TIOKHREBIS** na loja. É grátis, é rápido e evita que o Tio Khrebis tenha que vender o PC.",

  "🎮 O verdadeiro combo do Fortnite: skin bonita + **TIOKHREBIS** + Tio Khrebis feliz.",

  "🫶 Fortaleça quem fortalece o servidor! Na próxima compra da loja, lembra do **TIOKHREBIS**.",

  "🚨 Comunicado oficial: quem usar **TIOKHREBIS** ganha +10 de moral com o Tio Khrebis. Fonte: minha cabeça. 😂",

  "💀 Comprar skin sem colocar **TIOKHREBIS** é igual jogar Fortnite sem construir: dá, mas poderia ser melhor.",

  "🛒 Antes de apertar comprar, respira... lembra do **TIOKHREBIS** e ajuda o homem!",

  "😂 O Tio Khrebis está alimentando o servidor com conteúdo. Agora é nossa vez de alimentar o código **TIOKHREBIS**!",

  "🎯 Seu objetivo: conseguir aquela skin. Nosso objetivo: lembrar você do **TIOKHREBIS**. Todos saem ganhando!",

  "💸 Não custa nada usar **TIOKHREBIS**. Seu dinheiro continua sendo seu. O apoio vai para o Tio!",

  "🤣 Se o Tio Khrebis aparecer no servidor mais feliz que o normal, já sabe: alguém usou **TIOKHREBIS**.",

  "🔥 Quer dar aquela moral para o streamer do servidor? **TIOKHREBIS** na loja e pronto!",

  "🫡 Faça sua parte pela comunidade: compre sua skin e coloque **TIOKHREBIS**. O Tio agradece!",

  "😂 Use **TIOKHREBIS** porque até o Tio precisa de um buff de vez em quando.",

  "🎮 Fortnite te deu uma skin. Você dá um código para o Tio: **TIOKHREBIS**. Equilíbrio universal.",

  "🛒 A loja está bonita, mas fica ainda melhor com **TIOKHREBIS** no campo de apoiador.",

  "🚀 Bora mandar o Tio Khrebis para a estratosfera! Próxima compra: **TIOKHREBIS**!",

  "😂 Não seja aquele jogador que compra a skin e lembra do código depois. **TIOKHREBIS** ANTES!",

  "👑 Código de apoiador do servidor: **TIOKHREBIS**. Use e ajude o homem a continuar criando conteúdo!",

  "💥 Uma pequena ação sua pode dar aquele empurrãozinho no Tio Khrebis. Use **TIOKHREBIS**!",

  "🤣 O Tio Khrebis não tem superpoderes, mas tem código de apoiador: **TIOKHREBIS**!",

  "🛍️ Vai gastar V-Bucks? Então pelo menos faça o Tio sorrir: **TIOKHREBIS**.",

  "🎯 Se essa mensagem apareceu para você, é o universo dizendo: USE **TIOKHREBIS**.",

  "😂 O algoritmo mandou. A consciência pediu. O Tio Khrebis implorou. **TIOKHREBIS**!",

  "🔥 Quer apoiar o streamer do servidor sem abrir a carteira para ele? Use **TIOKHREBIS** na loja!",

  "🫡 Código pequeno, apoio gigante: **TIOKHREBIS**.",

  "🤣 Seu V-Buck já vai embora mesmo... pelo menos deixe um **TIOKHREBIS** pelo caminho.",

  "🎮 Antes de comprar a próxima skin, faça o ritual sagrado: abrir a loja → colocar **TIOKHREBIS** → comprar.",

  "🚨 ALERTA DE UTILIDADE PÚBLICA: não esqueça de colocar **TIOKHREBIS** como código de apoiador!",

  "😂 O Tio Khrebis prometeu não cobrar mensalidade pelo código. Aproveita!",

  "💙 Quem apoia o Tio Khrebis usando **TIOKHREBIS** automaticamente ganha respeito da comunidade. Não temos provas, mas temos fé.",

  "🛒 A skin é sua. O apoio é do Tio. O código é **TIOKHREBIS**. Simples assim!",

  "🔥 Bora fortalecer o homem que fortalece o servidor! **TIOKHREBIS** na loja!",

  "😂 Se você está lendo isso, já demorou demais: salva o código **TIOKHREBIS**.",

  "🎯 Quer fazer uma boa ação hoje? Use **TIOKHREBIS** na sua próxima compra do Fortnite.",

  "🫶 Cada uso do **TIOKHREBIS** é um tapinha nas costas do Tio Khrebis dizendo: continua o trabalho!",

  "💀 Não usar **TIOKHREBIS** não vai te banir... mas vai deixar o Tio olhando para o teto pensando na vida. 😂",

  "🚀 Ajude o Tio Khrebis a subir de nível: **TIOKHREBIS** na loja!",

  "🤣 A skin pode ser lendária, mas usar **TIOKHREBIS** é obrigação moral da comunidade.",

  "🎮 Compra aquela skin que você está namorando e aproveita para colocar **TIOKHREBIS**.",

  "🛒 Código do dia, da semana e provavelmente da próxima década: **TIOKHREBIS**!",

  "👊 Fortaleça o streamer do servidor! Na próxima compra, lembra do nosso homem: **TIOKHREBIS**.",
];

function obterHoraBrasil() {
  const partes = new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  ).formatToParts(new Date());

  const resultado = {};

  for (const parte of partes) {
    if (parte.type !== "literal") {
      resultado[parte.type] = parte.value;
    }
  }

  return resultado;
}

function obterFraseTioKhrebis() {
  const indice =
    Math.floor(
      Math.random() *
        FRASES_TIOKHREBIS.length
    );

  return FRASES_TIOKHREBIS[indice];
}

async function publicarTioKhrebis() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {
      return false;
    }

    const frase =
      obterFraseTioKhrebis();

    const embed =
      new EmbedBuilder()
        .setDescription(
          `🎮 **APOIE O TIO KHREBIS!**\n\n` +
          `${frase}\n\n` +
          `🛒 **Código de apoiador: \`TIOKHREBIS\`**\n\n` +
          `❤️ Use o código **TIOKHREBIS** na loja de itens do Fortnite e fortaleça o streamer do nosso servidor!`
        )
        .setImage(
          IMAGEM_TIOKHREBIS
        )
        .setFooter({
          text:
            "Murilito NEWS • Apoie o Tio Khrebis",
        })
        .setTimestamp();

    await canal.send({
      content: "@everyone",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log(
      "❤️ Divulgação TIOKHREBIS publicada."
    );

    return true;
  } catch (erro) {
    console.log(
      "❌ Erro publicando TIOKHREBIS:",
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

    for (
      const noticia of noticias.slice(
        0,
        2
      )
    ) {
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

    for (
      const noticia of noticias.slice(
        0,
        2
      )
    ) {
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
      "`!codigo` → publica divulgação do código TIOKHREBIS\n" +
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

      /*
       * NOVO:
       * !codigo publica imediatamente
       * a divulgação do Tio Khrebis.
       */
      if (
        conteudo ===
        "!codigo"
      ) {
        await publicarTioKhrebis();

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
     * =====================================================
     * AGENDADOR
     *
     * 20:30 → TIOKHREBIS
     * 21:00 → LOJA FORTNITE
     * 22:00 → TIOKHREBIS
     *
     * Horário oficial:
     * America/Sao_Paulo
     * =====================================================
     */

    let ultimaPublicacaoLoja = "";
    let ultimaPublicacaoTio2030 = "";
    let ultimaPublicacaoTio2200 = "";

    setInterval(
      async () => {
        try {
          const agora =
            obterHoraBrasil();

          const ano =
            agora.year;

          const mes =
            agora.month;

          const dia =
            agora.day;

          const hora =
            agora.hour;

          const minuto =
            agora.minute;

          const dataHoje =
            `${ano}-${mes}-${dia}`;

          /*
           * ===============================================
           * 20:30 — TIO KHREBIS
           * ===============================================
           */

          if (
            hora === "20" &&
            minuto === "30" &&
            ultimaPublicacaoTio2030 !==
              dataHoje
          ) {
            ultimaPublicacaoTio2030 =
              dataHoje;

            console.log(
              "🕣 Horário 20:30 — publicando TIOKHREBIS..."
            );

            await publicarTioKhrebis();
          }

          /*
           * ===============================================
           * 21:00 — LOJA FORTNITE
           * ===============================================
           */

          if (
            hora === "21" &&
            minuto === "00" &&
            ultimaPublicacaoLoja !==
              dataHoje
          ) {
            ultimaPublicacaoLoja =
              dataHoje;

            console.log(
              "🕘 Horário 21:00 — publicando loja Fortnite..."
            );

            await publicarLoja();
          }

          /*
           * ===============================================
           * 22:00 — TIO KHREBIS
           * ===============================================
           */

          if (
            hora === "22" &&
            minuto === "00" &&
            ultimaPublicacaoTio2200 !==
              dataHoje
          ) {
            ultimaPublicacaoTio2200 =
              dataHoje;

            console.log(
              "🕙 Horário 22:00 — publicando TIOKHREBIS..."
            );

            await publicarTioKhrebis();
          }
        } catch (erro) {
          console.log(
            "❌ Erro no agendador:",
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
