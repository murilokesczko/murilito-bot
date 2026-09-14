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
    ],
  });

  return browser;
}

/* =========================================================
   UTILIDADES
========================================================= */

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarUrl(url) {
  if (!url) return "";

  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch (e) {
    return String(url).trim();
  }
}

function limitarTexto(texto, limite) {
  if (!texto) return "";

  texto = String(texto).trim();

  if (texto.length <= limite) {
    return texto;
  }

  return texto.slice(0, limite - 3).trim() + "...";
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

/*
  Mantido para compatibilidade com o restante do código.
*/
async function traduzirGoogle(texto) {
  return traduzirMyMemory(texto);
}

/* =========================================================
   TRADUÇÃO DE TEXTOS GRANDES
========================================================= */

async function traduzirTextoGrande(texto) {
  if (!texto) return "";

  texto = texto.trim();

  /*
    MyMemory funciona melhor em blocos menores.
    Usamos aproximadamente 1.400 caracteres por requisição.
  */
  const tamanhoBloco = 1400;

  const blocos = [];

  for (let i = 0; i < texto.length; i += tamanhoBloco) {
    blocos.push(texto.slice(i, i + tamanhoBloco));
  }

  console.log(`🌎 Traduzindo matéria em ${blocos.length} bloco(s)...`);

  const traduzidos = [];

  for (let i = 0; i < blocos.length; i++) {
    try {
      console.log(
        `🌎 Tradução ${i + 1}/${blocos.length}...`
      );

      const traducao = await traduzirMyMemory(blocos[i]);

      traduzidos.push(traducao || blocos[i]);

      /*
        Pequena pausa para evitar excesso de requisições.
      */
      if (i < blocos.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, 700)
        );
      }
    } catch (erro) {
      console.log(
        `⚠️ Falha na tradução do bloco ${i + 1}:`,
        erro.message
      );

      traduzidos.push(blocos[i]);
    }
  }

  return traduzidos.join(" ").replace(/\s+/g, " ").trim();
}

/* =========================================================
   DETECTAR RUMOR / LEAK
========================================================= */

function detectarRumorLeak(texto) {
  const textoLower = String(texto || "").toLowerCase();

  const termos = [
    "leak",
    "leaked",
    "leaker",
    "rumor",
    "rumored",
    "rumour",
    "rumoured",
    "reportedly",
    "unconfirmed",
    "unconfirmed report",
    "possibly",
    "allegedly",
  ];

  return termos.some((termo) =>
    textoLower.includes(termo)
  );
}

/* =========================================================
   VERIFICAR DUPLICADAS
========================================================= */

async function noticiaJaPublicada(
  canal,
  link,
  titulo
) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 50,
    });

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
        conteudo
          .toLowerCase()
          .includes(tituloNormalizado)
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
   GTA
   NÃO ALTERAR
========================================================= */

async function publicarGTA(
  noticia,
  forcar = false
) {
  try {
    const canal = await client.channels.fetch(ID_GTA);

    if (!canal) return false;

    if (!noticia.link) return false;

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
   NÃO ALTERAR
========================================================= */

async function buscarNoticiasRockstar() {
  let page = null;

  try {
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
      setTimeout(resolve, 5000)
    );

    const noticias = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll("a[href]")
      );

      const encontrados = [];

      for (const a of links) {
        const href = a.href || "";

        if (!href.includes("/newswire/article/")) {
          continue;
        }

        const titulo =
          a.innerText?.trim() ||
          a.textContent?.trim() ||
          "";

        if (!titulo) continue;

        encontrados.push({
          titulo,
          link: href,
        });
      }

      const mapa = new Map();

      for (const noticia of encontrados) {
        mapa.set(noticia.link, noticia);
      }

      return Array.from(mapa.values());
    });

    return noticias.slice(0, 20);
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
   NÃO ALTERAR
========================================================= */

async function buscarNoticiasLibertyCity() {
  let page = null;

  try {
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
      setTimeout(resolve, 4000)
    );

    const noticias = await page.evaluate(() => {
      const links = Array.from(
        document.querySelectorAll("a[href]")
      );

      const encontrados = [];

      for (const a of links) {
        const href = a.href || "";

        const ehGTA =
          href.includes("/news/gta-") ||
          href.includes("/news/gtav") ||
          href.includes("/news/gta-6");

        if (!ehGTA) continue;

        const titulo =
          a.innerText?.trim() ||
          a.textContent?.trim() ||
          "";

        if (!titulo) continue;

        encontrados.push({
          titulo,
          link: href,
        });
      }

      const mapa = new Map();

      for (const noticia of encontrados) {
        mapa.set(noticia.link, noticia);
      }

      return Array.from(mapa.values());
    });

    return noticias.slice(0, 20);
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
   FORTNITE RSS
========================================================= */

async function buscarNoticiasFortnite() {
  try {
    console.log(
      "🎮 Buscando notícias do Fortnite via RSS..."
    );

    const feed = await parser.parseURL(
      RSS_FORTNITE
    );

    const noticias = [];

    for (const item of (feed.items || []).slice(
      0,
      10
    )) {
      const titulo =
        item.title?.trim() ||
        "Notícia Fortnite";

      const link =
        item.link?.trim() ||
        "";

      if (!link) continue;

      let descricao =
        item.contentSnippet ||
        item.content ||
        item.summary ||
        "";

      descricao = limparTexto(descricao);

      let imagem = "";

      if (item.enclosure?.url) {
        imagem = item.enclosure.url;
      }

      if (
        !imagem &&
        item["media:content"]?.$?.url
      ) {
        imagem =
          item["media:content"].$ .url;
      }

      if (
        !imagem &&
        item["media:thumbnail"]?.$?.url
      ) {
        imagem =
          item["media:thumbnail"].$ .url;
      }

      noticias.push({
        titulo,
        link,
        descricao,
        imagem,
        data:
          item.pubDate ||
          item.isoDate ||
          "",
        rumorLeak: detectarRumorLeak(
          `${titulo} ${descricao}`
        ),
      });
    }

    console.log(
      `🎮 Fortnite RSS: ${noticias.length} notícia(s).`
    );

    return noticias;
  } catch (erro) {
    console.log(
      "❌ Erro RSS Fortnite:",
      erro.message
    );

    return [];
  }
}

/* =========================================================
   EXTRAIR MATÉRIA COMPLETA DO FORTNITE NEWS
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
        if (!container) return "";

        const clone = container.cloneNode(true);

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
          document.querySelectorAll(seletor);

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

function dividirParaDiscord(texto, limite = 1900) {
  const partes = [];

  if (!texto) return partes;

  let restante = texto.trim();

  while (restante.length > limite) {
    let corte = restante.lastIndexOf(
      "\n\n",
      limite
    );

    if (corte < limite * 0.5) {
      corte = restante.lastIndexOf(
        ". ",
        limite
      );
    }

    if (corte < limite * 0.5) {
      corte = restante.lastIndexOf(
        " ",
        limite
      );
    }

    if (corte <= 0) {
      corte = limite;
    }

    partes.push(
      restante.slice(0, corte).trim()
    );

    restante = restante
      .slice(corte)
      .trim();
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

    if (!canal) return false;

    if (!noticia.link) return false;

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
      `🎮 Fortnite preparando: ${noticia.titulo}`
    );

    /* -----------------------------------------------------
       TÍTULO
    ----------------------------------------------------- */

    const tituloPT =
      await traduzirMyMemory(
        noticia.titulo
      );

    /* -----------------------------------------------------
       TENTAR PEGAR MATÉRIA COMPLETA
    ----------------------------------------------------- */

    let textoOriginalCompleto = "";

    const materia =
      await buscarMateriaCompleta(
        noticia.link
      );

    if (materia?.texto) {
      textoOriginalCompleto =
        materia.texto;
    } else {
      textoOriginalCompleto =
        noticia.descricao || "";
    }

    /*
      Evita matérias absurdamente grandes.
      10.000 caracteres já dá bastante conteúdo
      sem transformar uma notícia em dezenas de mensagens.
    */
    textoOriginalCompleto =
      textoOriginalCompleto
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    textoOriginalCompleto =
      limitarTexto(
        textoOriginalCompleto,
        10000
      );

    /* -----------------------------------------------------
       TRADUZIR MATÉRIA
    ----------------------------------------------------- */

    let textoPT = "";

    if (textoOriginalCompleto) {
      textoPT =
        await traduzirTextoGrande(
          textoOriginalCompleto
        );
    }

    if (!textoPT) {
      textoPT =
        await traduzirMyMemory(
          noticia.descricao || ""
        );
    }

    /* -----------------------------------------------------
       RUMOR / LEAK
    ----------------------------------------------------- */

    const rumorLeak =
      noticia.rumorLeak ||
      detectarRumorLeak(
        `${noticia.titulo} ${textoOriginalCompleto}`
      );

    /* -----------------------------------------------------
       PRIMEIRA MENSAGEM
       IMPORTANTE:
       O LINK É ENVIADO NORMALMENTE PARA O DISCORD
       GERAR A PRÉVIA NATIVA COM IMAGEM.
    ----------------------------------------------------- */

    let primeiraMensagem =
      `@everyone 📰 **Acabou de sair notícia nova do Fortnite!**\n\n`;

    if (rumorLeak) {
      primeiraMensagem +=
        `🚨 **RUMOR / LEAK**\n\n`;
    }

    primeiraMensagem +=
      `🇧🇷 **${tituloPT}**\n\n`;

    if (textoPT) {
      const resumoInicial =
        limitarTexto(
          textoPT,
          1000
        );

      primeiraMensagem +=
        `📝 ${resumoInicial}\n\n`;
    }

    primeiraMensagem +=
      `${noticia.link}\n\n`;

    primeiraMensagem +=
      `👇 **Clique no título acima para ler a matéria completa.**`;

    /*
      Discord precisa receber a URL diretamente no conteúdo
      para gerar a grande prévia.
    */

    await canal.send({
      content: primeiraMensagem,
      allowedMentions: {
        parse: ["everyone"],
      },
    });

    /* -----------------------------------------------------
       RESTANTE DA MATÉRIA
    ----------------------------------------------------- */

    if (textoPT) {
      /*
        Como uma parte já foi colocada na primeira mensagem,
        removemos aproximadamente o mesmo trecho antes de
        enviar o restante.
      */

      const resumoInicial =
        limitarTexto(
          textoPT,
          1000
        );

      let restante = textoPT;

      if (
        restante.startsWith(
          resumoInicial
        )
      ) {
        restante = restante
          .slice(resumoInicial.length)
          .trim();
      }

      if (restante) {
        const partes =
          dividirParaDiscord(
            restante,
            1900
          );

        for (
          let i = 0;
          i < partes.length;
          i++
        ) {
          let conteudo =
            `📖 **Continuação da matéria**\n\n${partes[i]}`;

          if (i === partes.length - 1) {
            conteudo +=
              `\n\n🔗 ${noticia.link}`;
          }

          await canal.send({
            content: conteudo,
          });

          await new Promise(
            (resolve) =>
              setTimeout(resolve, 500)
          );
        }
      }
    }

    console.log(
      `✅ Fortnite publicada com matéria completa: ${noticia.titulo}`
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
   NÃO ALTERAR
========================================================= */

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) return false;

    const embed = new EmbedBuilder()
      .setTitle(
        "🛒 Loja do Fortnite"
      )
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
        text: "Murilito NEWS • Fortnite",
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
   PROCESSAR GTA
========================================================= */

async function processarGTA() {
  console.log(
    "🚔 Verificando notícias do GTA..."
  );

  let total = 0;

  /* Rockstar */

  try {
    const rockstar =
      await buscarNoticiasRockstar();

    let publicadasRockstar = 0;

    for (const noticia of rockstar.slice(
      0,
      2
    )) {
      const publicou =
        await publicarGTA(
          noticia
        );

      if (publicou) {
        total++;
        publicadasRockstar++;
      }
    }

    console.log(
      `📊 Rockstar: ${publicadasRockstar} notícia(s) nova(s) publicada(s).`
    );
  } catch (erro) {
    console.log(
      "❌ Erro processando Rockstar:",
      erro.message
    );
  }

  /* LibertyCity */

  try {
    const liberty =
      await buscarNoticiasLibertyCity();

    let publicadasLiberty = 0;

    for (const noticia of liberty.slice(
      0,
      2
    )) {
      const publicou =
        await publicarGTA(
          noticia
        );

      if (publicou) {
        total++;
        publicadasLiberty++;
      }
    }

    console.log(
      `📊 LibertyCity: ${publicadasLiberty} notícia(s) nova(s) publicada(s).`
    );
  } catch (erro) {
    console.log(
      "❌ Erro processando LibertyCity:",
      erro.message
    );
  }

  return total;
}

/* =========================================================
   PROCESSAR FORTNITE
========================================================= */

async function processarFortnite() {
  console.log(
    "🎮 Verificando notícias do Fortnite..."
  );

  try {
    const noticias =
      await buscarNoticiasFortnite();

    let total = 0;

    /*
      Máximo de 2 notícias por ciclo.
      Isso evita que o bot dispare muitas traduções
      de uma vez.
    */

    for (const noticia of noticias.slice(
      0,
      2
    )) {
      const publicou =
        await publicarFortnite(
          noticia
        );

      if (publicou) {
        total++;
      }
    }

    console.log(
      `📊 Fortnite: ${total} notícia(s) nova(s) publicada(s).`
    );

    return total;
  } catch (erro) {
    console.log(
      "❌ Erro processando Fortnite:",
      erro.message
    );

    return 0;
  }
}

/* =========================================================
   TESTE DE TRADUÇÃO
========================================================= */

async function executarTesteTraducao(
  canal
) {
  try {
    await canal.send(
      "🧪 Testando MyMemory... Aguarde alguns segundos."
    );

    const original =
      "Fortnite Hotfix Adjusts the 8-Bit Shotgun";

    const traduzido =
      await traduzirMyMemory(
        original
      );

    if (
      !traduzido ||
      traduzido === original
    ) {
      await canal.send(
        "❌ TRADUÇÃO NÃO FUNCIONOU."
      );

      return;
    }

    await canal.send(
      `✅ **TRADUÇÃO FUNCIONOU!**\n\n` +
      `🇺🇸 Original:\n${original}\n\n` +
      `🇧🇷 Português:\n${traduzido}`
    );
  } catch (erro) {
    await canal.send(
      `❌ Erro no teste de tradução: ${erro.message}`
    );
  }
}

/* =========================================================
   TESTE FORTNITE
========================================================= */

async function executarTesteFortnite(
  canal
) {
  try {
    await canal.send(
      "🧪 Testando RSS + matéria completa + MyMemory..."
    );

    const noticias =
      await buscarNoticiasFortnite();

    if (!noticias.length) {
      await canal.send(
        "❌ O RSS não retornou notícias."
      );

      return;
    }

    const noticia = noticias[0];

    const tituloPT =
      await traduzirMyMemory(
        noticia.titulo
      );

    const materia =
      await buscarMateriaCompleta(
        noticia.link
      );

    let textoOriginal =
      materia?.texto ||
      noticia.descricao ||
      "";

    textoOriginal =
      limitarTexto(
        textoOriginal,
        10000
      );

    const textoPT =
      await traduzirTextoGrande(
        textoOriginal
      );

    const rumorLeak =
      detectarRumorLeak(
        `${noticia.titulo} ${textoOriginal}`
      );

    let mensagem =
      `🧪 **TESTE FORTNITE**\n\n`;

    if (rumorLeak) {
      mensagem +=
        `🚨 **RUMOR / LEAK**\n\n`;
    }

    mensagem +=
      `🇺🇸 **Original:** ${noticia.titulo}\n\n`;

    mensagem +=
      `🇧🇷 **${tituloPT}**\n\n`;

    if (textoPT) {
      mensagem +=
        `📝 ${limitarTexto(
          textoPT,
          900
        )}\n\n`;
    }

    mensagem +=
      `${noticia.link}`;

    await canal.send({
      content: mensagem,
    });

    if (textoPT) {
      const restante =
        textoPT.slice(
          Math.min(
            textoPT.length,
            900
          )
        ).trim();

      if (restante) {
        const partes =
          dividirParaDiscord(
            restante,
            1900
          );

        for (const parte of partes) {
          await canal.send({
            content:
              `📖 **Continuação do teste**\n\n${parte}`,
          });

          await new Promise(
            (resolve) =>
              setTimeout(resolve, 500)
          );
        }
      }
    }

    await canal.send(
      `🔗 ${noticia.link}`
    );
  } catch (erro) {
    console.log(
      "❌ Erro teste Fortnite:",
      erro.message
    );

    await canal.send(
      `❌ Erro no teste Fortnite: ${erro.message}`
    );
  }
}

/* =========================================================
   COMANDOS
========================================================= */

client.on(
  "messageCreate",
  async (message) => {
    if (message.author.bot) return;

    const conteudo =
      message.content.trim();

    if (!conteudo.startsWith("!")) {
      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!teste traducao"
    ) {
      await executarTesteTraducao(
        message.channel
      );

      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!teste fortnite"
    ) {
      await executarTesteFortnite(
        message.channel
      );

      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!teste rockstar"
    ) {
      await message.channel.send(
        "🧪 Testando Rockstar..."
      );

      const noticias =
        await buscarNoticiasRockstar();

      if (!noticias.length) {
        await message.channel.send(
          "❌ Rockstar não retornou notícias."
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

      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!teste liberty"
    ) {
      await message.channel.send(
        "🧪 Testando LibertyCity..."
      );

      const noticias =
        await buscarNoticiasLibertyCity();

      if (!noticias.length) {
        await message.channel.send(
          "❌ LibertyCity não retornou notícias."
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

      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!teste loja"
    ) {
      await publicarLoja();

      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!teste"
    ) {
      await message.channel.send(
        "🧪 Teste geral iniciado..."
      );

      await processarGTA();
      await processarFortnite();

      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!piada"
    ) {
      const piadas = [
        "🎮 Por que o Fortnite foi ao médico? Porque estava com muitos bugs. 😂",
        "🚗 O GTA não tem trânsito, tem apenas eventos aleatórios. 😂",
        "🎮 No Fortnite, até o guarda-chuva tem mais estilo que eu. 😂",
        "🚔 No GTA você pode comprar uma mansão, mas continua morrendo para o NPC. 😂",
      ];

      const piada =
        piadas[
          Math.floor(
            Math.random() *
              piadas.length
          )
        ];

      await message.channel.send(
        piada
      );

      return;
    }

    if (
      conteudo.toLowerCase() ===
      "!ajuda"
    ) {
      await message.channel.send(
        `🤖 **Murilito NEWS - Comandos**\n\n` +
        `\`!teste\` → teste geral\n` +
        `\`!teste fortnite\` → testa RSS + matéria completa + tradução\n` +
        `\`!teste rockstar\` → testa Rockstar\n` +
        `\`!teste liberty\` → testa LibertyCity\n` +
        `\`!teste loja\` → testa loja Fortnite\n` +
        `\`!teste traducao\` → testa MyMemory\n` +
        `\`!piada\` → manda uma piada\n` +
        `\`!ajuda\` → mostra esta mensagem`
      );

      return;
    }
  }
);

/* =========================================================
   CICLO AUTOMÁTICO
========================================================= */

let cicloExecutando = false;

async function executarCiclo() {
  if (cicloExecutando) {
    console.log(
      "⏳ Ciclo anterior ainda está executando."
    );

    return;
  }

  cicloExecutando = true;

  try {
    console.log(
      "========================================"
    );

    console.log(
      "🔄 INICIANDO CICLO AUTOMÁTICO"
    );

    console.log(
      "========================================"
    );

    await processarGTA();

    await processarFortnite();

    console.log(
      "✅ Ciclo automático finalizado."
    );
  } catch (erro) {
    console.log(
      "❌ Erro no ciclo automático:",
      erro.message
    );
  } finally {
    cicloExecutando = false;
  }
}

/* =========================================================
   READY
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `🤖 Murilito NEWS conectado como ${client.user.tag}`
    );

    console.log(
      "📡 Sistema automático iniciado."
    );

    /*
      Primeiro ciclo depois de 10 segundos.
    */

    setTimeout(() => {
      executarCiclo();
    }, 10000);

    /*
      Notícias a cada 10 minutos.
    */

    setInterval(
      () => {
        executarCiclo();
      },
      10 * 60 * 1000
    );

    /*
      Loja diariamente às 21:00.
    */

    setInterval(
      async () => {
        const agora =
          new Date();

        const hora =
          agora.getHours();

        const minuto =
          agora.getMinutes();

        if (
          hora === 21 &&
          minuto === 0
        ) {
          await publicarLoja();
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
