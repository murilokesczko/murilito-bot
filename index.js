```javascript
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const puppeteer = require("puppeteer");
const Parser = require("rss-parser");

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const TOKEN = process.env.TOKEN;

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const RSS_FORTNITE = "https://fortnitenews.com/rss";

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
// RSS
// ======================================================

const rssParser = new Parser({
  timeout: 15000
});

// ======================================================
// NAVEGADOR
// ======================================================

let browser = null;
let browserPromise = null;

async function getBrowser() {
  if (browser) {
    try {
      if (browser.connected) {
        return browser;
      }
    } catch (e) {}
  }

  if (browserPromise) {
    return browserPromise;
  }

  browserPromise = (async function () {
    console.log("🌐 Iniciando navegador Puppeteer...");

    const novoBrowser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process"
      ]
    });

    browser = novoBrowser;

    console.log("✅ Puppeteer iniciado.");

    return browser;
  })();

  try {
    return await browserPromise;
  } finally {
    browserPromise = null;
  }
}

// ======================================================
// UTILITÁRIOS
// ======================================================

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/<[^>]*>/g, " ")
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
    return new URL(url).href;
  } catch (erro) {
    return url;
  }
}

// ======================================================
// TRADUÇÃO GOOGLE
// ======================================================

async function traduzirGoogle(texto) {
  if (!texto) return "";

  try {
    const textoLimpo = String(texto).trim();

    if (!textoLimpo) return "";

    const url =
      "https://translate.googleapis.com/translate_a/single" +
      "?client=gtx" +
      "&sl=en" +
      "&tl=pt-BR" +
      "&dt=t" +
      "&q=" +
      encodeURIComponent(textoLimpo);

    const resposta = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!resposta.ok) {
      throw new Error(
        "Google Translate HTTP " +
        resposta.status
      );
    }

    const dados = await resposta.json();

    if (
      !Array.isArray(dados) ||
      !Array.isArray(dados[0])
    ) {
      throw new Error(
        "Resposta de tradução inválida."
      );
    }

    const traduzido = dados[0]
      .map(function (parte) {
        return parte[0];
      })
      .filter(Boolean)
      .join("");

    if (!traduzido) {
      throw new Error(
        "Google Translate não retornou texto."
      );
    }

    return traduzido.trim();

  } catch (erro) {
    console.log(
      "⚠️ Falha na tradução:",
      erro.message
    );

    return texto;
  }
}

// ======================================================
// DETECTAR RUMOR / LEAK
// ======================================================

function detectarRumorLeak(titulo, descricao) {
  const texto =
    String(titulo || "") +
    " " +
    String(descricao || "");

  const textoMinusculo =
    texto.toLowerCase();

  const palavras = [
    "leak",
    "leaked",
    "leaks",
    "leaker",
    "rumor",
    "rumored",
    "reportedly",
    "report",
    "allegedly",
    "unconfirmed"
  ];

  return palavras.some(function (palavra) {
    return textoMinusculo.includes(palavra);
  });
}

// ======================================================
// VERIFICAR DUPLICAÇÃO
// ======================================================

async function noticiaJaPublicada(
  canal,
  link,
  titulo
) {
  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 50
      });

    const linkNormalizado =
      normalizarUrl(link);

    for (const [, mensagem] of mensagens) {
      if (!mensagem.content) continue;

      if (
        linkNormalizado &&
        mensagem.content.includes(
          linkNormalizado
        )
      ) {
        return true;
      }

      if (
        titulo &&
        mensagem.content
          .toLowerCase()
          .includes(
            titulo.toLowerCase()
          )
      ) {
        return true;
      }
    }

    return false;

  } catch (erro) {
    console.log(
      "⚠️ Não foi possível verificar duplicação:",
      erro.message
    );

    return false;
  }
}

// ======================================================
// GTA
// CONGELADO — NÃO MEXER
// ======================================================

async function publicarGTA(
  noticia,
  forcar = false
) {
  try {
    const canal =
      await client.channels.fetch(
        ID_GTA
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
          "⏭️ GTA: já publicada: " +
          noticia.titulo
        );

        return false;
      }
    }

    console.log(
      "🚔 GTA enviando link: " +
      noticia.link
    );

    await canal.send({
      content:
        "@everyone 📰 **Acabou de sair notícia nova do GTA!**\n\n" +
        noticia.link +
        "\n\n" +
        "👇 **Clique no título acima para ler a matéria completa.**",

      allowedMentions: {
        parse: ["everyone"]
      }
    });

    console.log(
      "✅ GTA publicada com prévia do Discord: " +
      noticia.titulo
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

// ======================================================
// ROCKSTAR
// CONGELADO
// ======================================================

async function buscarNoticiasRockstar() {
  try {
    console.log(
      "🌐 Rockstar: https://www.rockstargames.com/br/newswire"
    );

    const browserAtual =
      await getBrowser();

    const page =
      await browserAtual.newPage();

    const resposta =
      await page.goto(
        "https://www.rockstargames.com/br/newswire",
        {
          waitUntil:
            "domcontentloaded",
          timeout: 30000
        }
      );

    console.log(
      "🌐 Rockstar status: " +
      (
        resposta
          ? resposta.status()
          : "?"
      )
    );

    await new Promise(function (resolve) {
      setTimeout(resolve, 3000);
    });

    const noticias =
      await page.evaluate(function () {
        const resultados = [];

        const links =
          document.querySelectorAll(
            'a[href*="/newswire/article/"]'
          );

        const vistos = new Set();

        for (const link of links) {
          const href = link.href;

          if (
            !href ||
            vistos.has(href)
          ) {
            continue;
          }

          vistos.add(href);

          let titulo =
            link.innerText ||
            link.textContent ||
            "";

          titulo = titulo
            .replace(/\s+/g, " ")
            .trim();

          if (!titulo) {
            const parent =
              link.closest(
                "article, div"
              );

            if (parent) {
              titulo =
                parent.innerText
                  .replace(/\s+/g, " ")
                  .trim();
            }
          }

          if (!titulo) continue;

          resultados.push({
            titulo: titulo,
            link: href
          });
        }

        return resultados.slice(0, 20);
      });

    await page.close();

    for (const noticia of noticias) {
      console.log(
        "📰 Rockstar candidato: " +
        noticia.titulo
      );
    }

    console.log(
      "🔎 Rockstar: " +
      noticias.length +
      " candidatos encontrados."
    );

    return noticias;

  } catch (erro) {
    console.log(
      "❌ Erro buscando Rockstar:",
      erro.message
    );

    return [];
  }
}

// ======================================================
// LIBERTYCITY
// CONGELADO
// ======================================================

async function buscarNoticiasLibertyCity() {
  try {
    console.log(
      "🔎 LibertyCity: procurando SOMENTE notícias..."
    );

    const browserAtual =
      await getBrowser();

    const page =
      await browserAtual.newPage();

    const resposta =
      await page.goto(
        "https://pt.libertycity.net/news/",
        {
          waitUntil:
            "domcontentloaded",
          timeout: 30000
        }
      );

    console.log(
      "🌐 LibertyCity status: " +
      (
        resposta
          ? resposta.status()
          : "?"
      )
    );

    await new Promise(function (resolve) {
      setTimeout(resolve, 2000);
    });

    const noticias =
      await page.evaluate(function () {
        const resultados = [];

        const links =
          document.querySelectorAll(
            'a[href*="/news/"]'
          );

        const vistos = new Set();

        for (const link of links) {
          const href = link.href;

          if (
            !href ||
            vistos.has(href)
          ) {
            continue;
          }

          if (
            !href.includes(
              "/news/gta-"
            ) &&
            !href.includes(
              "/news/gtav"
            ) &&
            !href.includes(
              "/news/gta-6"
            )
          ) {
            continue;
          }

          vistos.add(href);

          let titulo =
            link.innerText ||
            link.textContent ||
            "";

          titulo = titulo
            .replace(/\s+/g, " ")
            .trim();

          if (!titulo) continue;

          resultados.push({
            titulo: titulo,
            link: href
          });
        }

        return resultados.slice(0, 20);
      });

    await page.close();

    console.log(
      "🔎 LibertyCity: " +
      noticias.length +
      " notícias reais encontradas."
    );

    return noticias;

  } catch (erro) {
    console.log(
      "❌ Erro buscando LibertyCity:",
      erro.message
    );

    return [];
  }
}

// ======================================================
// FORTNITE RSS
// ======================================================

async function buscarNoticiasFortniteRSS() {
  try {
    console.log(
      "━━━━━━━━ Fortnite RSS ━━━━━━━━"
    );

    console.log(
      "🔎 Fortnite: consultando RSS " +
      RSS_FORTNITE
    );

    const feed =
      await rssParser.parseURL(
        RSS_FORTNITE
      );

    console.log(
      "✅ RSS Fortnite conectado."
    );

    console.log(
      "📰 Título do feed: " +
      (
        feed.title ||
        "não informado"
      )
    );

    console.log(
      "📊 Notícias recebidas: " +
      feed.items.length
    );

    const noticias = [];

    for (
      const item of feed.items.slice(0, 10)
    ) {
      const titulo =
        limparTexto(
          item.title
        );

      const link =
        normalizarUrl(
          item.link
        );

      const descricao =
        limparTexto(
          item.contentSnippet ||
          item.content ||
          item.summary ||
          ""
        );

      const data =
        item.isoDate ||
        item.pubDate ||
        "";

      let imagem = "";

      if (
        item.enclosure &&
        item.enclosure.url
      ) {
        imagem =
          item.enclosure.url;
      }

      if (
        !imagem &&
        item["media:content"] &&
        item["media:content"].$ &&
        item["media:content"].$.url
      ) {
        imagem =
          item["media:content"].$.url;
      }

      if (
        !imagem &&
        item["media:thumbnail"] &&
        item["media:thumbnail"].$ &&
        item["media:thumbnail"].$.url
      ) {
        imagem =
          item["media:thumbnail"].$.url;
      }

      const rumorLeak =
        detectarRumorLeak(
          titulo,
          descricao
        );

      noticias.push({
        titulo: titulo,
        link: link,
        descricao: descricao,
        data: data,
        imagem: imagem,
        rumorLeak: rumorLeak
      });

      console.log("");
      console.log(
        "━━━━━━━━━━━━━━━━━━━━━━━━"
      );

      console.log(
        "📰 Título: " +
        (titulo || "(vazio)")
      );

      console.log(
        "🔗 Link: " +
        (link || "(vazio)")
      );

      console.log(
        "📅 Data: " +
        (data || "(vazia)")
      );

      console.log(
        "📝 Descrição: " +
        (descricao || "(vazia)")
      );

      console.log(
        "🖼️ Imagem: " +
        (imagem || "(não fornecida)")
      );

      console.log(
        "🚨 Rumor/Leak: " +
        (
          rumorLeak
            ? "SIM"
            : "NÃO"
        )
      );

      console.log(
        "━━━━━━━━━━━━━━━━━━━━━━━━"
      );
    }

    return noticias;

  } catch (erro) {
    console.log(
      "❌ ERRO NO RSS DO FORTNITE:"
    );

    console.log(
      erro.message
    );

    return [];
  }
}

// ======================================================
// PUBLICAR FORTNITE
// ======================================================

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

    if (!noticia.link) {
      console.log(
        "⚠️ Fortnite: notícia sem link."
      );

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
          "⏭️ Fortnite: já publicada: " +
          noticia.titulo
        );

        return false;
      }
    }

    console.log(
      "🎮 Fortnite: traduzindo: " +
      noticia.titulo
    );

    const tituloPT =
      await traduzirGoogle(
        noticia.titulo
      );

    let descricaoPT =
      await traduzirGoogle(
        noticia.descricao
      );

    if (
      descricaoPT.length > 700
    ) {
      descricaoPT =
        descricaoPT
          .slice(0, 697)
          .trim() +
        "...";
    }

    let mensagem =
      "@everyone 📰 **Acabou de sair notícia nova do Fortnite!**\n\n";

    if (noticia.rumorLeak) {
      mensagem =
        mensagem +
        "🚨 **RUMOR / LEAK**\n\n";
    }

    mensagem =
      mensagem +
      "🇧🇷 **" +
      tituloPT +
      "**\n\n";

    if (descricaoPT) {
      mensagem =
        mensagem +
        "📝 " +
        descricaoPT +
        "\n\n";
    }

    mensagem =
      mensagem +
      "🔗 " +
      noticia.link +
      "\n\n" +
      "👇 **Clique no título acima para ler a matéria completa.**";

    await canal.send({
      content: mensagem,
      allowedMentions: {
        parse: ["everyone"]
      }
    });

    console.log(
      "✅ Fortnite publicado em PT-BR: " +
      tituloPT
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

// ======================================================
// LOJA FORTNITE
// NÃO ALTERADA
// ======================================================

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) return false;

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setDescription(
          "A loja do Fortnite foi atualizada!\n\n" +
          "Clique abaixo para conferir todos os itens disponíveis."
        )
        .setURL(
          "https://www.fortnite.com/item-shop?lang=pt-BR"
        )
        .setImage(
          "https://fortnite.gg/img/og-shop.jpg"
        )
        .setFooter({
          text:
            "Murilito NEWS • Fortnite"
        })
        .setTimestamp();

    await canal.send({
      content: "@everyone",
      embeds: [embed],
      allowedMentions: {
        parse: ["everyone"]
      }
    });

    console.log(
      "🛒 Loja do Fortnite publicada."
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

// ======================================================
// PROCESSAR GTA
// ======================================================

async function processarGTA() {
  let total = 0;

  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  const rockstar =
    await buscarNoticiasRockstar();

  for (
    const noticia of rockstar.slice(0, 2)
  ) {
    const publicou =
      await publicarGTA(
        noticia
      );

    if (publicou) {
      total++;
    }
  }

  console.log(
    "📊 Rockstar: " +
    total +
    " notícia(s) nova(s) publicada(s)."
  );

  let totalLiberty = 0;

  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  const liberty =
    await buscarNoticiasLibertyCity();

  for (
    const noticia of liberty.slice(0, 2)
  ) {
    const publicou =
      await publicarGTA(
        noticia
      );

    if (publicou) {
      totalLiberty++;
    }
  }

  console.log(
    "📊 GTA LibertyCity: " +
    totalLiberty +
    " notícia(s) nova(s) publicada(s)."
  );

  return total + totalLiberty;
}

// ======================================================
// PROCESSAR FORTNITE
// ======================================================

async function processarFortnite() {
  let total = 0;

  const noticias =
    await buscarNoticiasFortniteRSS();

  if (!noticias.length) {
    console.log(
      "❌ Nenhuma notícia Fortnite encontrada."
    );

    return 0;
  }

  for (
    const noticia of noticias.slice(0, 2)
  ) {
    const publicou =
      await publicarFortnite(
        noticia
      );

    if (publicou) {
      total++;
    }
  }

  console.log(
    "📊 Fortnite: " +
    total +
    " notícia(s) nova(s) publicada(s)."
  );

  return total;
}

// ======================================================
// CICLO AUTOMÁTICO
// ======================================================

let cicloRodando = false;

async function cicloNoticias() {
  if (cicloRodando) {
    console.log(
      "⏭️ Ciclo já está rodando. Ignorando novo ciclo."
    );

    return;
  }

  cicloRodando = true;

  try {
    console.log(
      "📰 INICIANDO CICLO DE NOTÍCIAS"
    );

    console.log(
      "🇧🇷 " +
      new Date().toLocaleString(
        "pt-BR"
      )
    );

    const totalGTA =
      await processarGTA();

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );

    const totalFortnite =
      await processarFortnite();

    console.log(
      "📊 GTA TOTAL: " +
      totalGTA +
      " notícia(s) nova(s) publicada(s)."
    );

    console.log(
      "📊 FORTNITE TOTAL: " +
      totalFortnite +
      " notícia(s) nova(s) publicada(s)."
    );

    console.log(
      "📰 CICLO FINALIZADO"
    );

  } catch (erro) {
    console.log(
      "❌ Erro no ciclo:",
      erro.message
    );

  } finally {
    cicloRodando = false;
  }
}

// ======================================================
// TESTE FORTNITE
// ======================================================

let testeRodando = false;

async function executarTesteFortnite(
  canalResposta
) {
  if (testeRodando) {
    await canalResposta.send(
      "⏳ Já existe um teste em andamento."
    );

    return;
  }

  testeRodando = true;

  try {
    await canalResposta.send(
      "🧪 **Testando RSS + tradução do Fortnite...**\n" +
      "Vou consultar a fonte e traduzir a primeira notícia sem publicar no canal de notícias."
    );

    const noticias =
      await buscarNoticiasFortniteRSS();

    if (!noticias.length) {
      await canalResposta.send(
        "❌ O RSS não retornou nenhuma notícia."
      );

      return;
    }

    const primeira =
      noticias[0];

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "🧪 TESTE FORTNITE + TRADUÇÃO"
    );
    console.log(
      "========================================"
    );

    console.log(
      "📰 Original: " +
      primeira.titulo
    );

    const tituloPT =
      await traduzirGoogle(
        primeira.titulo
      );

    let descricaoPT =
      await traduzirGoogle(
        primeira.descricao
      );

    if (
      descricaoPT.length > 700
    ) {
      descricaoPT =
        descricaoPT
          .slice(0, 697)
          .trim() +
        "...";
    }

    console.log(
      "🇧🇷 Traduzido: " +
      tituloPT
    );

    console.log(
      "🔗 " +
      primeira.link
    );

    console.log(
      "========================================"
    );

    let mensagem =
      "✅ **RSS + tradução funcionando!**\n\n";

    if (primeira.rumorLeak) {
      mensagem =
        mensagem +
        "🚨 **RUMOR / LEAK**\n\n";
    }

    mensagem =
      mensagem +
      "🇧🇷 **" +
      tituloPT +
      "**\n\n";

    if (descricaoPT) {
      mensagem =
        mensagem +
        "📝 " +
        descricaoPT +
        "\n\n";
    }

    mensagem =
      mensagem +
      "🔗 " +
      primeira.link +
      "\n\n" +
      "📌 **Esta foi apenas uma prévia de teste. A notícia não foi publicada no canal Fortnite.**";

    await canalResposta.send({
      content: mensagem
    });

  } catch (erro) {
    console.log(
      "❌ Erro no teste Fortnite:",
      erro.message
    );

    await canalResposta.send(
      "❌ **O teste do RSS/tradução falhou.**\n\n" +
      "Erro: " +
      erro.message
    );

  } finally {
    testeRodando = false;
  }
}

// ======================================================
// COMANDOS
// ======================================================

client.on(
  "messageCreate",
  async function (message) {
    if (message.author.bot) {
      return;
    }

    const texto =
      message.content
        .trim()
        .toLowerCase();

    // --------------------------------------------------
    // TESTE FORTNITE
    // --------------------------------------------------

    if (
      texto ===
      "!teste fortnite"
    ) {
      await executarTesteFortnite(
        message.channel
      );

      return;
    }

    // --------------------------------------------------
    // TESTE ROCKSTAR
    // --------------------------------------------------

    if (
      texto ===
      "!teste rockstar"
    ) {
      if (testeRodando) {
        await message.channel.send(
          "⏳ Já existe um teste em andamento."
        );

        return;
      }

      testeRodando = true;

      try {
        const noticias =
          await buscarNoticiasRockstar();

        if (!noticias.length) {
          await message.channel.send(
            "❌ Nenhuma notícia Rockstar encontrada."
          );

          return;
        }

        await publicarGTA(
          noticias[0],
          true
        );

      } finally {
        testeRodando = false;
      }

      return;
    }

    // --------------------------------------------------
    // TESTE LIBERTYCITY
    // --------------------------------------------------

    if (
      texto ===
      "!teste liberty"
    ) {
      if (testeRodando) {
        await message.channel.send(
          "⏳ Já existe um teste em andamento."
        );

        return;
      }

      testeRodando = true;

      try {
        const noticias =
          await buscarNoticiasLibertyCity();

        if (!noticias.length) {
          await message.channel.send(
            "❌ Nenhuma notícia LibertyCity encontrada."
          );

          return;
        }

        await publicarGTA(
          noticias[0],
          true
        );

      } finally {
        testeRodando = false;
      }

      return;
    }

    // --------------------------------------------------
    // TESTE LOJA
    // --------------------------------------------------

    if (
      texto ===
      "!teste loja"
    ) {
      await publicarLoja();

      return;
    }

    // --------------------------------------------------
    // AJUDA DOS TESTES
    // --------------------------------------------------

    if (
      texto ===
      "!teste"
    ) {
      await message.channel.send(
        "🧪 **Testes disponíveis:**\n\n" +
        "• !teste fortnite → testa RSS + tradução sem publicar\n" +
        "• !teste rockstar → publica uma notícia Rockstar\n" +
        "• !teste liberty → publica uma notícia LibertyCity\n" +
        "• !teste loja → testa a loja"
      );

      return;
    }

    // --------------------------------------------------
    // PIADA
    // --------------------------------------------------

    if (
      texto ===
      "!piada"
    ) {
      const piadas = [
        "🎮 Por que o jogador foi para o médico? Porque estava com FPS baixo.",
        "😂 O player disse que ia jogar só uma partida... 6 horas depois...",
        "🤣 Meu PC não trava. Ele apenas tira férias no meio da partida."
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

    // --------------------------------------------------
    // AJUDA
    // --------------------------------------------------

    if (
      texto ===
      "!ajuda"
    ) {
      await message.channel.send(
        "🤖 **Murilito NEWS**\n\n" +
        "• !teste fortnite\n" +
        "• !teste rockstar\n" +
        "• !teste liberty\n" +
        "• !teste loja\n" +
        "• !piada\n" +
        "• !ajuda"
      );

      return;
    }
  }
);

// ======================================================
// READY
// ======================================================

client.once(
  "ready",
  function () {
    console.log(
      "🤖 " +
      client.user.tag +
      " está ONLINE!"
    );

    console.log(
      "🛒 Canal Loja: " +
      ID_LOJA
    );

    console.log(
      "🎮 Canal Fortnite: " +
      ID_FORTNITE
    );

    console.log(
      "🚔 Canal GTA: " +
      ID_GTA
    );

    console.log(
      "📰 Sistema automático de notícias iniciado."
    );

    setTimeout(
      function () {
        cicloNoticias();
      },
      10000
    );

    // ==================================================
    // CICLO A CADA 10 MINUTOS
    // ==================================================

    setInterval(
      function () {
        cicloNoticias();
      },
      10 * 60 * 1000
    );

    // ==================================================
    // LOJA ÀS 21:00
    // ==================================================

    let ultimaLoja = "";

    setInterval(
      async function () {
        const agora =
          new Date();

        const hora =
          agora.getHours();

        const minuto =
          agora.getMinutes();

        const hoje =
          agora
            .toISOString()
            .slice(
              0,
              10
            );

        if (
          hora === 21 &&
          minuto === 0 &&
          ultimaLoja !== hoje
        ) {
          ultimaLoja = hoje;

          await publicarLoja();
        }
      },
      60000
    );
  }
);

// ======================================================
// LOGIN
// ======================================================

if (!TOKEN) {
  console.log(
    "❌ ERRO: variável TOKEN não encontrada."
  );

  process.exit(1);
}

client.login(TOKEN);
```
