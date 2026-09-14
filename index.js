require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const Parser = require("rss-parser");
const puppeteer = require("puppeteer");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ ERRO: variável TOKEN não encontrada.");
  process.exit(1);
}

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

const FORTNITE_GG =
  "https://fortnite.gg/news";

const FORTNITE_OFICIAL =
  "https://www.fortnite.com/news?lang=pt-BR";

const FORTNITE_OFICIAL_TAG =
  "https://www.fortnite.com/news/tag/all-news?lang=pt-BR";

const LIBERTYCITY =
  "https://pt.libertycity.net/news/";

const ROCKSTAR =
  "https://www.rockstargames.com/br/newswire";

const MAX_NOTICIAS_POR_FONTE = 3;

const TEMPO_MAXIMO_NOTICIA =
  30 * 24 * 60 * 60 * 1000;

/* =========================================================
   ESTADO
========================================================= */

let browser = null;
let cicloExecutando = false;
let ultimaLoja = null;

/* =========================================================
   RSS
========================================================= */

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
  }
});

/* =========================================================
   BROWSER
========================================================= */

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

/* =========================================================
   PÁGINA PUPPETEER
========================================================= */

async function abrirPagina(url) {
  const b = await getBrowser();

  const page = await b.newPage();

  try {
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

    console.log("🌐 Puppeteer abrindo: " + url);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    const status = response
      ? response.status()
      : 0;

    console.log("🌐 Puppeteer status: " + status);

    await new Promise(function(resolve) {
      setTimeout(resolve, 3500);
    });

    return {
      page: page,
      status: status
    };

  } catch (erro) {
    console.error(
      "❌ Erro abrindo " +
      url +
      ": " +
      erro.message
    );

    try {
      await page.close();
    } catch (e) {}

    return null;
  }
}

/* =========================================================
   AXIOS
========================================================= */

async function axiosGet(url, tentativas) {
  tentativas = tentativas || 2;

  for (let i = 1; i <= tentativas; i++) {
    try {
      const resposta = await axios.get(url, {
        timeout: 20000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 Chrome/140 Safari/537.36",
          "Accept-Language":
            "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        validateStatus: function(status) {
          return status >= 200 && status < 600;
        }
      });

      if (
        resposta.status >= 200 &&
        resposta.status < 300
      ) {
        return resposta;
      }

      if (
        resposta.status === 403 ||
        resposta.status === 404
      ) {
        return null;
      }

      if (resposta.status >= 500 && i < tentativas) {
        await new Promise(function(resolve) {
          setTimeout(resolve, 2000);
        });

        continue;
      }

      return null;

    } catch (erro) {
      if (i >= tentativas) {
        console.error(
          "❌ Axios falhou: " +
          url +
          " | " +
          erro.message
        );

        return null;
      }

      await new Promise(function(resolve) {
        setTimeout(resolve, 2000);
      });
    }
  }

  return null;
}

/* =========================================================
   LIMPEZA DE TEXTO
========================================================= */

function limparTexto(texto) {
  if (!texto) {
    return "";
  }

  return String(texto)
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

/* =========================================================
   DATA
========================================================= */

function converterData(valor) {
  if (!valor) {
    return null;
  }

  const data = new Date(valor);

  if (isNaN(data.getTime())) {
    return null;
  }

  return data;
}

function noticiaRecente(data) {
  if (!data) {
    return true;
  }

  const agora = Date.now();
  const tempo = data.getTime();

  if (tempo > agora + 24 * 60 * 60 * 1000) {
    return true;
  }

  return agora - tempo <= TEMPO_MAXIMO_NOTICIA;
}

/* =========================================================
   IMAGEM
========================================================= */

function imagemValida(url) {
  if (!url) {
    return false;
  }

  if (
    !url.startsWith("http://") &&
    !url.startsWith("https://")
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   DUPLICADAS
========================================================= */

async function noticiaJaPublicada(canal, noticia) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100
    });

    const url = noticia.url
      ? noticia.url.toLowerCase()
      : "";

    const titulo = noticia.title
      ? noticia.title.toLowerCase()
      : "";

    for (const mensagem of mensagens.values()) {
      if (
        url &&
        mensagem.embeds &&
        mensagem.embeds.length > 0
      ) {
        const embed = mensagem.embeds[0];

        if (
          embed.url &&
          embed.url.toLowerCase() === url
        ) {
          return true;
        }
      }

      if (
        titulo &&
        mensagem.embeds &&
        mensagem.embeds.length > 0
      ) {
        const embed = mensagem.embeds[0];

        if (
          embed.title &&
          embed.title.toLowerCase() === titulo
        ) {
          return true;
        }
      }
    }

    return false;

  } catch (erro) {
    console.error(
      "❌ Erro verificando duplicada: " +
      erro.message
    );

    return false;
  }
}

/* =========================================================
   DESCRIÇÃO
========================================================= */

function criarDescricao(noticia, tipo) {
  let descricao = limparTexto(
    noticia.description ||
    noticia.summary ||
    noticia.excerpt ||
    ""
  );

  if (descricao.length > 900) {
    descricao = descricao.substring(0, 897) + "...";
  }

  if (!descricao) {
    if (tipo === "fortnite") {
      descricao =
        "🎮 Confira todos os detalhes desta novidade do Fortnite.";
    } else {
      descricao =
        "🚔 Confira todos os detalhes desta novidade do GTA.";
    }
  }

  descricao +=
    "\n\n👇 Clique no título acima para ler a matéria completa.";

  return descricao;
}

/* =========================================================
   PUBLICAÇÃO
========================================================= */

async function publicarNoticia(tipo, noticia) {
  let canalId = ID_GTA;

  if (tipo === "fortnite") {
    canalId = ID_FORTNITE;
  }

  const canal = await client.channels.fetch(canalId);

  if (!canal) {
    console.error(
      "❌ Canal não encontrado: " +
      canalId
    );

    return false;
  }

  if (!noticia.url || !noticia.title) {
    return false;
  }

  if (
    noticia.data &&
    !noticiaRecente(noticia.data)
  ) {
    console.log(
      "⏭️ " +
      tipo.toUpperCase() +
      ": notícia antiga ignorada: " +
      noticia.title
    );

    return false;
  }

  const duplicada =
    await noticiaJaPublicada(canal, noticia);

  if (duplicada) {
    console.log(
      "⏭️ " +
      tipo.toUpperCase() +
      ": já publicada: " +
      noticia.title
    );

    return false;
  }

  let tituloEmbed = "";
  let mensagem = "";
  let footer = "";

  if (tipo === "fortnite") {
    tituloEmbed =
      "🎮 " + noticia.title;

    mensagem =
      "@everyone 🎮 NOVIDADE DO FORTNITE! 🔥";

    footer =
      "Murilito NEWS • Fortnite";
  } else {
    tituloEmbed =
      "🚔 " + noticia.title;

    mensagem =
      "@everyone 🚔 NOVIDADE DO GTA! 🔥";

    footer =
      "Murilito NEWS • GTA";
  }

  const embed = new EmbedBuilder()
    .setTitle(tituloEmbed)
    .setURL(noticia.url)
    .setDescription(
      criarDescricao(noticia, tipo)
    )
    .setFooter({
      text: footer
    })
    .setTimestamp();

  if (imagemValida(noticia.image)) {
    embed.setImage(noticia.image);
  }

  try {
    await canal.send({
      content: mensagem,
      embeds: [embed]
    });

    console.log(
      "📢 " +
      tipo.toUpperCase() +
      ": notícia publicada: " +
      noticia.title
    );

    return true;

  } catch (erro) {
    console.error(
      "⚠️ Erro publicando com imagem: " +
      erro.message
    );

    try {
      const embedSemImagem = new EmbedBuilder()
        .setTitle(tituloEmbed)
        .setURL(noticia.url)
        .setDescription(
          criarDescricao(noticia, tipo)
        )
        .setFooter({
          text: footer
        })
        .setTimestamp();

      await canal.send({
        content: mensagem,
        embeds: [embedSemImagem]
      });

      console.log(
        "📢 " +
        tipo.toUpperCase() +
        ": publicada sem imagem: " +
        noticia.title
      );

      return true;

    } catch (erro2) {
      console.error(
        "❌ Falha definitiva publicando: " +
        erro2.message
      );

      return false;
    }
  }
}

/* =========================================================
   FORTNITE.GG
========================================================= */

async function buscarFortniteGG() {
  console.log(
    "🔎 Fortnite: tentando Fortnite.GG via navegador..."
  );

  const resultado =
    await abrirPagina(FORTNITE_GG);

  if (!resultado) {
    return [];
  }

  const page = resultado.page;

  try {
    await page.evaluate(function() {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await new Promise(function(resolve) {
      setTimeout(resolve, 2500);
    });

    const noticias = await page.evaluate(function() {
      const encontrados = [];
      const links = Array.from(
        document.querySelectorAll("a[href]")
      );

      for (const a of links) {
        const href = a.href || "";

        if (!href) {
          continue;
        }

        let urlObj;

        try {
          urlObj = new URL(href);
        } catch (e) {
          continue;
        }

        const path = urlObj.pathname.toLowerCase();

        if (!path.includes("/news/")) {
          continue;
        }

        if (
          path === "/news/" ||
          path === "/news"
        ) {
          continue;
        }

        if (
          path.includes("/tag/") ||
          path.includes("/category/") ||
          path.includes("/page/")
        ) {
          continue;
        }

        let titulo = "";

        const heading = a.querySelector(
          "h1, h2, h3, h4, h5, strong"
        );

        if (heading) {
          titulo = heading.innerText || "";
        }

        if (!titulo) {
          titulo = a.innerText || "";
        }

        titulo = titulo
          .replace(/\s+/g, " ")
          .trim();

        if (
          !titulo ||
          titulo.length < 10
        ) {
          const pai =
            a.closest(
              "article, li, div"
            );

          if (pai) {
            const h =
              pai.querySelector(
                "h1, h2, h3, h4, h5"
              );

            if (h) {
              titulo =
                h.innerText
                  .replace(/\s+/g, " ")
                  .trim();
            }
          }
        }

        if (
          !titulo ||
          titulo.length < 10
        ) {
          continue;
        }

        let descricao = "";

        const pai =
          a.closest(
            "article, li, div"
          );

        if (pai) {
          const p =
            pai.querySelector(
              "p"
            );

          if (p) {
            descricao =
              p.innerText || "";
          }
        }

        let image = "";

        if (pai) {
          const img =
            pai.querySelector(
              "img"
            );

          if (img) {
            image =
              img.currentSrc ||
              img.src ||
              img.getAttribute("data-src") ||
              img.getAttribute("data-lazy-src") ||
              "";
          }
        }

        encontrados.push({
          title: titulo,
          url: href,
          description: descricao,
          image: image
        });
      }

      const unicos = [];
      const urls = new Set();

      for (const item of encontrados) {
        if (!urls.has(item.url)) {
          urls.add(item.url);
          unicos.push(item);
        }
      }

      return unicos.slice(0, 20);
    });

    console.log(
      "🔎 Fortnite.GG: " +
      noticias.length +
      " candidatos."
    );

    return noticias;

  } catch (erro) {
    console.error(
      "❌ Erro Fortnite.GG: " +
      erro.message
    );

    return [];

  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
}

/* =========================================================
   FORTNITE OFICIAL
========================================================= */

async function buscarFortniteOficial(url) {
  console.log(
    "🌐 Tentando Fortnite oficial: " +
    url
  );

  const resultado =
    await abrirPagina(url);

  if (!resultado) {
    return [];
  }

  const page = resultado.page;

  if (
    resultado.status < 200 ||
    resultado.status >= 300
  ) {
    try {
      await page.close();
    } catch (e) {}

    return [];
  }

  try {
    const noticias = await page.evaluate(function() {
      const encontrados = [];

      const links =
        Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        );

      for (const a of links) {
        const href = a.href || "";

        if (
          !href.includes(
            "fortnite.com/news"
          )
        ) {
          continue;
        }

        const texto =
          (a.innerText || "")
            .replace(/\s+/g, " ")
            .trim();

        if (
          !texto ||
          texto.length < 10
        ) {
          continue;
        }

        let image = "";

        const pai =
          a.closest(
            "article, li, div"
          );

        if (pai) {
          const img =
            pai.querySelector(
              "img"
            );

          if (img) {
            image =
              img.currentSrc ||
              img.src ||
              img.getAttribute("data-src") ||
              "";
          }
        }

        let description = "";

        if (pai) {
          const p =
            pai.querySelector(
              "p"
            );

          if (p) {
            description =
              p.innerText || "";
          }
        }

        encontrados.push({
          title: texto,
          url: href,
          description: description,
          image: image
        });
      }

      const unicos = [];
      const urls = new Set();

      for (const item of encontrados) {
        if (!urls.has(item.url)) {
          urls.add(item.url);
          unicos.push(item);
        }
      }

      return unicos.slice(0, 20);
    });

    console.log(
      "🔎 Fortnite oficial: " +
      noticias.length +
      " candidatos."
    );

    return noticias;

  } catch (erro) {
    console.error(
      "❌ Erro Fortnite oficial: " +
      erro.message
    );

    return [];

  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
}

/* =========================================================
   FORTNITE
========================================================= */

async function buscarFortnite() {
  let noticias =
    await buscarFortniteGG();

  if (noticias.length > 0) {
    return noticias;
  }

  console.log(
    "↩️ Fortnite.GG falhou. Tentando oficial..."
  );

  noticias =
    await buscarFortniteOficial(
      FORTNITE_OFICIAL
    );

  if (noticias.length > 0) {
    return noticias;
  }

  noticias =
    await buscarFortniteOficial(
      FORTNITE_OFICIAL_TAG
    );

  if (noticias.length > 0) {
    return noticias;
  }

  console.log(
    "❌ Fortnite: nenhuma fonte confiável disponível."
  );

  return [];
}

/* =========================================================
   LIBERTYCITY
========================================================= */

async function buscarLibertyCity() {
  console.log(
    "🔎 LibertyCity: tentando navegador..."
  );

  const resultado =
    await abrirPagina(
      LIBERTYCITY
    );

  if (!resultado) {
    return [];
  }

  const page = resultado.page;

  try {
    const noticias =
      await page.evaluate(function() {
        const encontrados = [];

        const links =
          Array.from(
            document.querySelectorAll(
              "a[href]"
            )
          );

        for (const a of links) {
          const href =
            a.href || "";

          if (
            !href.endsWith(".html")
          ) {
            continue;
          }

          const titulo =
            (a.innerText || "")
              .replace(/\s+/g, " ")
              .trim();

          if (
            !titulo ||
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

          const tituloLower =
            titulo.toLowerCase();

          const relevante =
            tituloLower.includes("gta") ||
            tituloLower.includes(
              "grand theft auto"
            ) ||
            tituloLower.includes(
              "vice city"
            ) ||
            tituloLower.includes(
              "los santos"
            ) ||
            tituloLower.includes(
              "rockstar"
            );

          if (!relevante) {
            continue;
          }

          const pai =
            a.closest(
              "article, li, div"
            );

          let description = "";
          let image = "";

          if (pai) {
            const p =
              pai.querySelector(
                "p"
              );

            if (p) {
              description =
                p.innerText || "";
            }

            const img =
              pai.querySelector(
                "img"
              );

            if (img) {
              image =
                img.currentSrc ||
                img.src ||
                img.getAttribute(
                  "data-src"
                ) ||
                img.getAttribute(
                  "data-lazy-src"
                ) ||
                "";
            }
          }

          encontrados.push({
            title: titulo,
            url: href,
            description: description,
            image: image
          });
        }

        const unicos = [];
        const urls = new Set();

        for (const item of encontrados) {
          if (!urls.has(item.url)) {
            urls.add(item.url);
            unicos.push(item);
          }
        }

        return unicos.slice(0, 20);
      });

    console.log(
      "🔎 LibertyCity Puppeteer: " +
      noticias.length +
      " candidatos."
    );

    return noticias;

  } catch (erro) {
    console.error(
      "❌ Erro LibertyCity: " +
      erro.message
    );

    return [];

  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
}

/* =========================================================
   ROCKSTAR - IMAGEM DO CARD
========================================================= */

async function extrairCardRockstar(anchor) {
  return await anchor.evaluate(function(el) {
    function pegarImagem(container) {
      if (!container) {
        return "";
      }

      const imagens =
        Array.from(
          container.querySelectorAll(
            "img"
          )
        );

      for (const img of imagens) {
        const src =
          img.currentSrc ||
          img.src ||
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original") ||
          img.getAttribute("data-image");

        if (src) {
          return src;
        }

        const srcset =
          img.getAttribute(
            "srcset"
          ) ||
          img.getAttribute(
            "data-srcset"
          );

        if (srcset) {
          const partes =
            srcset.split(",");

          if (partes.length > 0) {
            const ultimo =
              partes[
                partes.length - 1
              ]
                .trim()
                .split(" ")[0];

            if (ultimo) {
              return ultimo;
            }
          }
        }
      }

      const sources =
        Array.from(
          container.querySelectorAll(
            "source"
          )
        );

      for (const source of sources) {
        const srcset =
          source.getAttribute(
            "srcset"
          );

        if (srcset) {
          const partes =
            srcset.split(",");

          if (partes.length > 0) {
            const ultimo =
              partes[
                partes.length - 1
              ]
                .trim()
                .split(" ")[0];

            if (ultimo) {
              return ultimo;
            }
          }
        }
      }

      const elementos =
        Array.from(
          container.querySelectorAll(
            "*"
          )
        );

      for (const item of elementos) {
        try {
          const estilo =
            window.getComputedStyle(
              item
            );

          const fundo =
            estilo.backgroundImage;

          if (
            fundo &&
            fundo !== "none"
          ) {
            const match =
              fundo.match(
                /url\\(["']?(.*?)["']?\\)/
              );

            if (
              match &&
              match[1]
            ) {
              return match[1];
            }
          }
        } catch (e) {}
      }

      return "";
    }

    let container = el;

    for (
      let i = 0;
      i < 6;
      i++
    ) {
      if (!container) {
        break;
      }

      const imagem =
        pegarImagem(
          container
        );

      if (imagem) {
        return imagem;
      }

      container =
        container.parentElement;
    }

    return "";
  });
}

/* =========================================================
   ROCKSTAR
========================================================= */

async function buscarRockstar() {
  console.log(
    "🔎 Rockstar: abrindo Newswire..."
  );

  const resultado =
    await abrirPagina(
      ROCKSTAR
    );

  if (!resultado) {
    return [];
  }

  const page = resultado.page;

  try {
    await page.evaluate(function() {
      window.scrollTo(
        0,
        document.body.scrollHeight
      );
    });

    await new Promise(function(resolve) {
      setTimeout(resolve, 2500);
    });

    const anchors =
      await page.$$(
        'a[href*="/br/newswire/article/"]'
      );

    console.log(
      "🔎 Rockstar: " +
      anchors.length +
      " artigos encontrados."
    );

    const noticias = [];

    for (
      const anchor of anchors
    ) {
      try {
        const dados =
          await anchor.evaluate(
            function(el) {
              let titulo =
                el.innerText || "";

              titulo =
                titulo
                  .replace(/\s+/g, " ")
                  .trim();

              const heading =
                el.querySelector(
                  "h1, h2, h3, h4, h5, h6"
                );

              if (
                heading &&
                heading.innerText
              ) {
                titulo =
                  heading.innerText
                    .replace(
                      /\s+/g,
                      " "
                    )
                    .trim();
              }

              let description = "";

              const pai =
                el.closest(
                  "article, li, div"
                );

              if (pai) {
                const p =
                  pai.querySelector(
                    "p"
                  );

                if (p) {
                  description =
                    p.innerText || "";
                }
              }

              return {
                title: titulo,
                url: el.href,
                description:
                  description
              };
            }
          );

        if (
          !dados.title ||
          dados.title.length < 10
        ) {
          continue;
        }

        const tituloLower =
          dados.title.toLowerCase();

        const relevante =
          tituloLower.includes("gta") ||
          tituloLower.includes(
            "grand theft auto"
          ) ||
          tituloLower.includes(
            "los santos"
          ) ||
          tituloLower.includes(
            "vice city"
          );

        if (!relevante) {
          continue;
        }

        const imagem =
          await extrairCardRockstar(
            anchor
          );

        dados.image =
          imagem || "";

        if (!dados.image) {
          console.log(
            "🖼️ SEM imagem | " +
            dados.title
          );
        } else {
          console.log(
            "🖼️ GTA: imagem encontrada no card."
          );
        }

        noticias.push(
          dados
        );

        if (
          noticias.length >= 20
        ) {
          break;
        }

      } catch (erro) {
        console.error(
          "⚠️ Erro processando card Rockstar: " +
          erro.message
        );
      }
    }

    return noticias;

  } catch (erro) {
    console.error(
      "❌ Erro Rockstar: " +
      erro.message
    );

    return [];

  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
}

/* =========================================================
   METADADOS DE MATÉRIA
========================================================= */

async function buscarMetadados(url) {
  console.log(
    "📝 Buscando metadados: " +
    url
  );

  const resultado =
    await abrirPagina(url);

  if (!resultado) {
    return null;
  }

  const page =
    resultado.page;

  try {
    const dados =
      await page.evaluate(function() {
        function meta(nome) {
          const el =
            document.querySelector(
              'meta[property="' +
              nome +
              '"], meta[name="' +
              nome +
              '"]'
            );

          return el
            ? el.getAttribute("content") || ""
            : "";
        }

        const titulo =
          meta("og:title") ||
          meta("twitter:title") ||
          (
            document.querySelector(
              "h1"
            ) || {}
          ).innerText ||
          document.title ||
          "";

        const description =
          meta("og:description") ||
          meta("description") ||
          "";

        const image =
          meta("og:image") ||
          meta("twitter:image") ||
          "";

        return {
          title: titulo
            .replace(/\s+/g, " ")
            .trim(),
          description:
            description
              .replace(/\s+/g, " ")
              .trim(),
          image: image
        };
      });

    return dados;

  } catch (erro) {
    console.error(
      "❌ Erro lendo metadados: " +
      erro.message
    );

    return null;

  } finally {
    try {
      await page.close();
    } catch (e) {}
  }
}

/* =========================================================
   PROCESSAR FONTE
========================================================= */

async function processarNoticias(
  tipo,
  buscarFuncao
) {
  let noticias = [];

  try {
    noticias =
      await buscarFuncao();
  } catch (erro) {
    console.error(
      "❌ Erro buscando " +
      tipo +
      ": " +
      erro.message
    );

    return 0;
  }

  if (!noticias.length) {
    console.log(
      "📊 " +
      tipo.toUpperCase() +
      ": 0 notícia(s) encontrada(s)."
    );

    return 0;
  }

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
      !noticia.title ||
      !noticia.url
    ) {
      continue;
    }

    const sucesso =
      await publicarNoticia(
        tipo,
        noticia
      );

    if (sucesso) {
      publicadas++;

      await new Promise(function(resolve) {
        setTimeout(resolve, 1500);
      });
    }
  }

  console.log(
    "📊 " +
    tipo.toUpperCase() +
    ": " +
    publicadas +
    " notícia(s) nova(s) publicada(s)."
  );

  return publicadas;
}

/* =========================================================
   CICLO DE NOTÍCIAS
========================================================= */

async function cicloNoticias() {
  if (cicloExecutando) {
    console.log(
      "⏳ Ciclo já está em andamento. Ignorando nova chamada."
    );

    return;
  }

  cicloExecutando = true;

  try {
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

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );

    await processarNoticias(
      "fortnite",
      buscarFortnite
    );

    console.log(
      "━━━━━━━━ LibertyCity ━━━━━━━━"
    );

    await processarNoticias(
      "gta",
      buscarLibertyCity
    );

    console.log(
      "━━━━━━━━ Rockstar ━━━━━━━━"
    );

    await processarNoticias(
      "gta",
      buscarRockstar
    );

    console.log(
      "========================================"
    );

    console.log(
      "✅ CICLO DE NOTÍCIAS FINALIZADO"
    );

    console.log(
      "========================================"
    );

  } catch (erro) {
    console.error(
      "❌ Erro geral no ciclo: " +
      erro.message
    );

  } finally {
    cicloExecutando = false;
  }
}

/* =========================================================
   LOJA DO FORTNITE
========================================================= */

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {
      console.error(
        "❌ Canal da loja não encontrado."
      );

      return;
    }

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
    console.error(
      "❌ Erro publicando loja: " +
      erro.message
    );
  }
}

/* =========================================================
   COMANDOS
========================================================= */

client.on(
  "messageCreate",
  async function(message) {
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
      texto === "!teste"
    ) {
      await message.reply(
        "📰 Iniciando teste de todas as fontes..."
      );

      await cicloNoticias();

      return;
    }

    if (
      texto ===
      "!teste fortnite"
    ) {
      await message.reply(
        "🎮 Testando notícias do Fortnite..."
      );

      await processarNoticias(
        "fortnite",
        buscarFortnite
      );

      return;
    }

    if (
      texto ===
      "!teste liberty"
    ) {
      await message.reply(
        "🚔 Testando LibertyCity..."
      );

      await processarNoticias(
        "gta",
        buscarLibertyCity
      );

      return;
    }

    if (
      texto ===
      "!teste rockstar"
    ) {
      await message.reply(
        "🚔 Testando Rockstar Newswire..."
      );

      await processarNoticias(
        "gta",
        buscarRockstar
      );

      return;
    }

    if (
      texto ===
      "!teste loja"
    ) {
      await message.reply(
        "🛒 Publicando teste da loja..."
      );

      ultimaLoja = null;

      await publicarLoja();

      return;
    }

    if (
      texto === "!piada"
    ) {
      const piadas = [
        "😂 O cara foi jogar GTA e voltou com 5 estrelas. A esposa perguntou: amor, onde você estava? Ele: trabalhando.",
        "🤣 Fortnite é igual boleto: você acha que acabou, mas sempre vem outra temporada.",
        "😂 Meu PC roda GTA RP tão bem que até o Windows pede férias.",
        "🤣 O problema não é morrer no Fortnite. É morrer e ver o cara dançando em cima do seu loot."
      ];

      const indice =
        Math.floor(
          Math.random() *
          piadas.length
        );

      await message.reply(
        piadas[indice]
      );

      return;
    }

    if (
      texto === "!ajuda"
    ) {
      await message.reply(
        "🤖 **Comandos do Murilito NEWS**\n\n" +
        "`!teste` — Testa todas as notícias\n" +
        "`!teste fortnite` — Testa Fortnite\n" +
        "`!teste liberty` — Testa LibertyCity\n" +
        "`!teste rockstar` — Testa Rockstar\n" +
        "`!teste loja` — Testa a loja Fortnite\n" +
        "`!piada` — Manda uma piada 😂\n" +
        "`!ajuda` — Mostra esta mensagem"
      );

      return;
    }
  }
);

/* =========================================================
   BOT ONLINE
========================================================= */

client.once(
  "ready",
  async function() {
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

    /*
      Primeiro ciclo alguns segundos
      depois que o bot entrar.
    */

    setTimeout(
      function() {
        cicloNoticias();
      },
      15000
    );

    /*
      Notícias a cada 10 minutos.
    */

    setInterval(
      function() {
        cicloNoticias();
      },
      10 * 60 * 1000
    );

    /*
      Verificação da loja a cada minuto.
      Publica automaticamente às 21:00.
    */

    setInterval(
      function() {
        const agora =
          new Date();

        const partes =
          new Intl.DateTimeFormat(
            "pt-BR",
            {
              timeZone:
                "America/Sao_Paulo",
              hour:
                "2-digit",
              minute:
                "2-digit",
              hour12: false
            }
          )
            .formatToParts(
              agora
            );

        let hora = "";
        let minuto = "";

        for (
          const parte of partes
        ) {
          if (
            parte.type === "hour"
          ) {
            hora =
              parte.value;
          }

          if (
            parte.type === "minute"
          ) {
            minuto =
              parte.value;
          }
        }

        if (
          hora === "21" &&
          minuto === "00"
        ) {
          publicarLoja();
        }
      },
      60 * 1000
    );
  }
);

/* =========================================================
   ENCERRAMENTO LIMPO
========================================================= */

async function encerrar() {
  console.log(
    "🛑 Encerrando Murilito NEWS..."
  );

  try {
    if (browser) {
      await browser.close();
      browser = null;
    }
  } catch (erro) {
    console.error(
      "⚠️ Erro fechando Puppeteer: " +
      erro.message
    );
  }

  try {
    client.destroy();
  } catch (erro) {}

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

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN);
