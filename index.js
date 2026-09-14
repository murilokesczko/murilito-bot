require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const axios = require("axios");
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
  console.error("❌ ERRO: TOKEN não encontrado.");
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

const FORTNITE_NEWS =
  "https://www.fortnite.com/news";

const LIBERTYCITY =
  "https://pt.libertycity.net/news/";

const ROCKSTAR =
  "https://www.rockstargames.com/br/newswire";

const MAX_NOTICIAS_POR_FONTE = 3;

const MAX_IDADE_NOTICIA =
  30 * 24 * 60 * 60 * 1000;

/* =========================================================
   ESTADO
========================================================= */

let browser = null;
let cicloExecutando = false;
let ultimaLoja = null;

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
   PÁGINA
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

    console.log(
      "🌐 Puppeteer abrindo: " + url
    );

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    const status = response
      ? response.status()
      : 0;

    console.log(
      "🌐 Puppeteer status: " + status
    );

    await new Promise(function(resolve) {
      setTimeout(resolve, 3000);
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
   TEXTO
========================================================= */

function limparTexto(texto) {
  if (!texto) {
    return "";
  }

  return String(texto)
    .replace(/\s+/g, " ")
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

  if (tempo > agora + 86400000) {
    return true;
  }

  return (
    agora - tempo <=
    MAX_IDADE_NOTICIA
  );
}

/* =========================================================
   IMAGEM
========================================================= */

function imagemValida(url) {
  if (!url) {
    return false;
  }

  return (
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
}

/* =========================================================
   DUPLICADAS
========================================================= */

async function noticiaJaPublicada(
  canal,
  noticia
) {
  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 100
      });

    const url =
      noticia.url
        ? noticia.url.toLowerCase()
        : "";

    const titulo =
      noticia.title
        ? noticia.title.toLowerCase()
        : "";

    for (
      const mensagem of mensagens.values()
    ) {
      if (
        !mensagem.embeds ||
        mensagem.embeds.length === 0
      ) {
        continue;
      }

      const embed =
        mensagem.embeds[0];

      if (
        url &&
        embed.url &&
        embed.url.toLowerCase() === url
      ) {
        return true;
      }

      if (
        titulo &&
        embed.title &&
        embed.title
          .toLowerCase()
          .replace(/^🎮 /, "")
          .replace(/^🚔 /, "") === titulo
      ) {
        return true;
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

function criarDescricao(
  noticia,
  tipo
) {
  let descricao =
    limparTexto(
      noticia.description ||
      noticia.summary ||
      noticia.excerpt ||
      ""
    );

  if (descricao.length > 900) {
    descricao =
      descricao.substring(0, 897) +
      "...";
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
   PUBLICAR NOTÍCIA
========================================================= */

async function publicarNoticia(
  tipo,
  noticia
) {
  let canalId = ID_GTA;

  if (tipo === "fortnite") {
    canalId = ID_FORTNITE;
  }

  const canal =
    await client.channels.fetch(
      canalId
    );

  if (!canal) {
    return false;
  }

  if (
    !noticia.title ||
    !noticia.url
  ) {
    return false;
  }

  if (
    noticia.data &&
    !noticiaRecente(
      noticia.data
    )
  ) {
    console.log(
      "⏭️ " +
      tipo.toUpperCase() +
      ": notícia antiga ignorada: " +
      noticia.title
    );

    return false;
  }

  if (
    await noticiaJaPublicada(
      canal,
      noticia
    )
  ) {
    console.log(
      "⏭️ " +
      tipo.toUpperCase() +
      ": já publicada: " +
      noticia.title
    );

    return false;
  }

  let tituloEmbed;
  let mensagem;
  let footer;

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

  const embed =
    new EmbedBuilder()
      .setTitle(tituloEmbed)
      .setURL(noticia.url)
      .setDescription(
        criarDescricao(
          noticia,
          tipo
        )
      )
      .setFooter({
        text: footer
      })
      .setTimestamp();

  if (
    imagemValida(
      noticia.image
    )
  ) {
    embed.setImage(
      noticia.image
    );
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
      "⚠️ Imagem falhou. Tentando sem imagem..."
    );

    try {
      const embedSemImagem =
        new EmbedBuilder()
          .setTitle(tituloEmbed)
          .setURL(noticia.url)
          .setDescription(
            criarDescricao(
              noticia,
              tipo
            )
          )
          .setFooter({
            text: footer
          })
          .setTimestamp();

      await canal.send({
        content: mensagem,
        embeds: [
          embedSemImagem
        ]
      });

      console.log(
        "📢 Publicada sem imagem: " +
        noticia.title
      );

      return true;

    } catch (erro2) {
      console.error(
        "❌ Falha ao publicar: " +
        erro2.message
      );

      return false;
    }
  }
}

/* =========================================================
   FORTNITE OFICIAL
   Estratégia:
   1. Axios
   2. HTML da página oficial
   3. Extrai os cards
========================================================= */

async function buscarFortniteOficial() {
  console.log(
    "🔎 Fortnite: acessando página oficial..."
  );

  let resposta;

  try {
    resposta =
      await axios.get(
        FORTNITE_NEWS,
        {
          timeout: 30000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
              "AppleWebKit/537.36 (KHTML, like Gecko) " +
              "Chrome/140.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language":
              "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control":
              "no-cache"
          },
          validateStatus: function(status) {
            return status >= 200 &&
              status < 500;
          }
        }
      );

    console.log(
      "🌐 Fortnite oficial Axios status: " +
      resposta.status
    );

  } catch (erro) {
    console.error(
      "❌ Axios Fortnite falhou: " +
      erro.message
    );

    return [];
  }

  if (
    resposta.status !== 200
  ) {
    console.log(
      "❌ Fortnite oficial bloqueou Axios."
    );

    return [];
  }

  const html =
    resposta.data;

  const $ =
    require("cheerio").load(
      html
    );

  const noticias = [];
  const urls = new Set();

  /*
    Procuramos TODOS os links da página
    que levam para /news/.
  */

  $("a[href]").each(
    function() {
      const a = $(this);

      let url =
        a.attr("href") || "";

      if (!url) {
        return;
      }

      if (
        url.startsWith("/")
      ) {
        url =
          "https://www.fortnite.com" +
          url;
      }

      if (
        !url.includes(
          "fortnite.com/news/"
        )
      ) {
        return;
      }

      /*
        Ignora a própria página /news/
      */

      if (
        url ===
          "https://www.fortnite.com/news/" ||
        url ===
          "https://www.fortnite.com/news"
      ) {
        return;
      }

      if (
        urls.has(url)
      ) {
        return;
      }

      /*
        Procura título no próprio link
        ou nos elementos próximos.
      */

      let titulo =
        limparTexto(
          a.text()
        );

      if (
        !titulo ||
        titulo.length < 10
      ) {
        titulo =
          limparTexto(
            a.find(
              "h1,h2,h3,h4,h5,h6"
            ).first().text()
          );
      }

      if (
        !titulo ||
        titulo.length < 10
      ) {
        const pai =
          a.closest(
            "article,li,div"
          );

        titulo =
          limparTexto(
            pai.find(
              "h1,h2,h3,h4,h5,h6"
            ).first().text()
          );
      }

      if (
        !titulo ||
        titulo.length < 10
      ) {
        return;
      }

      /*
        Descrição
      */

      let descricao = "";

      const pai =
        a.closest(
          "article,li,div"
        );

      if (pai.length) {
        descricao =
          limparTexto(
            pai.find(
              "p"
            ).first().text()
          );
      }

      /*
        Imagem
      */

      let image = "";

      if (pai.length) {
        const img =
          pai.find(
            "img"
          ).first();

        if (img.length) {
          image =
            img.attr(
              "src"
            ) ||
            img.attr(
              "data-src"
            ) ||
            img.attr(
              "data-lazy-src"
            ) ||
            img.attr(
              "data-original"
            ) ||
            "";
        }
      }

      /*
        Data
      */

      let data = null;

      if (pai.length) {
        const time =
          pai.find(
            "time"
          ).first();

        if (time.length) {
          data =
            converterData(
              time.attr(
                "datetime"
              ) ||
              time.text()
            );
        }

        if (!data) {
          const textoPai =
            pai.text();

          const match =
            textoPai.match(
              /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}/i
            );

          if (match) {
            data =
              converterData(
                match[0]
              );
          }
        }
      }

      urls.add(url);

      noticias.push({
        title: titulo,
        url: url,
        description: descricao,
        image: image,
        data: data
      });
    }
  );

  console.log(
    "🔎 Fortnite oficial: " +
    noticias.length +
    " candidatos encontrados."
  );

  return noticias.slice(
    0,
    20
  );
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

  const page =
    resultado.page;

  try {
    const noticias =
      await page.evaluate(
        function() {
          const encontrados =
            [];

          const links =
            Array.from(
              document.querySelectorAll(
                "a[href]"
              )
            );

          for (
            const a of links
          ) {
            const href =
              a.href || "";

            if (
              !href.endsWith(
                ".html"
              )
            ) {
              continue;
            }

            const titulo =
              (a.innerText || "")
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();

            if (
              !titulo ||
              titulo.length < 15
            ) {
              continue;
            }

            if (
              titulo ===
                "Notícias" ||
              /^\d+$/.test(
                titulo
              )
            ) {
              continue;
            }

            const lower =
              titulo.toLowerCase();

            const relevante =
              lower.includes("gta") ||
              lower.includes(
                "grand theft auto"
              ) ||
              lower.includes(
                "vice city"
              ) ||
              lower.includes(
                "los santos"
              ) ||
              lower.includes(
                "rockstar"
              );

            if (!relevante) {
              continue;
            }

            const pai =
              a.closest(
                "article,li,div"
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
                  "";
              }
            }

            encontrados.push({
              title: titulo,
              url: href,
              description:
                description,
              image: image
            });
          }

          const unicos = [];
          const urls =
            new Set();

          for (
            const item of encontrados
          ) {
            if (
              !urls.has(
                item.url
              )
            ) {
              urls.add(
                item.url
              );

              unicos.push(
                item
              );
            }
          }

          return unicos.slice(
            0,
            20
          );
        }
      );

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
   ROCKSTAR CARD
========================================================= */

async function extrairCardRockstar(
  anchor
) {
  return await anchor.evaluate(
    function(el) {
      function pegarImagem(
        container
      ) {
        if (!container) {
          return "";
        }

        const imagens =
          Array.from(
            container.querySelectorAll(
              "img"
            )
          );

        for (
          const img of imagens
        ) {
          const src =
            img.currentSrc ||
            img.src ||
            img.getAttribute(
              "src"
            ) ||
            img.getAttribute(
              "data-src"
            ) ||
            img.getAttribute(
              "data-lazy-src"
            ) ||
            img.getAttribute(
              "data-original"
            ) ||
            img.getAttribute(
              "data-image"
            );

          if (src) {
            return src;
          }
        }

        const sources =
          Array.from(
            container.querySelectorAll(
              "source"
            )
          );

        for (
          const source of sources
        ) {
          const srcset =
            source.getAttribute(
              "srcset"
            );

          if (srcset) {
            const partes =
              srcset.split(",");

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
    }
  );
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

  const page =
    resultado.page;

  try {
    await page.evaluate(
      function() {
        window.scrollTo(
          0,
          document.body.scrollHeight
        );
      }
    );

    await new Promise(
      function(resolve) {
        setTimeout(
          resolve,
          2500
        );
      }
    );

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
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim();

              const heading =
                el.querySelector(
                  "h1,h2,h3,h4,h5,h6"
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
                  "article,li,div"
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

        const lower =
          dados.title.toLowerCase();

        const relevante =
          lower.includes("gta") ||
          lower.includes(
            "grand theft auto"
          ) ||
          lower.includes(
            "los santos"
          ) ||
          lower.includes(
            "vice city"
          );

        if (!relevante) {
          continue;
        }

        dados.image =
          await extrairCardRockstar(
            anchor
          );

        if (!dados.image) {
          console.log(
            "🖼️ SEM imagem | " +
            dados.title
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
          "⚠️ Erro no card Rockstar: " +
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
   PROCESSAR
========================================================= */

async function processarNoticias(
  tipo,
  funcaoBusca
) {
  let noticias = [];

  try {
    noticias =
      await funcaoBusca();
  } catch (erro) {
    console.error(
      "❌ Erro buscando " +
      tipo +
      ": " +
      erro.message
    );

    return 0;
  }

  if (
    !noticias ||
    noticias.length === 0
  ) {
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

      await new Promise(
        function(resolve) {
          setTimeout(
            resolve,
            1500
          );
        }
      );
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
   CICLO
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
      buscarFortniteOficial
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
   LOJA
========================================================= */

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {
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
        "🎮 Testando notícias oficiais do Fortnite..."
      );

      await processarNoticias(
        "fortnite",
        buscarFortniteOficial
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

    setTimeout(
      function() {
        cicloNoticias();
      },
      15000
    );

    setInterval(
      function() {
        cicloNoticias();
      },
      10 * 60 * 1000
    );

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
      60000
    );
  }
);

/* =========================================================
   ENCERRAMENTO
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
  } catch (erro) {}

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
