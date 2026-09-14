require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado no Railway.");
  process.exit(1);
}

// CANAIS
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// FONTES
const URL_FORTNITE = "https://fortnite.gg/news";
const URL_LIBERTYCITY = "https://pt.libertycity.net/news/";
const URL_ROCKSTAR = "https://www.rockstargames.com/br/newswire";

const URL_LOJA =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

// TEMPOS
const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const INTERVALO_LOJA = 30 * 1000;

// LIMITES
const MAX_FORTNITE = 3;
const MAX_GTA = 3;
const MAX_TENTATIVAS = 2;

// ============================================================
// DISCORD
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================================================
// AXIOS
// ============================================================

const http = axios.create({
  timeout: 25000,

  maxRedirects: 5,

  validateStatus: status =>
    status >= 200 && status < 400,

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
      "no-cache",

    "Pragma":
      "no-cache"
  }
});

// ============================================================
// UTILIDADES
// ============================================================

function esperar(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function limitarTexto(texto, limite = 650) {
  texto = limparTexto(texto);

  if (!texto) {
    return "Confira todos os detalhes da notícia.";
  }

  if (texto.length <= limite) {
    return texto;
  }

  return texto
    .substring(0, limite - 3)
    .trim() + "...";
}

function urlValida(url) {
  if (!url) return false;

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

function normalizarUrl(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    u.hash = "";

    return u.href
      .split("?")[0]
      .replace(/\/$/, "");

  } catch {
    return String(url)
      .split("?")[0]
      .replace(/\/$/, "");
  }
}

function urlAbsoluta(url, base) {
  if (!url) return "";

  try {
    return new URL(url, base).href;
  } catch {
    return "";
  }
}

function imagemValida(url) {
  return urlValida(url);
}

// ============================================================
// RETRY AXIOS
// ============================================================

async function axiosSeguro(url, tentativas = MAX_TENTATIVAS) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {

    try {

      console.log(
        `🌐 Axios GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const response = await http.get(url);

      if (
        response.status >= 200 &&
        response.status < 400
      ) {

        console.log(
          `✅ Axios ${response.status} | ${url}`
        );

        return response.data;
      }

      console.log(
        `⚠️ Axios status ${response.status} | ${url}`
      );

    } catch (error) {

      const status =
        error.response?.status || "";

      console.log(
        `⚠️ Axios erro ${status} ${error.message} | ${url}`
      );
    }

    if (tentativa < tentativas) {
      await esperar(1200 * tentativa);
    }
  }

  return null;
}

// ============================================================
// PUPPETEER
// ============================================================

let browser = null;
let criandoBrowser = false;

async function iniciarBrowser() {

  if (
    browser &&
    browser.connected
  ) {
    return browser;
  }

  if (criandoBrowser) {

    for (let i = 0; i < 20; i++) {

      await esperar(500);

      if (
        browser &&
        browser.connected
      ) {
        return browser;
      }
    }
  }

  criandoBrowser = true;

  try {

    console.log(
      "🌐 Iniciando Puppeteer..."
    );

    browser =
      await puppeteer.launch({
        headless: true,

        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--no-first-run",
          "--no-default-browser-check"
        ]
      });

    console.log(
      "✅ Puppeteer iniciado."
    );

    browser.on(
      "disconnected",
      () => {
        console.log(
          "⚠️ Puppeteer desconectado. Será recriado quando necessário."
        );

        browser = null;
      }
    );

    return browser;

  } catch (error) {

    console.error(
      "❌ Não foi possível iniciar Puppeteer:",
      error.message
    );

    browser = null;

    return null;

  } finally {
    criandoBrowser = false;
  }
}

// ============================================================
// PÁGINA PUPPETEER
// ============================================================

async function criarPagina() {

  const b =
    await iniciarBrowser();

  if (!b) {
    return null;
  }

  try {

    const page =
      await b.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    await page.setViewport({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1
    });

    await page.setExtraHTTPHeaders({
      "Accept-Language":
        "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
    });

    page.setDefaultNavigationTimeout(
      45000
    );

    page.setDefaultTimeout(
      20000
    );

    return page;

  } catch (error) {

    console.error(
      "❌ Erro criando página:",
      error.message
    );

    return null;
  }
}

// ============================================================
// ABRIR COM PUPPETEER
// ============================================================

async function abrirComPuppeteer(
  url,
  esperarMs = 3500
) {

  let page = null;

  try {

    page =
      await criarPagina();

    if (!page) {
      return null;
    }

    console.log(
      `🌐 Puppeteer abrindo: ${url}`
    );

    const resposta =
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });

    console.log(
      `🌐 Puppeteer status: ${resposta?.status() || "?"}`
    );

    await esperar(
      esperarMs
    );

    // Tenta esperar rede ficar ociosa.
    try {

      await page.waitForNetworkIdle({
        idleTime: 1000,
        timeout: 10000
      });

    } catch {}

    return page;

  } catch (error) {

    console.error(
      `❌ Puppeteer falhou em ${url}:`,
      error.message
    );

    if (page) {
      try {
        await page.close();
      } catch {}
    }

    return null;
  }
}

// ============================================================
// FECHAR PÁGINA
// ============================================================

async function fecharPagina(page) {

  if (!page) return;

  try {
    await page.close();
  } catch {}
}

// ============================================================
// METADADOS VIA AXIOS
// ============================================================

async function metadadosAxios(url) {

  try {

    const html =
      await axiosSeguro(
        url,
        1
      );

    if (!html) {
      return {};
    }

    const $ =
      cheerio.load(html);

    const titulo =
      $("meta[property='og:title']").attr("content") ||
      $("meta[name='twitter:title']").attr("content") ||
      $("title").text() ||
      "";

    const descricao =
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content") ||
      $("meta[name='twitter:description']").attr("content") ||
      "";

    let imagem =
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      "";

    imagem =
      urlAbsoluta(
        imagem,
        url
      );

    return {
      titulo: limparTexto(titulo),
      descricao: limparTexto(descricao),
      imagem
    };

  } catch (error) {

    console.log(
      "⚠️ Metadados Axios falharam:",
      error.message
    );

    return {};
  }
}

// ============================================================
// METADADOS VIA PUPPETEER
// ============================================================

async function metadadosPuppeteer(url) {

  let page = null;

  try {

    page =
      await abrirComPuppeteer(
        url,
        2000
      );

    if (!page) {
      return {};
    }

    const dados =
      await page.evaluate(() => {

        function meta(seletores) {

          for (const seletor of seletores) {

            const elemento =
              document.querySelector(
                seletor
              );

            const valor =
              elemento?.getAttribute("content");

            if (valor) {
              return valor;
            }
          }

          return "";
        }

        const titulo =
          meta([
            "meta[property='og:title']",
            "meta[name='twitter:title']",
            "meta[name='title']"
          ]) ||
          document.title ||
          "";

        const descricao =
          meta([
            "meta[property='og:description']",
            "meta[name='description']",
            "meta[name='twitter:description']"
          ]);

        const imagem =
          meta([
            "meta[property='og:image']",
            "meta[name='twitter:image']"
          ]);

        return {
          titulo,
          descricao,
          imagem
        };
      });

    return {
      titulo:
        limparTexto(dados.titulo),

      descricao:
        limparTexto(dados.descricao),

      imagem:
        urlAbsoluta(
          dados.imagem,
          url
        )
    };

  } catch (error) {

    console.log(
      "⚠️ Metadados Puppeteer falharam:",
      error.message
    );

    return {};

  } finally {

    await fecharPagina(page);
  }
}

// ============================================================
// METADADOS COM FALLBACK
// ============================================================

async function buscarMetadados(url) {

  if (!urlValida(url)) {
    return {};
  }

  console.log(
    `📝 Buscando metadados: ${url}`
  );

  // PRIMEIRA TENTATIVA
  const p =
    await metadadosPuppeteer(url);

  if (
    p.titulo ||
    p.descricao ||
    p.imagem
  ) {

    return p;
  }

  // FALLBACK
  console.log(
    "↩️ Fallback de metadados para Axios..."
  );

  return await metadadosAxios(url);
}

// ============================================================
// DUPLICADAS
// ============================================================

async function jaFoiPublicada(
  canal,
  url
) {

  if (!canal || !url) {
    return false;
  }

  try {

    const mensagens =
      await canal.messages.fetch({
        limit: 100
      });

    const alvo =
      normalizarUrl(url);

    for (
      const [, mensagem]
      of mensagens
    ) {

      if (
        !mensagem.embeds ||
        !mensagem.embeds.length
      ) {
        continue;
      }

      for (
        const embed
        of mensagem.embeds
      ) {

        if (!embed.url) {
          continue;
        }

        if (
          normalizarUrl(
            embed.url
          ) === alvo
        ) {

          return true;
        }
      }
    }

  } catch (error) {

    console.log(
      "⚠️ Erro verificando duplicada:",
      error.message
    );
  }

  return false;
}

// ============================================================
// FRASES
// ============================================================

const frasesFortnite = [
  "🔥 Tem novidade nova no Fortnite!",
  "🎮 Saiu notícia nova do Fortnite!",
  "🚨 Atenção, comunidade Fortnite!",
  "👀 Olha essa novidade no Fortnite!",
  "⚡ Novidades fresquinhas do Fortnite!",
  "📰 Acabou de sair notícia nova do Fortnite!"
];

const frasesGTA = [
  "🚨 Saiu notícia nova sobre GTA!",
  "🔥 Novidade quente no universo GTA!",
  "🚔 Atenção, comunidade GTA!",
  "👀 Olha essa novidade sobre GTA!",
  "📰 Acabou de sair notícia nova do GTA!",
  "💥 Tem novidade nova no mundo do GTA!"
];

function fraseAleatoria(lista) {

  return lista[
    Math.floor(
      Math.random() *
      lista.length
    )
  ];
}

// ============================================================
// PUBLICAR NOTÍCIA
// ============================================================

async function publicarNoticia({
  canalId,
  tipo,
  titulo,
  url,
  descricao,
  imagem
}) {

  try {

    if (!urlValida(url)) {

      console.log(
        `⚠️ ${tipo}: URL inválida. Ignorando.`
      );

      return false;
    }

    const canal =
      await client.channels.fetch(
        canalId
      );

    if (!canal) {

      console.log(
        `⚠️ ${tipo}: canal não encontrado.`
      );

      return false;
    }

    if (
      await jaFoiPublicada(
        canal,
        url
      )
    ) {

      console.log(
        `⏭️ ${tipo}: já publicada: ${titulo}`
      );

      return false;
    }

    // Se não temos descrição,
    // usa uma mensagem padrão.
    descricao =
      limparTexto(descricao);

    if (!descricao) {

      descricao =
        "Confira todos os detalhes desta notícia no link abaixo.";
    }

    // Se não temos título
    if (!titulo) {

      titulo =
        `Nova notícia de ${tipo}`;
    }

    const frase =
      tipo === "Fortnite"
        ? fraseAleatoria(frasesFortnite)
        : fraseAleatoria(frasesGTA);

    const embed =
      new EmbedBuilder()
        .setTitle(
          limitarTexto(
            titulo,
            250
          )
        )
        .setURL(url)
        .setDescription(
          `📝 ${limitarTexto(descricao, 650)}\n\n` +
          `👇 **Clique no título acima para ler a matéria completa.**`
        )
        .setFooter({
          text:
            `Murilito NEWS • ${tipo}`
        })
        .setTimestamp();

    if (
      imagemValida(imagem)
    ) {

      embed.setImage(
        imagem
      );
    }

    await canal.send({
      content:
        `@everyone ${frase}`,

      embeds: [
        embed
      ]
    });

    console.log(
      `📢 ${tipo}: notícia publicada: ${titulo}`
    );

    return true;

  } catch (error) {

    console.error(
      `❌ Erro publicando ${tipo}:`,
      error.message
    );

    return false;
  }
}

// ============================================================
// FORTNITE — PUPPETEER
// ============================================================

async function buscarFortnitePuppeteer() {

  let page = null;

  try {

    console.log(
      "🔎 Fortnite: tentando Fortnite.GG via navegador..."
    );

    page =
      await abrirComPuppeteer(
        URL_FORTNITE,
        4000
      );

    if (!page) {
      return [];
    }

    const noticias =
      await page.evaluate(() => {

        const resultado = [];
        const vistos = new Set();

        const links =
          document.querySelectorAll(
            "a[href]"
          );

        for (
          const a of links
        ) {

          try {

            const href =
              a.href;

            if (
              !href ||
              !href.includes(
                "fortnite.gg/news/"
              )
            ) {
              continue;
            }

            const url =
              href
                .split("?")[0]
                .replace(/\/$/, "");

            if (
              vistos.has(url)
            ) {
              continue;
            }

            const path =
              new URL(url)
                .pathname;

            if (
              path === "/news" ||
              path === "/news/"
            ) {
              continue;
            }

            const heading =
              a.querySelector(
                "h1,h2,h3,h4,h5,h6"
              );

            let titulo =
              heading?.innerText ||
              "";

            if (!titulo) {

              titulo =
                a.getAttribute(
                  "aria-label"
                ) || "";
            }

            if (!titulo) {

              titulo =
                a.innerText || "";
            }

            titulo =
              titulo
                .replace(/\s+/g, " ")
                .trim();

            if (
              !titulo ||
              titulo.length < 8
            ) {
              continue;
            }

            const img =
              a.querySelector("img");

            let imagem =
              img?.src ||
              img?.getAttribute(
                "data-src"
              ) ||
              "";

            let descricao = "";

            const p =
              a.querySelector(
                "p"
              );

            if (p) {
              descricao =
                p.innerText || "";
            }

            vistos.add(url);

            resultado.push({
              titulo,
              url,
              imagem,
              descricao
            });

          } catch {}
        }

        return resultado;
      });

    console.log(
      `🔎 Fortnite.GG Puppeteer: ${noticias.length} candidatos.`
    );

    return noticias;

  } catch (error) {

    console.error(
      "❌ Fortnite Puppeteer:",
      error.message
    );

    return [];

  } finally {

    await fecharPagina(page);
  }
}

// ============================================================
// FORTNITE — AXIOS FALLBACK
// ============================================================

async function buscarFortniteAxios() {

  console.log(
    "↩️ Fortnite: usando fallback Axios..."
  );

  const html =
    await axiosSeguro(
      URL_FORTNITE,
      2
    );

  if (!html) {

    console.log(
      "⚠️ Fortnite Axios também falhou."
    );

    return [];
  }

  try {

    const $ =
      cheerio.load(html);

    const noticias = [];
    const vistos = new Set();

    $("a[href*='/news/']")
      .each((i, el) => {

        try {

          const href =
            $(el).attr("href");

          const url =
            urlAbsoluta(
              href,
              "https://fortnite.gg"
            );

          if (!url) return;

          const normalizada =
            normalizarUrl(url);

          if (
            vistos.has(
              normalizada
            )
          ) {
            return;
          }

          const titulo =
            limparTexto(
              $(el)
                .find(
                  "h1,h2,h3,h4,h5,h6"
                )
                .first()
                .text() ||
              $(el).text()
            );

          if (
            !titulo ||
            titulo.length < 8
          ) {
            return;
          }

          let imagem =
            $(el)
              .find("img")
              .first()
              .attr("src") ||
            "";

          imagem =
            urlAbsoluta(
              imagem,
              URL_FORTNITE
            );

          let descricao =
            limparTexto(
              $(el)
                .find("p")
                .first()
                .text()
            );

          vistos.add(
            normalizada
          );

          noticias.push({
            titulo,
            url: normalizada,
            imagem,
            descricao
          });

        } catch {}
      });

    console.log(
      `🔎 Fortnite.GG Axios: ${noticias.length} candidatos.`
    );

    return noticias;

  } catch (error) {

    console.error(
      "❌ Fortnite Axios parser:",
      error.message
    );

    return [];
  }
}

// ============================================================
// BUSCAR FORTNITE
// ============================================================

async function buscarFortnite() {

  // CAMINHO 1
  let noticias =
    await buscarFortnitePuppeteer();

  if (
    noticias.length
  ) {
    return noticias;
  }

  // CAMINHO 2
  noticias =
    await buscarFortniteAxios();

  return noticias;
}

// ============================================================
// PROCESSAR FORTNITE
// ============================================================

async function processarFortnite() {

  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

  try {

    const noticias =
      await buscarFortnite();

    if (
      !noticias.length
    ) {

      console.log(
        "⚠️ Fortnite: nenhuma notícia encontrada."
      );

      return;
    }

    let publicadas = 0;

    for (
      const noticia
      of noticias
    ) {

      if (
        publicadas >= MAX_FORTNITE
      ) {
        break;
      }

      try {

        let titulo =
          noticia.titulo;

        let descricao =
          noticia.descricao;

        let imagem =
          noticia.imagem;

        // Metadados se necessário
        if (
          !descricao ||
          !imagem
        ) {

          const meta =
            await buscarMetadados(
              noticia.url
            );

          titulo =
            meta.titulo ||
            titulo;

          descricao =
            meta.descricao ||
            descricao;

          imagem =
            meta.imagem ||
            imagem;
        }

        const publicou =
          await publicarNoticia({
            canalId:
              ID_FORTNITE,

            tipo:
              "Fortnite",

            titulo,
            url:
              noticia.url,

            descricao,
            imagem
          });

        if (
          publicou
        ) {
          publicadas++;
        }

      } catch (error) {

        console.log(
          `⚠️ Fortnite: erro em uma notícia: ${error.message}`
        );

        continue;
      }
    }

    console.log(
      `📊 Fortnite: ${publicadas} notícia(s) nova(s) publicada(s).`
    );

  } catch (error) {

    console.error(
      "❌ Fortnite: erro geral:",
      error.message
    );
  }
}

// ============================================================
// LIBERTYCITY — PUPPETEER
// ============================================================

async function buscarLibertyPuppeteer() {

  let page = null;

  try {

    console.log(
      "🔎 LibertyCity: tentando navegador..."
    );

    page =
      await abrirComPuppeteer(
        URL_LIBERTYCITY,
        3500
      );

    if (!page) {
      return [];
    }

    const noticias =
      await page.evaluate(() => {

        const resultado = [];
        const vistos = new Set();

        document
          .querySelectorAll(
            "a[href]"
          )
          .forEach(a => {

            try {

              const href =
                a.href;

              if (
                !href.includes(
                  "pt.libertycity.net/news/"
                )
              ) {
                return;
              }

              if (
                href.includes(
                  "/page/"
                )
              ) {
                return;
              }

              const url =
                href
                  .split("?")[0]
                  .replace(/\/$/, "");

              if (
                url ===
                "https://pt.libertycity.net/news"
              ) {
                return;
              }

              if (
                vistos.has(url)
              ) {
                return;
              }

              let titulo =
                a.querySelector(
                  "h1,h2,h3,h4,h5,h6"
                )?.innerText ||
                a.getAttribute(
                  "title"
                ) ||
                a.innerText ||
                "";

              titulo =
                titulo
                  .replace(/\s+/g, " ")
                  .trim();

              if (
                !titulo ||
                titulo.length < 10 ||
                titulo.length > 300
              ) {
                return;
              }

              const img =
                a.querySelector(
                  "img"
                );

              const imagem =
                img?.src ||
                img?.getAttribute(
                  "data-src"
                ) ||
                "";

              const p =
                a.querySelector(
                  "p"
                );

              const descricao =
                p?.innerText || "";

              vistos.add(url);

              resultado.push({
                titulo,
                url,
                imagem,
                descricao
              });

            } catch {}
          });

        return resultado;
      });

    console.log(
      `🔎 LibertyCity Puppeteer: ${noticias.length} candidatos.`
    );

    return noticias;

  } catch (error) {

    console.error(
      "❌ LibertyCity Puppeteer:",
      error.message
    );

    return [];

  } finally {

    await fecharPagina(page);
  }
}

// ============================================================
// LIBERTYCITY — AXIOS
// ============================================================

async function buscarLibertyAxios() {

  console.log(
    "↩️ LibertyCity: usando Axios..."
  );

  const html =
    await axiosSeguro(
      URL_LIBERTYCITY,
      2
    );

  if (!html) {
    return [];
  }

  try {

    const $ =
      cheerio.load(html);

    const noticias = [];
    const vistos = new Set();

    $("a[href*='/news/']")
      .each((i, el) => {

        try {

          const url =
            normalizarUrl(
              urlAbsoluta(
                $(el).attr("href"),
                "https://pt.libertycity.net"
              )
            );

          if (!url) return;

          if (
            url.includes("/page/")
          ) {
            return;
          }

          if (
            url ===
            "https://pt.libertycity.net/news"
          ) {
            return;
          }

          if (
            vistos.has(url)
          ) {
            return;
          }

          let titulo =
            limparTexto(
              $(el)
                .find(
                  "h1,h2,h3,h4,h5"
                )
                .first()
                .text() ||
              $(el).text()
            );

          if (
            !titulo ||
            titulo.length < 10 ||
            titulo.length > 300
          ) {
            return;
          }

          let imagem =
            $(el)
              .find("img")
              .first()
              .attr("src") ||
            "";

          imagem =
            urlAbsoluta(
              imagem,
              URL_LIBERTYCITY
            );

          const descricao =
            limparTexto(
              $(el)
                .find("p")
                .first()
                .text()
            );

          vistos.add(url);

          noticias.push({
            titulo,
            url,
            imagem,
            descricao
          });

        } catch {}
      });

    console.log(
      `🔎 LibertyCity Axios: ${noticias.length} candidatos.`
    );

    return noticias;

  } catch (error) {

    console.error(
      "❌ LibertyCity parser:",
      error.message
    );

    return [];
  }
}

// ============================================================
// BUSCAR LIBERTYCITY
// ============================================================

async function buscarLiberty() {

  let noticias =
    await buscarLibertyPuppeteer();

  if (
    noticias.length
  ) {
    return noticias;
  }

  return await buscarLibertyAxios();
}

// ============================================================
// PROCESSAR LIBERTYCITY
// ============================================================

async function processarLiberty() {

  try {

    const noticias =
      await buscarLiberty();

    if (
      !noticias.length
    ) {

      console.log(
        "⚠️ LibertyCity: nenhuma notícia encontrada."
      );

      return;
    }

    let publicadas = 0;

    for (
      const noticia
      of noticias
    ) {

      if (
        publicadas >= MAX_GTA
      ) {
        break;
      }

      try {

        let titulo =
          noticia.titulo;

        let descricao =
          noticia.descricao;

        let imagem =
          noticia.imagem;

        if (
          !descricao ||
          !imagem
        ) {

          console.log(
            "📝 GTA: buscando preview/imagem..."
          );

          const meta =
            await buscarMetadados(
              noticia.url
            );

          titulo =
            meta.titulo ||
            titulo;

          descricao =
            meta.descricao ||
            descricao;

          imagem =
            meta.imagem ||
            imagem;
        }

        const publicou =
          await publicarNoticia({
            canalId:
              ID_GTA,

            tipo:
              "GTA",

            titulo,
            url:
              noticia.url,

            descricao,
            imagem
          });

        if (
          publicou
        ) {
          publicadas++;
        }

      } catch (error) {

        console.log(
          `⚠️ LibertyCity: erro nessa notícia: ${error.message}`
        );

        continue;
      }
    }

    console.log(
      `📊 LibertyCity: ${publicadas} notícia(s) nova(s) publicada(s).`
    );

  } catch (error) {

    console.error(
      "❌ LibertyCity: erro geral:",
      error.message
    );
  }
}

// ============================================================
// ROCKSTAR — PUPPETEER
// ============================================================

async function buscarRockstarPuppeteer() {

  let page = null;

  try {

    console.log(
      "🔎 Rockstar: abrindo Newswire..."
    );

    page =
      await abrirComPuppeteer(
        URL_ROCKSTAR,
        5000
      );

    if (!page) {
      return [];
    }

    const noticias =
      await page.evaluate(() => {

        const resultado = [];
        const vistos = new Set();

        document
          .querySelectorAll(
            "a[href]"
          )
          .forEach(a => {

            try {

              const href =
                a.href;

              if (
                !href.includes(
                  "/newswire/article/"
                )
              ) {
                return;
              }

              const url =
                href.split("?")[0];

              if (
                vistos.has(url)
              ) {
                return;
              }

              let titulo =
                a.querySelector(
                  "h1,h2,h3,h4,h5,h6"
                )?.innerText ||
                a.getAttribute(
                  "aria-label"
                ) ||
                a.innerText ||
                "";

              titulo =
                titulo
                  .replace(/\s+/g, " ")
                  .trim();

              if (
                !titulo ||
                titulo.length < 8
              ) {
                return;
              }

              const img =
                a.querySelector(
                  "img"
                );

              const imagem =
                img?.src ||
                img?.getAttribute(
                  "data-src"
                ) ||
                "";

              vistos.add(url);

              resultado.push({
                titulo,
                url,
                imagem
              });

            } catch {}
          });

        return resultado;
      });

    console.log(
      `🔎 Rockstar: ${noticias.length} artigos encontrados.`
    );

    return noticias;

  } catch (error) {

    console.error(
      "❌ Rockstar Puppeteer:",
      error.message
    );

    return [];

  } finally {

    await fecharPagina(page);
  }
}

// ============================================================
// ROCKSTAR — AXIOS FALLBACK
// ============================================================

async function buscarRockstarAxios() {

  console.log(
    "↩️ Rockstar: tentando Axios..."
  );

  const html =
    await axiosSeguro(
      URL_ROCKSTAR,
      2
    );

  if (!html) {
    return [];
  }

  try {

    const $ =
      cheerio.load(html);

    const noticias = [];
    const vistos = new Set();

    $("a[href*='/newswire/article/']")
      .each((i, el) => {

        try {

          const url =
            normalizarUrl(
              urlAbsoluta(
                $(el).attr("href"),
                URL_ROCKSTAR
              )
            );

          if (
            !url ||
            vistos.has(url)
          ) {
            return;
          }

          const titulo =
            limparTexto(
              $(el)
                .find(
                  "h1,h2,h3,h4,h5"
                )
                .first()
                .text() ||
              $(el).text()
            );

          if (
            !titulo ||
            titulo.length < 8
          ) {
            return;
          }

          let imagem =
            $(el)
              .find("img")
              .first()
              .attr("src") ||
            "";

          imagem =
            urlAbsoluta(
              imagem,
              URL_ROCKSTAR
            );

          vistos.add(url);

          noticias.push({
            titulo,
            url,
            imagem
          });

        } catch {}
      });

    console.log(
      `🔎 Rockstar Axios: ${noticias.length} candidatos.`
    );

    return noticias;

  } catch (error) {

    console.error(
      "❌ Rockstar Axios parser:",
      error.message
    );

    return [];
  }
}

// ============================================================
// FILTRO GTA
// ============================================================

function pareceGTA(titulo) {

  const texto =
    limparTexto(
      titulo
    ).toLowerCase();

  const termos = [
    "gta",
    "grand theft auto",
    "gta online",
    "grand theft auto vi",
    "gta vi",
    "gta 6",
    "vice city",
    "los santos",
    "gta+",
    "gta plus"
  ];

  return termos.some(
    termo =>
      texto.includes(
        termo
      )
  );
}

// ============================================================
// BUSCAR ROCKSTAR
// ============================================================

async function buscarRockstar() {

  let noticias =
    await buscarRockstarPuppeteer();

  if (
    noticias.length
  ) {
    return noticias;
  }

  return await buscarRockstarAxios();
}

// ============================================================
// PROCESSAR ROCKSTAR
// ============================================================

async function processarRockstar() {

  try {

    const noticias =
      await buscarRockstar();

    if (
      !noticias.length
    ) {

      console.log(
        "⚠️ Rockstar: nenhum artigo encontrado."
      );

      return;
    }

    let publicadas = 0;

    for (
      const noticia
      of noticias
    ) {

      if (
        publicadas >= MAX_GTA
      ) {
        break;
      }

      if (
        !pareceGTA(
          noticia.titulo
        )
      ) {
        continue;
      }

      try {

        let titulo =
          noticia.titulo;

        let descricao = "";

        let imagem =
          noticia.imagem;

        console.log(
          `🔎 Rockstar GTA: ${titulo}`
        );

        const meta =
          await buscarMetadados(
            noticia.url
          );

        titulo =
          meta.titulo ||
          titulo;

        descricao =
          meta.descricao ||
          "";

        imagem =
          meta.imagem ||
          imagem;

        const publicou =
          await publicarNoticia({
            canalId:
              ID_GTA,

            tipo:
              "GTA",

            titulo,
            url:
              noticia.url,

            descricao,
            imagem
          });

        if (
          publicou
        ) {
          publicadas++;
        }

      } catch (error) {

        console.log(
          `⚠️ Rockstar: erro nessa notícia: ${error.message}`
        );

        continue;
      }
    }

    console.log(
      `📊 Rockstar: ${publicadas} notícia(s) nova(s) publicada(s).`
    );

  } catch (error) {

    console.error(
      "❌ Rockstar: erro geral:",
      error.message
    );
  }
}

// ============================================================
// LOJA
// ============================================================

async function publicarLoja() {

  try {

    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {

      console.log(
        "❌ Canal da loja não encontrado."
      );

      return false;
    }

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setURL(
          URL_LOJA
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
        "@everyone 🛒 **CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR!** 🔥",

      embeds: [
        embed
      ]
    });

    console.log(
      "🛒 Loja do Fortnite publicada."
    );

    return true;

  } catch (error) {

    console.error(
      "❌ Erro publicando loja:",
      error.message
    );

    return false;
  }
}

// ============================================================
// CONTROLE DA LOJA
// ============================================================

let ultimoDiaLoja = null;

function dataBrasil() {

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",

      year:
        "numeric",

      month:
        "2-digit",

      day:
        "2-digit"
    }
  ).format(
    new Date()
  );
}

async function verificarHorarioLoja() {

  try {

    const agora =
      new Intl.DateTimeFormat(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo",

          hour:
            "2-digit",

          minute:
            "2-digit",

          hour12:
            false
        }
      ).format(
        new Date()
      );

    const [hora, minuto] =
      agora
        .split(":")
        .map(Number);

    const hoje =
      dataBrasil();

    if (
      hora === 21 &&
      minuto >= 0 &&
      minuto <= 5 &&
      ultimoDiaLoja !== hoje
    ) {

      console.log(
        "🛒 Horário da loja atingido."
      );

      const sucesso =
        await publicarLoja();

      if (sucesso) {
        ultimoDiaLoja =
          hoje;
      }
    }

  } catch (error) {

    console.error(
      "❌ Erro verificando horário da loja:",
      error.message
    );
  }
}

// ============================================================
// CICLO DE NOTÍCIAS
// ============================================================

let cicloExecutando = false;

async function cicloNoticias() {

  if (
    cicloExecutando
  ) {

    console.log(
      "⏳ Ciclo anterior ainda está executando."
    );

    return;
  }

  cicloExecutando = true;

  console.log(
    "\n========================================"
  );

  console.log(
    "📰 INICIANDO CICLO DE NOTÍCIAS"
  );

  console.log(
    "========================================"
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
    "========================================"
  );

  // Cada fonte fica isolada.
  // Se uma quebrar, as outras continuam.

  try {
    await processarFortnite();
  } catch (error) {
    console.error(
      "❌ Fortnite derrubou apenas o próprio módulo:",
      error.message
    );
  }

  try {
    await processarLiberty();
  } catch (error) {
    console.error(
      "❌ LibertyCity derrubou apenas o próprio módulo:",
      error.message
    );
  }

  try {
    await processarRockstar();
  } catch (error) {
    console.error(
      "❌ Rockstar derrubou apenas o próprio módulo:",
      error.message
    );
  }

  console.log(
    "========================================"
  );

  console.log(
    "✅ CICLO DE NOTÍCIAS FINALIZADO"
  );

  console.log(
    "========================================"
  );

  cicloExecutando = false;
}

// ============================================================
// COMANDOS
// ============================================================

client.on(
  "messageCreate",
  async message => {

    try {

      if (
        message.author.bot
      ) {
        return;
      }

      const texto =
        message.content
          .trim()
          .toLowerCase();

      // ================================================
      // TESTE COMPLETO
      // ================================================

      if (
        texto === "!teste"
      ) {

        await message.reply(
          "🧪 Iniciando teste completo..."
        );

        await cicloNoticias();

        return;
      }

      // ================================================
      // FORTNITE
      // ================================================

      if (
        texto === "!teste fortnite"
      ) {

        await message.reply(
          "🎮 Testando notícias do Fortnite..."
        );

        await processarFortnite();

        return;
      }

      // ================================================
      // LIBERTYCITY
      // ================================================

      if (
        texto === "!teste liberty"
      ) {

        await message.reply(
          "🚔 Testando LibertyCity..."
        );

        await processarLiberty();

        return;
      }

      // ================================================
      // ROCKSTAR
      // ================================================

      if (
        texto === "!teste rockstar"
      ) {

        await message.reply(
          "🚨 Testando Rockstar Newswire..."
        );

        await processarRockstar();

        return;
      }

      // ================================================
      // LOJA
      // ================================================

      if (
        texto === "!teste loja"
      ) {

        await message.reply(
          "🛒 Publicando teste da loja..."
        );

        await publicarLoja();

        return;
      }

      // ================================================
      // PIADA
      // ================================================

      if (
        texto === "!piada"
      ) {

        const piadas = [
          "😂 O jogador disse que ia jogar só uma partida. Duas horas depois: 'só mais uma'.",

          "🤣 GTA 6 vai lançar antes do meu PC terminar de atualizar o Windows.",

          "😂 Fortnite: onde você cai para pegar uma arma e termina dançando com uma banana.",

          "🤣 Eu não sou viciado em GTA. Só conheço Los Santos melhor que minha cidade."
        ];

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

      // ================================================
      // AJUDA
      // ================================================

      if (
        texto === "!ajuda"
      ) {

        const embed =
          new EmbedBuilder()
            .setTitle(
              "🤖 MURILITO NEWS"
            )
            .setDescription(
              "Confira os comandos disponíveis:"
            )
            .addFields(
              {
                name:
                  "🧪 Testes",

                value:
                  "`!teste`\n" +
                  "`!teste fortnite`\n" +
                  "`!teste liberty`\n" +
                  "`!teste rockstar`\n" +
                  "`!teste loja`"
              },

              {
                name:
                  "😂 Diversão",

                value:
                  "`!piada`"
              }
            )
            .setFooter({
              text:
                "Murilito NEWS"
            });

        await message.reply({
          embeds: [
            embed
          ]
        });

        return;
      }

    } catch (error) {

      console.error(
        "❌ Erro no comando:",
        error.message
      );
    }
  }
);

// ============================================================
// BOT ONLINE
// ============================================================

client.once(
  "clientReady",
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
      "========================================"
    );

    // Primeiro ciclo
    await cicloNoticias();

    // Notícias
    setInterval(
      () => {
        cicloNoticias()
          .catch(error => {
            console.error(
              "❌ Erro no intervalo de notícias:",
              error.message
            );
          });
      },
      INTERVALO_NOTICIAS
    );

    // Loja
    setInterval(
      () => {
        verificarHorarioLoja()
          .catch(error => {
            console.error(
              "❌ Erro no intervalo da loja:",
              error.message
            );
          });
      },
      INTERVALO_LOJA
    );

    console.log(
      "⏰ Sistema automático iniciado."
    );

    console.log(
      "📰 Notícias: a cada 10 minutos."
    );

    console.log(
      "🛒 Loja: diariamente às 21:00."
    );
  }
);

// ============================================================
// TRATAMENTO DE ERROS DO PROCESSO
// ============================================================

process.on(
  "unhandledRejection",
  error => {

    console.error(
      "⚠️ Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {

    console.error(
      "⚠️ Uncaught Exception:",
      error
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

client.login(TOKEN)
  .catch(error => {

    console.error(
      "❌ Erro fazendo login no Discord:",
      error.message
    );

    process.exit(1);
  });
