require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const puppeteer = require("puppeteer");


// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ A variável TOKEN não foi encontrada.");
  process.exit(1);
}


// ============================================================
// CANAIS
// ============================================================

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";


// ============================================================
// URLS
// ============================================================

const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

const FORTNITE_GG =
  "https://fortnite.gg/news";

const LIBERTYCITY =
  "https://pt.libertycity.net/news/";

const ROCKSTAR =
  "https://www.rockstargames.com/br/newswire";


// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});


// ============================================================
// CONTROLE
// ============================================================

let browser = null;
let cicloExecutando = false;
let ultimaLoja = null;


// ============================================================
// BROWSER
// ============================================================

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


// ============================================================
// NOVA PÁGINA
// ============================================================

async function novaPagina() {

  const b = await getBrowser();

  const page = await b.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/140.0.0.0 Safari/537.36"
  );

  await page.setViewport({
    width: 1440,
    height: 900
  });

  await page.setExtraHTTPHeaders({
    "Accept-Language":
      "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
  });

  page.setDefaultNavigationTimeout(45000);

  return page;
}


// ============================================================
// LIMPAR TEXTO
// ============================================================

function limparTexto(texto) {

  if (!texto) {
    return "";
  }

  return texto
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}


// ============================================================
// RESUMO
// ============================================================

function criarResumo(texto, limite = 850) {

  const limpo = limparTexto(texto);

  if (!limpo) {
    return "";
  }

  if (limpo.length <= limite) {
    return limpo;
  }

  return limpo.substring(0, limite - 3).trim() + "...";
}


// ============================================================
// URL VÁLIDA
// ============================================================

function urlValida(url) {

  if (!url) {
    return false;
  }

  try {

    const u = new URL(url);

    return (
      u.protocol === "http:" ||
      u.protocol === "https:"
    );

  } catch {

    return false;
  }
}


// ============================================================
// URL ABSOLUTA
// ============================================================

function urlAbsoluta(url, base) {

  if (!url) {
    return null;
  }

  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}


// ============================================================
// PUBLICAR NOTÍCIA
// ============================================================

async function publicarNoticia(tipo, noticia) {

  const canalId =
    tipo === "FORTNITE"
      ? ID_FORTNITE
      : ID_GTA;

  const canal =
    await client.channels.fetch(canalId);

  if (!canal) {

    console.log(
      "❌ Canal não encontrado:",
      canalId
    );

    return false;
  }


  const ehFortnite =
    tipo === "FORTNITE";


  const emoji =
    ehFortnite
      ? "🎮"
      : "🚔";


  const chamada =
    ehFortnite
      ? "@everyone 🎮 NOVIDADE DO FORTNITE! 🔥"
      : "@everyone 🚔 NOVIDADE DO GTA! 🔥";


  const titulo =
    noticia.title ||
    "Nova notícia";


  const link =
    noticia.link ||
    (
      ehFortnite
        ? FORTNITE_GG
        : ""
    );


  if (!urlValida(link)) {

    console.log(
      "❌ Link inválido:",
      link
    );

    return false;
  }


  const embed =
    new EmbedBuilder()
      .setTitle(
        emoji + " " + titulo
      )
      .setURL(link)
      .setDescription(
        ehFortnite
          ? "🎮 Confira a notícia do Fortnite no Fortnite.GG.\n\n" +
            "👇 Clique no título acima para acessar."
          : (
              criarResumo(
                noticia.description
              ) ||
              "🚔 Confira todos os detalhes desta novidade do GTA."
            ) +
            "\n\n👇 Clique no título acima para ler a matéria completa."
      )
      .setFooter({
        text:
          ehFortnite
            ? "Murilito NEWS • Fortnite"
            : "Murilito NEWS • GTA"
      })
      .setTimestamp(
        noticia.date
          ? new Date(noticia.date)
          : new Date()
      );


  // GTA continua usando imagem.
  if (
    !ehFortnite &&
    urlValida(noticia.image)
  ) {

    embed.setImage(
      noticia.image
    );
  }


  try {

    await canal.send({

      content: chamada,

      embeds: [
        embed
      ]

    });

    console.log(
      "✅ " +
      tipo +
      " publicado: " +
      titulo
    );

    return true;

  } catch (erro) {

    console.log(
      "⚠️ Erro publicando embed:",
      erro.message
    );


    // Tenta mensagem simples.
    try {

      await canal.send(
        chamada +
        "\n\n" +
        emoji +
        " **" +
        titulo +
        "**\n" +
        link
      );

      console.log(
        "✅ " +
        tipo +
        " publicado como mensagem simples."
      );

      return true;

    } catch (erro2) {

      console.log(
        "❌ Falha definitiva:",
        erro2.message
      );

      return false;
    }
  }
}


// ============================================================
// DUPLICADA
// ============================================================

async function noticiaJaPublicada(
  canalId,
  noticia
) {

  try {

    const canal =
      await client.channels.fetch(
        canalId
      );

    const mensagens =
      await canal.messages.fetch({
        limit: 100
      });


    const url =
      noticia.link || "";


    const titulo =
      (
        noticia.title || ""
      )
        .toLowerCase()
        .trim();


    for (
      const [, mensagem]
      of mensagens
    ) {

      // Verifica embeds
      if (
        mensagem.embeds &&
        mensagem.embeds.length > 0
      ) {

        for (
          const embed
          of mensagem.embeds
        ) {

          if (
            embed.url &&
            url &&
            embed.url === url
          ) {

            return true;
          }


          if (
            embed.title &&
            titulo &&
            embed.title
              .toLowerCase()
              .includes(titulo)
          ) {

            return true;
          }
        }
      }


      // Verifica mensagens simples
      if (
        mensagem.content &&
        url &&
        mensagem.content.includes(url)
      ) {

        return true;
      }
    }

  } catch (erro) {

    console.log(
      "⚠️ Erro verificando duplicata:",
      erro.message
    );
  }


  return false;
}


// ============================================================
// FORTNITE - FORTNITE.GG
// ============================================================

async function buscarNoticiasFortnite() {

  console.log(
    "🔎 Fortnite: procurando notícias no Fortnite.GG..."
  );

  let page = null;

  try {

    page = await novaPagina();

    console.log(
      "🌐 Fortnite.GG abrindo: " +
      FORTNITE_GG
    );

    const response = await page.goto(
      FORTNITE_GG,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          45000
      }
    );

    if (response) {

      console.log(
        "🌐 Fortnite.GG status:",
        response.status()
      );
    }

    await new Promise(
      resolve =>
        setTimeout(resolve, 4000)
    );


    const noticias =
      await page.evaluate(() => {

        const resultado = [];

        const vistos =
          new Set();


        const links =
          Array.from(
            document.querySelectorAll("a[href]")
          );


        console.log(
          "Links encontrados na página:",
          links.length
        );


        for (
          const a
          of links
        ) {

          let href =
            a.getAttribute("href") ||
            "";


          const titulo =
            (
              a.innerText || ""
            )
              .replace(/\s+/g, " ")
              .trim();


          if (
            !href ||
            !titulo
          ) {
            continue;
          }


          // Converte links relativos
          try {

            href =
              new URL(
                href,
                "https://fortnite.gg/"
              ).href;

          } catch {

            continue;
          }


          // Só links de notícias
          if (
            !href.includes(
              "fortnite.gg/news"
            )
          ) {
            continue;
          }


          // Não aceitar a página principal
          if (
            href ===
              "https://fortnite.gg/news" ||
            href ===
              "https://fortnite.gg/news/"
          ) {
            continue;
          }


          // Título muito pequeno
          if (
            titulo.length < 8
          ) {
            continue;
          }


          const tituloLower =
            titulo.toLowerCase();


          // Ignora navegação
          if (
            tituloLower === "news" ||
            tituloLower === "notícias" ||
            tituloLower === "next" ||
            tituloLower === "previous" ||
            tituloLower === "próxima" ||
            tituloLower === "anterior"
          ) {
            continue;
          }


          if (
            vistos.has(href)
          ) {
            continue;
          }


          vistos.add(href);


          resultado.push({

            title:
              titulo,

            link:
              href,

            description:
              "",

            image:
              null,

            date:
              new Date().toISOString()

          });
        }


        return resultado;
      });


    console.log(
      "📰 Fortnite.GG encontrou:",
      noticias.length,
      "links."
    );


    // Mostra os primeiros resultados no Railway
    for (
      const noticia
      of noticias.slice(0, 5)
    ) {

      console.log(
        "🎮 Fortnite:",
        noticia.title
      );

      console.log(
        "🔗:",
        noticia.link
      );
    }


    if (
      noticias.length > 0
    ) {

      console.log(
        "✅ Fortnite: fonte funcionando!"
      );

      return noticias;
    }


    // ========================================================
    // DEBUG
    // ========================================================

    console.log(
      "⚠️ Nenhum link de notícia encontrado."
    );

    console.log(
      "🔍 Procurando qualquer link relacionado a /news..."
    );


    const linksDebug =
      await page.evaluate(() => {

        return Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        )
        .map(a => ({

          href:
            a.getAttribute("href"),

          texto:
            (a.innerText || "")
              .replace(/\s+/g, " ")
              .trim()

        }))
        .filter(item =>
          item.href &&
          (
            item.href
              .toLowerCase()
              .includes("news") ||

            item.texto
              .toLowerCase()
              .includes("news")
          )
        )
        .slice(0, 20);

      });


    console.log(
      "🔍 Links encontrados no modo DEBUG:",
      JSON.stringify(
        linksDebug,
        null,
        2
      )
    );


    return [];


  } catch (erro) {

    console.log(
      "❌ Fortnite.GG falhou:",
      erro.message
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


// ============================================================
// LIBERTYCITY
// ============================================================

async function buscarNoticiasLibertyCity() {

  console.log(
    "🔎 LibertyCity: tentando navegador..."
  );


  let page = null;


  try {

    page =
      await novaPagina();


    console.log(
      "🌐 Puppeteer abrindo: " +
      LIBERTYCITY
    );


    const response =
      await page.goto(
        LIBERTYCITY,
        {
          waitUntil:
            "domcontentloaded",

          timeout:
            45000
        }
      );


    if (response) {

      console.log(
        "🌐 Puppeteer status:",
        response.status()
      );
    }


    await new Promise(
      resolve =>
        setTimeout(resolve, 2500)
    );


    const noticias =
      await page.evaluate(() => {

        const resultado = [];


        const links =
          Array.from(
            document.querySelectorAll("a")
          );


        for (
          const a
          of links
        ) {

          const href =
            a.href || "";


          const titulo =
            (
              a.innerText || ""
            ).trim();


          if (
            !href ||
            !href.includes(".html")
          ) {
            continue;
          }


          if (
            titulo.length < 15
          ) {
            continue;
          }


          if (
            titulo === "Notícias" ||
            /^\d+$/.test(titulo) ||
            titulo
              .toLowerCase()
              .includes("próxima página")
          ) {
            continue;
          }


          let container = a;


          for (
            let i = 0;
            i < 5 &&
            container;
            i++
          ) {

            const texto =
              container.innerText || "";


            if (
              texto.length > 50
            ) {
              break;
            }


            container =
              container.parentElement;
          }


          let image = null;


          if (container) {

            const img =
              container.querySelector("img");


            if (img) {

              image =
                img.currentSrc ||
                img.src ||
                img.getAttribute("data-src") ||
                img.getAttribute("data-original") ||
                null;
            }
          }


          const description =
            container
              ? (
                  container.innerText ||
                  ""
                ).trim()
              : "";


          resultado.push({

            title:
              titulo,

            link:
              href,

            description:
              description,

            image:
              image
          });
        }


        return resultado;
      });


    console.log(
      "🔎 LibertyCity Puppeteer:",
      noticias.length,
      "candidatos."
    );


    const unicas = [];


    const vistos =
      new Set();


    for (
      const noticia
      of noticias
    ) {

      if (
        vistos.has(
          noticia.link
        )
      ) {
        continue;
      }


      vistos.add(
        noticia.link
      );


      const titulo =
        noticia.title
          .toLowerCase();


      const relevante =
        titulo.includes("gta") ||
        titulo.includes("grand theft auto") ||
        titulo.includes("vice city") ||
        titulo.includes("los santos") ||
        titulo.includes("rockstar");


      if (!relevante) {
        continue;
      }


      unicas.push(
        noticia
      );
    }


    return unicas;

  } catch (erro) {

    console.log(
      "❌ LibertyCity falhou:",
      erro.message
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


// ============================================================
// ROCKSTAR
// ============================================================

async function buscarNoticiasRockstar() {

  console.log(
    "🔎 Rockstar: abrindo Newswire..."
  );


  let page = null;


  try {

    page =
      await novaPagina();


    console.log(
      "🌐 Puppeteer abrindo: " +
      ROCKSTAR
    );


    const response =
      await page.goto(
        ROCKSTAR,
        {
          waitUntil:
            "domcontentloaded",

          timeout:
            45000
        }
      );


    if (response) {

      console.log(
        "🌐 Puppeteer status:",
        response.status()
      );
    }


    await new Promise(
      resolve =>
        setTimeout(resolve, 3000)
    );


    const noticias =
      await page.evaluate(() => {

        const resultado = [];


        const links =
          Array.from(
            document.querySelectorAll(
              'a[href*="/br/newswire/article/"]'
            )
          );


        for (
          const a
          of links
        ) {

          const href =
            a.href || "";


          const titulo =
            (
              a.innerText || ""
            ).trim();


          if (
            !href ||
            !titulo ||
            titulo.length < 10
          ) {
            continue;
          }


          let container = a;


          for (
            let i = 0;
            i < 6 &&
            container;
            i++
          ) {

            const texto =
              container.innerText || "";


            if (
              texto.length > 50
            ) {
              break;
            }


            container =
              container.parentElement;
          }


          let image = null;


          if (container) {

            const imgs =
              Array.from(
                container.querySelectorAll(
                  "img"
                )
              );


            for (
              const img
              of imgs
            ) {

              image =
                img.currentSrc ||
                img.src ||
                img.getAttribute("data-src") ||
                img.getAttribute("data-lazy-src") ||
                img.getAttribute("data-original") ||
                img.getAttribute("data-image");


              if (image) {
                break;
              }
            }
          }


          const description =
            container
              ? (
                  container.innerText ||
                  ""
                ).trim()
              : "";


          resultado.push({

            title:
              titulo,

            link:
              href,

            description:
              description,

            image:
              image
          });
        }


        return resultado;
      });


    console.log(
      "🔎 Rockstar:",
      noticias.length,
      "artigos encontrados."
    );


    const unicas = [];


    const vistos =
      new Set();


    for (
      const noticia
      of noticias
    ) {

      if (
        vistos.has(
          noticia.link
        )
      ) {
        continue;
      }


      vistos.add(
        noticia.link
      );


      const titulo =
        noticia.title
          .toLowerCase();


      const relevante =
        titulo.includes("gta") ||
        titulo.includes("grand theft auto") ||
        titulo.includes("vice city") ||
        titulo.includes("los santos") ||
        titulo.includes("rockstar");


      if (!relevante) {
        continue;
      }


      unicas.push(
        noticia
      );
    }


    return unicas;

  } catch (erro) {

    console.log(
      "❌ Rockstar falhou:",
      erro.message
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


// ============================================================
// PROCESSAR NOTÍCIAS
// ============================================================

async function processarNoticias(
  tipo,
  noticias,
  canalId
) {

  if (
    !noticias ||
    noticias.length === 0
  ) {

    console.log(
      "📊 " +
      tipo +
      ": 0 notícia(s) nova(s) publicada(s)."
    );

    return;
  }


  let publicadas = 0;


  // Máximo 3 por ciclo.
  const limite =
    noticias.slice(0, 3);


  for (
    const noticia
    of limite
  ) {

    if (
      !noticia.link
    ) {
      continue;
    }


    const duplicada =
      await noticiaJaPublicada(
        canalId,
        noticia
      );


    if (duplicada) {

      console.log(
        "⏭️ " +
        tipo +
        ": já publicada: " +
        noticia.title
      );

      continue;
    }


    const sucesso =
      await publicarNoticia(
        tipo,
        noticia
      );


    if (sucesso) {
      publicadas++;
    }


    await new Promise(
      resolve =>
        setTimeout(resolve, 1200)
    );
  }


  console.log(
    "📊 " +
    tipo +
    ": " +
    publicadas +
    " notícia(s) nova(s) publicada(s)."
  );
}


// ============================================================
// CICLO
// ============================================================

async function cicloNoticias() {

  if (
    cicloExecutando
  ) {

    console.log(
      "⏳ Ciclo já está em andamento. Ignorando nova chamada."
    );

    return;
  }


  cicloExecutando = true;


  try {

    console.log("");
    console.log(
      "📰 INICIANDO CICLO DE NOTÍCIAS"
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


    // ========================================================
    // FORTNITE
    // ========================================================

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );


    const fortnite =
      await buscarNoticiasFortnite();


    await processarNoticias(
      "FORTNITE",
      fortnite,
      ID_FORTNITE
    );


    // ========================================================
    // LIBERTYCITY
    // ========================================================

    console.log(
      "━━━━━━━━ LibertyCity ━━━━━━━━"
    );


    const liberty =
      await buscarNoticiasLibertyCity();


    await processarNoticias(
      "GTA",
      liberty,
      ID_GTA
    );


    // ========================================================
    // ROCKSTAR
    // ========================================================

    console.log(
      "━━━━━━━━ Rockstar ━━━━━━━━"
    );


    const rockstar =
      await buscarNoticiasRockstar();


    await processarNoticias(
      "GTA",
      rockstar,
      ID_GTA
    );


    console.log(
      "📰 CICLO FINALIZADO"
    );

  } catch (erro) {

    console.log(
      "❌ Erro geral no ciclo:",
      erro.message
    );

  } finally {

    cicloExecutando = false;
  }
}


// ============================================================
// LOJA
// ============================================================

async function publicarLoja() {

  const hoje =
    new Date().toLocaleDateString(
      "pt-BR",
      {
        timeZone:
          "America/Sao_Paulo"
      }
    );


  if (
    ultimaLoja === hoje
  ) {

    console.log(
      "⏭️ Loja já publicada hoje."
    );

    return;
  }


  try {

    const canal =
      await client.channels.fetch(
        ID_LOJA
      );


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
            "Murilito NEWS • Loja Fortnite"
        })
        .setTimestamp();


    await canal.send({

      content:
        "@everyone 🛒 CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR! 🔥",

      embeds: [
        embed
      ]
    });


    ultimaLoja = hoje;


    console.log(
      "🛒 Loja do Fortnite publicada."
    );

  } catch (erro) {

    console.log(
      "❌ Erro publicando loja:",
      erro.message
    );
  }
}


// ============================================================
// PIADAS
// ============================================================

const piadas = [

  "😂 O cara foi jogar GTA e acabou pagando IPVA.",

  "🤣 Fortnite é grátis. As skins que acabam com o salário.",

  "😂 Meu PC roda GTA RP... só não pergunte a quantos FPS.",

  "🤣 A melhor estratégia no Fortnite é não cair onde todo mundo cai.",

  "😂 Se o GTA tivesse boleto, Los Santos já estava negativado."

];


// ============================================================
// AJUDA
// ============================================================

function mensagemAjuda() {

  return (
    "🤖 **MURILITO NEWS — COMANDOS**\n\n" +

    "🎮 `!teste fortnite` — testa notícia do Fortnite\n" +
    "🚔 `!teste liberty` — testa LibertyCity\n" +
    "🚔 `!teste rockstar` — testa Rockstar\n" +
    "🛒 `!teste loja` — testa a loja\n" +
    "🧪 `!teste` — executa o teste geral\n" +
    "😂 `!piada` — manda uma piada\n" +
    "❓ `!ajuda` — mostra esta mensagem\n\n" +

    "📰 Notícias automáticas a cada 10 minutos.\n" +
    "🛒 Loja automática diariamente às 21:00."
  );
}


// ============================================================
// TESTE FORTNITE
// ============================================================

async function testeFortnite() {

  console.log(
    "🧪 TESTE FORTNITE"
  );


  const noticias =
    await buscarNoticiasFortnite();


  if (
    !noticias ||
    noticias.length === 0
  ) {

    console.log(
      "❌ Nenhuma notícia Fortnite encontrada."
    );

    return;
  }


  const noticia =
    noticias[0];


  console.log(
    "📰 Testando:",
    noticia.title
  );


  console.log(
    "🔗:",
    noticia.link
  );


  await publicarNoticia(
    "FORTNITE",
    noticia
  );
}


// ============================================================
// TESTE LIBERTY
// ============================================================

async function testeLiberty() {

  const noticias =
    await buscarNoticiasLibertyCity();


  if (
    !noticias ||
    noticias.length === 0
  ) {

    console.log(
      "❌ Nenhuma notícia LibertyCity encontrada."
    );

    return;
  }


  await publicarNoticia(
    "GTA",
    noticias[0]
  );
}


// ============================================================
// TESTE ROCKSTAR
// ============================================================

async function testeRockstar() {

  const noticias =
    await buscarNoticiasRockstar();


  if (
    !noticias ||
    noticias.length === 0
  ) {

    console.log(
      "❌ Nenhuma notícia Rockstar encontrada."
    );

    return;
  }


  await publicarNoticia(
    "GTA",
    noticias[0]
  );
}


// ============================================================
// TESTE LOJA
// ============================================================

async function testeLoja() {

  try {

    const canal =
      await client.channels.fetch(
        ID_LOJA
      );


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
            "Murilito NEWS • Loja Fortnite"
        })
        .setTimestamp();


    await canal.send({

      content:
        "@everyone 🛒 CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR! 🔥",

      embeds: [
        embed
      ]
    });


    console.log(
      "🧪 Teste da loja enviado."
    );

  } catch (erro) {

    console.log(
      "❌ Erro no teste da loja:",
      erro.message
    );
  }
}


// ============================================================
// COMANDOS
// ============================================================

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


    try {

      // !ajuda
      if (
        texto === "!ajuda"
      ) {

        await message.reply(
          mensagemAjuda()
        );

        return;
      }


      // !piada
      if (
        texto === "!piada"
      ) {

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


      // !teste loja
      if (
        texto === "!teste loja"
      ) {

        await testeLoja();

        return;
      }


      // !teste fortnite
      if (
        texto === "!teste fortnite"
      ) {

        await testeFortnite();

        return;
      }


      // !teste liberty
      if (
        texto === "!teste liberty"
      ) {

        await testeLiberty();

        return;
      }


      // !teste rockstar
      if (
        texto === "!teste rockstar"
      ) {

        await testeRockstar();

        return;
      }


      // !teste
      if (
        texto === "!teste"
      ) {

        await message.reply(
          "🧪 Teste iniciado! Confira os canais de Fortnite, GTA e Loja."
        );


        await cicloNoticias();

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


// ============================================================
// READY
// ============================================================

client.once(
  "ready",
  async () => {

    console.log("");
    console.log(
      "🤖 " +
      client.user.tag +
      " está ONLINE!"
    );


    console.log(
      "🛒 Canal Loja:",
      ID_LOJA
    );


    console.log(
      "🎮 Canal Fortnite:",
      ID_FORTNITE
    );


    console.log(
      "🚔 Canal GTA:",
      ID_GTA
    );


    console.log("");


    // Primeiro ciclo depois de 15 segundos.
    setTimeout(
      () => {
        cicloNoticias();
      },
      15000
    );


    // Notícias a cada 10 minutos.
    setInterval(
      () => {
        cicloNoticias();
      },
      10 * 60 * 1000
    );


    // Loja diariamente às 21:00.
    setInterval(
      () => {

        const agora =
          new Date().toLocaleString(
            "pt-BR",
            {
              timeZone:
                "America/Sao_Paulo",
              hour12: false
            }
          );


        const partes =
          agora.split(",");


        if (
          partes.length < 2
        ) {
          return;
        }


        const horario =
          partes[1].trim();


        if (
          horario.startsWith("21:00")
        ) {

          publicarLoja();
        }

      },
      30000
    );
  }
);


// ============================================================
// ERROS
// ============================================================

process.on(
  "unhandledRejection",
  erro => {

    console.error(
      "❌ Unhandled Rejection:",
      erro
    );
  }
);


process.on(
  "uncaughtException",
  erro => {

    console.error(
      "❌ Uncaught Exception:",
      erro
    );
  }
);


// ============================================================
// ENCERRAMENTO
// ============================================================

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


// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
