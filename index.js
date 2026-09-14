require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
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

// IDs DOS CANAIS — NÃO ALTERAR
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// Loja oficial
const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

// Notícias a cada 10 minutos
const INTERVALO_NOTICIAS = 10 * 60 * 1000;

// Máximo de notícias novas por fonte/ciclo
const MAX_NOTICIAS_POR_FONTE = 3;

// Quantidade máxima de candidatos analisados
const MAX_CANDIDATOS = 20;

// User Agent
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/140.0.0.0 Safari/537.36";

// ============================================================
// DISCORD
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ============================================================
// AXIOS
// ============================================================

const http = axios.create({
  timeout: 20000,
  maxRedirects: 5,
  headers: {
    "User-Agent": USER_AGENT,
    "Accept-Language":
      "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
});

// ============================================================
// PUPPETEER
// ============================================================

let browser = null;
let browserIniciando = null;

async function iniciarBrowser() {
  try {
    if (
      browser &&
      browser.connected
    ) {
      return browser;
    }

    if (browserIniciando) {
      return await browserIniciando;
    }

    console.log(
      "🌐 Iniciando navegador Puppeteer..."
    );

    browserIniciando =
      puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-software-rasterizer",
          "--disable-extensions",
          "--no-first-run",
          "--no-default-browser-check",
        ],
      });

    browser =
      await browserIniciando;

    browserIniciando = null;

    console.log(
      "✅ Puppeteer iniciado."
    );

    return browser;
  } catch (erro) {
    browserIniciando = null;
    browser = null;

    console.error(
      "❌ Erro ao iniciar Puppeteer:",
      erro.message
    );

    return null;
  }
}

async function fecharBrowser() {
  try {
    if (browser) {
      await browser.close();
    }
  } catch {}

  browser = null;
}

// ============================================================
// ABRIR PÁGINA
// ============================================================

async function abrirPagina(
  url,
  opcoes = {}
) {
  let pagina = null;

  try {
    const navegador =
      await iniciarBrowser();

    if (!navegador) {
      return null;
    }

    pagina =
      await navegador.newPage();

    await pagina.setUserAgent(
      USER_AGENT
    );

    await pagina.setViewport({
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
    });

    await pagina.setExtraHTTPHeaders({
      "Accept-Language":
        "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    pagina.setDefaultNavigationTimeout(
      opcoes.timeout || 30000
    );

    console.log(
      `🌐 Puppeteer abrindo: ${url}`
    );

    const resposta =
      await pagina.goto(url, {
        waitUntil:
          "domcontentloaded",
        timeout:
          opcoes.timeout || 30000,
      });

    const status =
      resposta
        ? resposta.status()
        : 0;

    console.log(
      `🌐 Puppeteer status: ${status}`
    );

    // 403, 404 etc.
    // Não fica insistindo.
    if (status >= 400) {
      await pagina
        .close()
        .catch(() => {});

      return null;
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          opcoes.espera || 1500
        )
    );

    return pagina;
  } catch (erro) {
    console.error(
      `⚠️ Puppeteer falhou em ${url}:`,
      erro.message
    );

    if (pagina) {
      await pagina
        .close()
        .catch(() => {});
    }

    return null;
  }
}

// ============================================================
// AXIOS
// ============================================================

async function axiosGet(
  url,
  tentativas = 2
) {
  for (
    let i = 1;
    i <= tentativas;
    i++
  ) {
    try {
      console.log(
        `🌐 Axios GET ${url} | tentativa ${i}/${tentativas}`
      );

      const resposta =
        await http.get(url);

      console.log(
        `✅ HTTP ${resposta.status} | ${url}`
      );

      return resposta;
    } catch (erro) {
      const status =
        erro.response?.status ||
        "sem status";

      console.log(
        `⚠️ Axios erro ${status} ${erro.message} | ${url}`
      );

      // Não adianta insistir nesses códigos
      if (
        erro.response &&
        [401, 403, 404].includes(
          erro.response.status
        )
      ) {
        break;
      }
    }
  }

  return null;
}

// ============================================================
// UTILIDADES
// ============================================================

function limparTexto(
  texto
) {
  if (!texto) {
    return "";
  }

  return String(texto)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizarTitulo(
  titulo
) {
  return limparTexto(titulo)
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .trim();
}

function urlValida(
  url
) {
  try {
    const u =
      new URL(url);

    return (
      u.protocol ===
        "http:" ||
      u.protocol ===
        "https:"
    );
  } catch {
    return false;
  }
}

function urlLimpa(
  url
) {
  try {
    const u =
      new URL(url);

    u.search = "";
    u.hash = "";

    return u
      .toString()
      .replace(/\/$/, "");
  } catch {
    return String(url || "")
      .trim();
  }
}

function escolherImagem(
  ...imagens
) {
  for (
    const imagem of imagens
  ) {
    if (
      imagem &&
      typeof imagem ===
        "string" &&
      urlValida(imagem)
    ) {
      return imagem;
    }
  }

  return null;
}

// ============================================================
// FRASES
// ============================================================

const FRASES = [
  "🚨 CORRE! Saiu notícia nova!",
  "🔥 ATENÇÃO! Tem novidade chegando!",
  "👀 Olha essa novidade!",
  "📰 Acabou de sair!",
  "🚨 NOTÍCIA NOVA!",
  "🔥 A comunidade já está comentando!",
  "👀 Fica de olho nessa!",
  "📢 Tem novidade no mundo dos games!",
];

function fraseAleatoria() {
  return FRASES[
    Math.floor(
      Math.random() *
        FRASES.length
    )
  ];
}

// ============================================================
// METADADOS
// Só é usado quando o card NÃO possui imagem/descrição.
// ============================================================

async function buscarMetadados(
  url
) {
  if (!urlValida(url)) {
    return {};
  }

  console.log(
    `📝 Buscando metadados: ${url}`
  );

  const pagina =
    await abrirPagina(
      url,
      {
        timeout: 15000,
        espera: 700,
      }
    );

  if (!pagina) {
    return {};
  }

  try {
    const dados =
      await pagina.evaluate(
        () => {
          const meta =
            (selector) => {
              const el =
                document.querySelector(
                  selector
                );

              return el
                ? el.getAttribute(
                    "content"
                  ) || ""
                : "";
            };

          const titulo =
            meta(
              'meta[property="og:title"]'
            ) ||
            meta(
              'meta[name="twitter:title"]'
            ) ||
            "";

          const descricao =
            meta(
              'meta[property="og:description"]'
            ) ||
            meta(
              'meta[name="description"]'
            ) ||
            meta(
              'meta[name="twitter:description"]'
            ) ||
            "";

          const imagem =
            meta(
              'meta[property="og:image"]'
            ) ||
            meta(
              'meta[name="twitter:image"]'
            ) ||
            "";

          return {
            titulo:
              titulo.trim(),
            descricao:
              descricao.trim(),
            imagem:
              imagem.trim(),
          };
        }
      );

    await pagina
      .close()
      .catch(() => {});

    return dados;
  } catch (erro) {
    await pagina
      .close()
      .catch(() => {});

    return {};
  }
}

// ============================================================
// DUPLICATAS
// ============================================================

async function jaFoiPublicada(
  canal,
  noticia
) {
  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 100,
      });

    const urlNova =
      urlLimpa(
        noticia.url || ""
      );

    const tituloNovo =
      normalizarTitulo(
        noticia.titulo || ""
      );

    for (
      const [, mensagem] of mensagens
    ) {
      if (
        mensagem.author?.id !==
        client.user.id
      ) {
        continue;
      }

      for (
        const embed of mensagem.embeds
      ) {
        const urlEmbed =
          urlLimpa(
            embed.url || ""
          );

        const tituloEmbed =
          normalizarTitulo(
            embed.title || ""
          );

        if (
          urlNova &&
          urlEmbed &&
          urlNova ===
            urlEmbed
        ) {
          return true;
        }

        if (
          tituloNovo &&
          tituloEmbed &&
          tituloNovo ===
            tituloEmbed
        ) {
          return true;
        }
      }
    }

    return false;
  } catch (erro) {
    console.log(
      "⚠️ Falha verificando duplicata:",
      erro.message
    );

    return false;
  }
}

// ============================================================
// PUBLICAR NOTÍCIA
// ============================================================

async function publicarNoticia(
  tipo,
  noticia
) {
  try {
    if (
      !noticia ||
      !noticia.url ||
      !noticia.titulo
    ) {
      return false;
    }

    const canalId =
      tipo === "FORTNITE"
        ? ID_FORTNITE
        : ID_GTA;

    const canal =
      await client.channels.fetch(
        canalId
      );

    if (!canal) {
      console.log(
        `❌ Canal não encontrado: ${canalId}`
      );

      return false;
    }

    noticia.url =
      urlLimpa(
        noticia.url
      );

    noticia.titulo =
      limparTexto(
        noticia.titulo
      );

    // ========================================================
    // FILTROS
    // ========================================================

    if (
      noticia.titulo.length <
        5 ||
      noticia.titulo.length >
        250
    ) {
      return false;
    }

    const tituloLower =
      noticia.titulo.toLowerCase();

    const ignorados = [
      "próxima página",
      "próxima página →",
      "next page",
      "next page →",
      "previous page",
      "previous page →",
      "access denied",
      "notícias",
      "noticia",
    ];

    if (
      ignorados.includes(
        tituloLower
      )
    ) {
      return false;
    }

    // ========================================================
    // DUPLICATA
    // ========================================================

    if (
      await jaFoiPublicada(
        canal,
        noticia
      )
    ) {
      console.log(
        `⏭️ ${tipo}: já publicada: ${noticia.titulo}`
      );

      return false;
    }

    // ========================================================
    // PRIMEIRO USA O CARD
    //
    // Isso é MUITO importante para Rockstar.
    //
    // A imagem do Newswire já vem no card.
    // Não precisamos abrir o artigo individual.
    // ========================================================

    let tituloFinal =
      noticia.titulo;

    let descricaoFinal =
      limparTexto(
        noticia.descricao ||
          ""
      );

    let imagemFinal =
      escolherImagem(
        noticia.imagem
      );

    // ========================================================
    // SÓ BUSCA METADADOS SE REALMENTE FALTAR ALGO
    // ========================================================

    if (
      !imagemFinal &&
      !descricaoFinal
    ) {
      console.log(
        `📝 ${tipo}: card sem imagem/descrição, tentando metadados...`
      );

      const metadados =
        await buscarMetadados(
          noticia.url
        );

      if (
        metadados.titulo &&
        metadados.titulo.length >
          5 &&
        metadados.titulo.length <
          250
      ) {
        tituloFinal =
          metadados.titulo;
      }

      if (
        metadados.descricao
      ) {
        descricaoFinal =
          limparTexto(
            metadados.descricao
          );
      }

      if (
        metadados.imagem
      ) {
        imagemFinal =
          escolherImagem(
            metadados.imagem
          );
      }
    }

    // ========================================================
    // DESCRIÇÃO FALLBACK
    // ========================================================

    if (!descricaoFinal) {
      if (
        tipo === "FORTNITE"
      ) {
        descricaoFinal =
          "🎮 Confira todos os detalhes desta novidade do Fortnite.";
      } else {
        descricaoFinal =
          "🚔 Confira todos os detalhes desta novidade do GTA.";
      }
    }

    if (
      descricaoFinal.length >
      700
    ) {
      descricaoFinal =
        descricaoFinal.substring(
          0,
          697
        ) + "...";
    }

    // ========================================================
    // EMBED
    // ========================================================

    const embed =
      new EmbedBuilder()
        .setTitle(
          tipo === "FORTNITE"
            ? `🎮 ${tituloFinal}`
            : `🚔 ${tituloFinal}`
        )
        .setURL(
          noticia.url
        )
        .setDescription(
          `${descricaoFinal}\n\n` +
            "👇 **Clique no título acima para ler a matéria completa.**"
        )
        .setTimestamp()
        .setFooter({
          text:
            tipo ===
            "FORTNITE"
              ? "Murilito NEWS • Fortnite"
              : "Murilito NEWS • GTA",
        });

    // ========================================================
    // IMAGEM
    // ========================================================

    if (imagemFinal) {
      console.log(
        `🖼️ ${tipo}: imagem encontrada no card.`
      );

      embed.setImage(
        imagemFinal
      );
    } else {
      console.log(
        `⚠️ ${tipo}: nenhuma imagem encontrada.`
      );
    }

    // ========================================================
    // ENVIO
    // ========================================================

    try {
      await canal.send({
        content:
          `@everyone ${fraseAleatoria()}`,
        embeds: [embed],
      });
    } catch (erroEnvio) {
      console.log(
        "⚠️ Discord recusou o primeiro envio:",
        erroEnvio.message
      );

      // ======================================================
      // SEGUNDO ATAQUE
      // Publica sem imagem para não perder a notícia.
      // ======================================================

      if (imagemFinal) {
        console.log(
          "↩️ Tentando publicar sem a imagem..."
        );

        const embedSemImagem =
          new EmbedBuilder()
            .setTitle(
              tipo ===
                "FORTNITE"
                ? `🎮 ${tituloFinal}`
                : `🚔 ${tituloFinal}`
            )
            .setURL(
              noticia.url
            )
            .setDescription(
              `${descricaoFinal}\n\n` +
                "👇 **Clique no título acima para ler a matéria completa.**"
            )
            .setTimestamp()
            .setFooter({
              text:
                tipo ===
                "FORTNITE"
                  ? "Murilito NEWS • Fortnite"
                  : "Murilito NEWS • GTA",
            });

        await canal.send({
          content:
            `@everyone ${fraseAleatoria()}`,
          embeds: [
            embedSemImagem,
          ],
        });
      } else {
        throw erroEnvio;
      }
    }

    console.log(
      `📢 ${tipo}: notícia publicada: ${tituloFinal}`
    );

    return true;
  } catch (erro) {
    console.error(
      `❌ Erro ao publicar ${tipo}:`,
      erro.message
    );

    return false;
  }
}

// ============================================================
// FORTNITE.GG
// ============================================================

async function buscarFortniteGG() {
  console.log(
    "🔎 Fortnite: tentando Fortnite.GG via navegador..."
  );

  const pagina =
    await abrirPagina(
      "https://fortnite.gg/news",
      {
        timeout: 25000,
        espera: 2500,
      }
    );

  if (!pagina) {
    return [];
  }

  try {
    // Rola para ativar conteúdo lazy
    await pagina.evaluate(
      () => {
        window.scrollTo(
          0,
          document.body.scrollHeight
        );
      }
    );

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          1000
        )
    );

    const noticias =
      await pagina.evaluate(
        () => {
          const resultado =
            [];

          const vistos =
            new Set();

          const links =
            Array.from(
              document.querySelectorAll(
                "a[href]"
              )
            );

          for (
            const a of links
          ) {
            try {
              const href =
                a.href || "";

              if (
                !href.includes(
                  "fortnite.gg"
                )
              ) {
                continue;
              }

              const u =
                new URL(href);

              const path =
                u.pathname;

              const ehNews =
                path ===
                  "/news" ||
                path ===
                  "/news/" ||
                path.startsWith(
                  "/news/"
                );

              if (!ehNews) {
                continue;
              }

              // Página principal não é notícia
              if (
                path ===
                  "/news" ||
                path ===
                  "/news/"
              ) {
                // Só aceitar se tiver algum identificador
                if (
                  !u.searchParams.has(
                    "id"
                  ) &&
                  !u.searchParams.has(
                    "slug"
                  )
                ) {
                  continue;
                }
              }

              if (
                path.includes(
                  "/page/"
                )
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
                  a.innerText ||
                  a.textContent ||
                  "";
              }

              titulo =
                titulo
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim();

              if (
                !titulo ||
                titulo.length <
                  10 ||
                titulo.length >
                  250
              ) {
                continue;
              }

              const ignorados = [
                "news",
                "notícias",
                "noticias",
                "home",
                "more",
                "read more",
                "saiba mais",
              ];

              if (
                ignorados.includes(
                  titulo.toLowerCase()
                )
              ) {
                continue;
              }

              if (
                vistos.has(href)
              ) {
                continue;
              }

              vistos.add(href);

              const img =
                a.querySelector(
                  "img"
                );

              const imagem =
                img?.currentSrc ||
                img?.src ||
                img?.getAttribute(
                  "data-src"
                ) ||
                img?.getAttribute(
                  "data-lazy-src"
                ) ||
                "";

              resultado.push({
                titulo,
                url: href,
                imagem,
                descricao: "",
              });
            } catch {}
          }

          return resultado.slice(
            0,
            20
          );
        }
      );

    await pagina
      .close()
      .catch(() => {});

    console.log(
      `🔎 Fortnite.GG: ${noticias.length} candidatos.`
    );

    return noticias;
  } catch (erro) {
    await pagina
      .close()
      .catch(() => {});

    console.log(
      "⚠️ Erro lendo Fortnite.GG:",
      erro.message
    );

    return [];
  }
}

// ============================================================
// FORTNITE OFICIAL
// ============================================================

async function buscarFortniteOficial() {
  console.log(
    "↩️ Fortnite: tentando fonte oficial..."
  );

  const urls = [
    "https://www.fortnite.com/news?lang=pt-BR",
    "https://www.fortnite.com/news/tag/all-news?lang=pt-BR",
  ];

  for (
    const url of urls
  ) {
    const pagina =
      await abrirPagina(
        url,
        {
          timeout: 30000,
          espera: 2500,
        }
      );

    if (!pagina) {
      continue;
    }

    try {
      const noticias =
        await pagina.evaluate(
          () => {
            const resultado =
              [];

            const vistos =
              new Set();

            document
              .querySelectorAll(
                'a[href*="/news/"]'
              )
              .forEach(
                (a) => {
                  try {
                    const href =
                      a.href ||
                      "";

                    if (
                      !href.includes(
                        "fortnite.com/news/"
                      )
                    ) {
                      return;
                    }

                    const path =
                      new URL(
                        href
                      ).pathname;

                    if (
                      path ===
                        "/news/" ||
                      path.includes(
                        "/tag/"
                      )
                    ) {
                      return;
                    }

                    const heading =
                      a.querySelector(
                        "h1,h2,h3,h4,h5,h6"
                      );

                    const titulo =
                      (
                        heading?.textContent ||
                        a.innerText ||
                        ""
                      )
                        .replace(
                          /\s+/g,
                          " "
                        )
                        .trim();

                    if (
                      titulo.length <
                        10 ||
                      titulo.length >
                        250
                    ) {
                      return;
                    }

                    if (
                      vistos.has(
                        href
                      )
                    ) {
                      return;
                    }

                    vistos.add(
                      href
                    );

                    const img =
                      a.querySelector(
                        "img"
                      );

                    resultado.push({
                      titulo,
                      url: href,
                      imagem:
                        img?.currentSrc ||
                        img?.src ||
                        "",
                    });
                  } catch {}
                }
              );

            return resultado.slice(
              0,
              20
            );
          }
        );

      await pagina
        .close()
        .catch(() => {});

      if (
        noticias.length
      ) {
        console.log(
          `✅ Fortnite oficial: ${noticias.length} candidatos.`
        );

        return noticias;
      }
    } catch {
      await pagina
        .close()
        .catch(() => {});
    }
  }

  return [];
}

// ============================================================
// GOOGLE NEWS — FORTNITE
// ============================================================

async function buscarFortniteGoogle() {
  try {
    console.log(
      "📰 Fortnite: usando Google News como último fallback..."
    );

    const rssUrl =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(
        "Fortnite site:fortnite.com/news"
      ) +
      "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

    const resposta =
      await axiosGet(
        rssUrl,
        1
      );

    if (!resposta) {
      return [];
    }

    const $ =
      cheerio.load(
        resposta.data,
        {
          xmlMode: true,
        }
      );

    const noticias =
      [];

    $("item").each(
      (_, item) => {
        const titulo =
          limparTexto(
            $(item)
              .find(
                "title"
              )
              .text()
          );

        const link =
          limparTexto(
            $(item)
              .find(
                "link"
              )
              .text()
          );

        if (
          !titulo ||
          !link
        ) {
          return;
        }

        noticias.push({
          titulo,
          url: link,
          imagem: "",
        });
      }
    );

    return noticias.slice(
      0,
      MAX_CANDIDATOS
    );
  } catch (erro) {
    console.log(
      "⚠️ Google News Fortnite falhou:",
      erro.message
    );

    return [];
  }
}

// ============================================================
// CICLO FORTNITE
// ============================================================

async function cicloFortnite() {
  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

  try {
    let noticias =
      await buscarFortniteGG();

    if (
      !noticias.length
    ) {
      console.log(
        "↩️ Fortnite.GG falhou. Tentando oficial..."
      );

      noticias =
        await buscarFortniteOficial();
    }

    if (
      !noticias.length
    ) {
      console.log(
        "↩️ Fortnite oficial falhou. Tentando Google News..."
      );

      noticias =
        await buscarFortniteGoogle();
    }

    if (
      !noticias.length
    ) {
      console.log(
        "⚠️ Fortnite: nenhuma notícia encontrada."
      );

      return;
    }

    let publicadas =
      0;

    for (
      const noticia of noticias
    ) {
      if (
        publicadas >=
        MAX_NOTICIAS_POR_FONTE
      ) {
        break;
      }

      const publicou =
        await publicarNoticia(
          "FORTNITE",
          noticia
        );

      if (publicou) {
        publicadas++;
      }
    }

    console.log(
      `📊 Fortnite: ${publicadas} notícia(s) nova(s) publicada(s).`
    );
  } catch (erro) {
    console.error(
      "❌ Erro geral Fortnite:",
      erro.message
    );
  }
}

// ============================================================
// LIBERTYCITY
// ============================================================

async function buscarLibertyCity() {
  console.log(
    "🔎 LibertyCity: tentando navegador..."
  );

  const pagina =
    await abrirPagina(
      "https://pt.libertycity.net/news/",
      {
        timeout: 25000,
        espera: 1800,
      }
    );

  if (!pagina) {
    return [];
  }

  try {
    const noticias =
      await pagina.evaluate(
        () => {
          const resultado =
            [];

          const vistos =
            new Set();

          document
            .querySelectorAll(
              'a[href*="/news/"]'
            )
            .forEach(
              (a) => {
                try {
                  const href =
                    a.href ||
                    "";

                  if (
                    !href.includes(
                      "pt.libertycity.net/news/"
                    )
                  ) {
                    return;
                  }

                  if (
                    href.endsWith(
                      "/news/"
                    ) ||
                    href.endsWith(
                      "/news"
                    ) ||
                    href.endsWith(
                      "/news/#"
                    )
                  ) {
                    return;
                  }

                  // Só aceita matérias reais
                  if (
                    !/\.html(?:[?#]|$)/i.test(
                      href
                    )
                  ) {
                    return;
                  }

                  const tituloElemento =
                    a.querySelector(
                      "h1,h2,h3,h4,h5,h6"
                    );

                  let titulo =
                    tituloElemento
                      ?.textContent ||
                    a.innerText ||
                    "";

                  titulo =
                    titulo
                      .replace(
                        /\s+/g,
                        " "
                      )
                      .trim();

                  if (
                    !titulo ||
                    titulo.length <
                      15 ||
                    titulo.length >
                      250
                  ) {
                    return;
                  }

                  const invalidos = [
                    "notícias",
                    "noticia",
                    "home",
                    "próxima página",
                    "next page",
                    "1",
                    "2",
                    "3",
                    "4",
                    "5",
                  ];

                  if (
                    invalidos.includes(
                      titulo.toLowerCase()
                    )
                  ) {
                    return;
                  }

                  if (
                    vistos.has(
                      href
                    )
                  ) {
                    return;
                  }

                  vistos.add(
                    href
                  );

                  const img =
                    a.querySelector(
                      "img"
                    );

                  resultado.push({
                    titulo,
                    url: href,
                    imagem:
                      img?.currentSrc ||
                      img?.src ||
                      img?.getAttribute(
                        "data-src"
                      ) ||
                      "",
                    descricao: "",
                  });
                } catch {}
              }
            );

          return resultado.slice(
            0,
            30
          );
        }
      );

    await pagina
      .close()
      .catch(() => {});

    console.log(
      `🔎 LibertyCity Puppeteer: ${noticias.length} candidatos.`
    );

    return noticias;
  } catch (erro) {
    await pagina
      .close()
      .catch(() => {});

    console.log(
      "⚠️ LibertyCity Puppeteer falhou:",
      erro.message
    );

    return [];
  }
}

// ============================================================
// LIBERTYCITY AXIOS
// ============================================================

async function buscarLibertyCityAxios() {
  try {
    const resposta =
      await axiosGet(
        "https://pt.libertycity.net/news/",
        1
      );

    if (!resposta) {
      return [];
    }

    const $ =
      cheerio.load(
        resposta.data
      );

    const noticias =
      [];

    const vistos =
      new Set();

    $("a[href*='/news/']").each(
      (_, el) => {
        try {
          const href =
            $(el).attr(
              "href"
            ) || "";

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
            !href ||
            !titulo ||
            titulo.length <
              15 ||
            titulo.length >
              250
          ) {
            return;
          }

          const url =
            new URL(
              href,
              "https://pt.libertycity.net"
            ).href;

          if (
            !/\.html(?:[?#]|$)/i.test(
              url
            )
          ) {
            return;
          }

          if (
            vistos.has(url)
          ) {
            return;
          }

          vistos.add(url);

          const imagem =
            $(el)
              .find("img")
              .first()
              .attr("src") ||
            "";

          noticias.push({
            titulo,
            url,
            imagem,
            descricao: "",
          });
        } catch {}
      }
    );

    return noticias.slice(
      0,
      MAX_CANDIDATOS
    );
  } catch {
    return [];
  }
}

// ============================================================
// CICLO LIBERTYCITY
// ============================================================

async function cicloLibertyCity() {
  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  try {
    let noticias =
      await buscarLibertyCity();

    if (
      !noticias.length
    ) {
      console.log(
        "↩️ LibertyCity: usando Axios..."
      );

      noticias =
        await buscarLibertyCityAxios();
    }

    if (
      !noticias.length
    ) {
      console.log(
        "⚠️ GTA: nenhuma notícia encontrada."
      );

      return;
    }

    let publicadas =
      0;

    for (
      const noticia of noticias
    ) {
      if (
        publicadas >=
        MAX_NOTICIAS_POR_FONTE
      ) {
        break;
      }

      const publicou =
        await publicarNoticia(
          "GTA",
          noticia
        );

      if (publicou) {
        publicadas++;
      }
    }

    console.log(
      `📊 LibertyCity: ${publicadas} notícia(s) nova(s) publicada(s).`
    );
  } catch (erro) {
    console.error(
      "❌ Erro geral LibertyCity:",
      erro.message
    );
  }
}

// ============================================================
// ROCKSTAR NEWSWIRE
// ============================================================

async function buscarRockstar() {
  console.log(
    "🔎 Rockstar: abrindo Newswire..."
  );

  const pagina =
    await abrirPagina(
      "https://www.rockstargames.com/br/newswire",
      {
        timeout: 30000,
        espera: 4000,
      }
    );

  if (!pagina) {
    return [];
  }

  try {
    const noticias =
      await pagina.evaluate(
        () => {
          const resultado =
            [];

          const vistos =
            new Set();

          const links =
            document.querySelectorAll(
              'a[href*="/newswire/article/"]'
            );

          for (
            const a of links
          ) {
            try {
              let href =
                a.href || "";

              if (
                !href.includes(
                  "/newswire/article/"
                )
              ) {
                continue;
              }

              href =
                href.split("?")[0];

              if (
                vistos.has(
                  href
                )
              ) {
                continue;
              }

              // =================================================
              // TÍTULO
              // =================================================

              const heading =
                a.querySelector(
                  "h1,h2,h3,h4,h5,h6"
                );

              let titulo =
                heading?.textContent ||
                "";

              if (!titulo) {
                titulo =
                  a.innerText ||
                  "";
              }

              titulo =
                titulo
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim();

              if (
                !titulo ||
                titulo.length <
                  10 ||
                titulo.length >
                  250
              ) {
                continue;
              }

              // =================================================
              // FILTROS
              // =================================================

              const tituloLower =
                titulo.toLowerCase();

              const ignorados = [
                "próxima página",
                "próxima página →",
                "next page",
                "next page →",
                "previous page",
                "previous page →",
                "access denied",
              ];

              if (
                ignorados.includes(
                  tituloLower
                )
              ) {
                continue;
              }

              // =================================================
              // FILTRO GTA
              // =================================================

              const ehGTA =
                tituloLower.includes(
                  "gta"
                ) ||
                tituloLower.includes(
                  "grand theft auto"
                ) ||
                tituloLower.includes(
                  "los santos"
                ) ||
                tituloLower.includes(
                  "vice city"
                ) ||
                tituloLower.includes(
                  "gta online"
                ) ||
                tituloLower.includes(
                  "gta+"
                );

              if (!ehGTA) {
                continue;
              }

              // =================================================
              // IMAGEM DO CARD
              // =================================================

              const imagens =
                Array.from(
                  a.querySelectorAll(
                    "img"
                  )
                );

              let imagem =
                "";

              for (
                const img of imagens
              ) {
                const candidatos = [
                  img.currentSrc,
                  img.src,
                  img.getAttribute(
                    "data-src"
                  ),
                  img.getAttribute(
                    "data-lazy-src"
                  ),
                  img.getAttribute(
                    "data-original"
                  ),
                  img.getAttribute(
                    "data-image"
                  ),
                ];

                const encontrada =
                  candidatos.find(
                    (x) =>
                      x &&
                      typeof x ===
                        "string" &&
                      /^https?:\/\//i.test(
                        x
                      )
                  );

                if (
                  encontrada
                ) {
                  imagem =
                    encontrada;

                  break;
                }
              }

              // =================================================
              // DESCRIÇÃO DO CARD
              // =================================================

              let descricao =
                "";

              const p =
                a.querySelector(
                  "p"
                );

              if (p) {
                descricao =
                  p.innerText ||
                  "";
              }

              descricao =
                descricao
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim();

              vistos.add(
                href
              );

              resultado.push({
                titulo,
                url: href,
                imagem,
                descricao,
              });
            } catch {}
          }

          return resultado.slice(
            0,
            20
          );
        }
      );

    await pagina
      .close()
      .catch(() => {});

    console.log(
      `🔎 Rockstar: ${noticias.length} artigos GTA encontrados.`
    );

    // Mostra no log se a imagem foi capturada
    for (
      const noticia of noticias
    ) {
      console.log(
        `🖼️ ${
          noticia.imagem
            ? "COM imagem"
            : "SEM imagem"
        } | ${noticia.titulo}`
      );
    }

    return noticias;
  } catch (erro) {
    await pagina
      .close()
      .catch(() => {});

    console.log(
      "⚠️ Rockstar Newswire falhou:",
      erro.message
    );

    return [];
  }
}

// ============================================================
// ROCKSTAR GOOGLE NEWS
// ============================================================

async function buscarRockstarGoogle() {
  try {
    console.log(
      "↩️ Rockstar: usando Google News..."
    );

    const rss =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(
        'site:rockstargames.com/br/newswire/article "GTA"'
      ) +
      "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

    const resposta =
      await axiosGet(
        rss,
        1
      );

    if (!resposta) {
      return [];
    }

    const $ =
      cheerio.load(
        resposta.data,
        {
          xmlMode: true,
        }
      );

    const resultado =
      [];

    $("item").each(
      (_, item) => {
        const titulo =
          limparTexto(
            $(item)
              .find("title")
              .text()
          );

        const link =
          limparTexto(
            $(item)
              .find("link")
              .text()
          );

        if (
          !titulo ||
          !link
        ) {
          return;
        }

        if (
          !/gta|grand theft auto|los santos|vice city/i.test(
            titulo
          )
        ) {
          return;
        }

        resultado.push({
          titulo,
          url: link,
          imagem: "",
          descricao: "",
        });
      }
    );

    return resultado.slice(
      0,
      MAX_CANDIDATOS
    );
  } catch (erro) {
    console.log(
      "⚠️ Rockstar Google News falhou:",
      erro.message
    );

    return [];
  }
}

// ============================================================
// CICLO ROCKSTAR
// ============================================================

async function cicloRockstar() {
  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  try {
    let noticias =
      await buscarRockstar();

    if (
      !noticias.length
    ) {
      console.log(
        "↩️ Rockstar Newswire falhou. Usando fallback..."
      );

      noticias =
        await buscarRockstarGoogle();
    }

    if (
      !noticias.length
    ) {
      console.log(
        "⚠️ Rockstar: nenhuma notícia encontrada."
      );

      return;
    }

    let publicadas =
      0;

    for (
      const noticia of noticias
    ) {
      if (
        publicadas >=
        MAX_NOTICIAS_POR_FONTE
      ) {
        break;
      }

      const publicou =
        await publicarNoticia(
          "GTA",
          noticia
        );

      if (publicou) {
        publicadas++;
      }
    }

    console.log(
      `📊 Rockstar: ${publicadas} notícia(s) nova(s) publicada(s).`
    );
  } catch (erro) {
    console.error(
      "❌ Erro geral Rockstar:",
      erro.message
    );
  }
}

// ============================================================
// LOJA FORTNITE
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
            "Murilito NEWS • Loja Fortnite",
        })
        .setTimestamp();

    await canal.send({
      content:
        "@everyone 🛒 **CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR!** 🔥",
      embeds: [embed],
    });

    console.log(
      "🛒 Loja do Fortnite publicada."
    );

    return true;
  } catch (erro) {
    console.error(
      "❌ Erro ao publicar loja:",
      erro.message
    );

    return false;
  }
}

// ============================================================
// HORÁRIO DA LOJA
// ============================================================

let ultimaLoja =
  "";

function dataHojeBR() {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(
    new Date()
  );
}

async function verificarHorarioLoja() {
  try {
    const agora =
      new Date();

    const partes =
      new Intl.DateTimeFormat(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      ).formatToParts(
        agora
      );

    const hora =
      Number(
        partes.find(
          (p) =>
            p.type ===
            "hour"
        )?.value
      );

    const minuto =
      Number(
        partes.find(
          (p) =>
            p.type ===
            "minute"
        )?.value
      );

    const hoje =
      dataHojeBR();

    if (
      hora === 21 &&
      minuto === 0 &&
      ultimaLoja !== hoje
    ) {
      const publicou =
        await publicarLoja();

      if (publicou) {
        ultimaLoja =
          hoje;
      }
    }
  } catch (erro) {
    console.error(
      "❌ Erro verificando horário da loja:",
      erro.message
    );
  }
}

// ============================================================
// TRAVA DO CICLO
// ============================================================

let cicloExecutando =
  false;

let proximoCicloAgendado =
  false;

async function cicloNoticias() {
  if (
    cicloExecutando
  ) {
    console.log(
      "⏳ Ciclo já está em andamento. Ignorando nova chamada."
    );

    return;
  }

  cicloExecutando =
    true;

  try {
    console.log(
      "========================================"
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
              "America/Sao_Paulo",
          }
        )
    );

    // ========================================================
    // FORTNITE
    // ========================================================

    try {
      await cicloFortnite();
    } catch (erro) {
      console.error(
        "❌ Fortnite interrompido:",
        erro.message
      );
    }

    // ========================================================
    // LIBERTYCITY
    // ========================================================

    try {
      await cicloLibertyCity();
    } catch (erro) {
      console.error(
        "❌ LibertyCity interrompido:",
        erro.message
      );
    }

    // ========================================================
    // ROCKSTAR
    // ========================================================

    try {
      await cicloRockstar();
    } catch (erro) {
      console.error(
        "❌ Rockstar interrompido:",
        erro.message
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
  } catch (erro) {
    console.error(
      "❌ Erro inesperado no ciclo:",
      erro.message
    );
  } finally {
    cicloExecutando =
      false;
  }
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

      const texto =
        message.content
          .trim()
          .toLowerCase();

      // ======================================================
      // TESTE COMPLETO
      // ======================================================

      if (
        texto === "!teste"
      ) {
        await message.reply(
          "🧪 **Teste completo iniciado!**"
        );

        await cicloNoticias();

        return;
      }

      // ======================================================
      // TESTE FORTNITE
      // ======================================================

      if (
        texto ===
        "!teste fortnite"
      ) {
        await message.reply(
          "🧪 Testando notícias do Fortnite..."
        );

        await cicloFortnite();

        return;
      }

      // ======================================================
      // TESTE LIBERTY
      // ======================================================

      if (
        texto ===
        "!teste liberty"
      ) {
        await message.reply(
          "🧪 Testando LibertyCity..."
        );

        await cicloLibertyCity();

        return;
      }

      // ======================================================
      // TESTE ROCKSTAR
      // ======================================================

      if (
        texto ===
        "!teste rockstar"
      ) {
        await message.reply(
          "🧪 Testando Rockstar Newswire..."
        );

        await cicloRockstar();

        return;
      }

      // ======================================================
      // TESTE LOJA
      // ======================================================

      if (
        texto ===
        "!teste loja"
      ) {
        await message.reply(
          "🧪 Testando publicação da loja..."
        );

        await publicarLoja();

        return;
      }

      // ======================================================
      // PIADA
      // ======================================================

      if (
        texto ===
        "!piada"
      ) {
        const piadas = [
          "🎮 Por que o player foi para a escola? Para aprender a dar **headshot** na prova.",
          "😂 GTA 6 atrasou tanto que o Franklin já virou aposentado.",
          "🤣 Fortnite: onde você pode cair do céu, morrer em 2 segundos e ainda culpar o lag.",
          "🚔 Polícia no GTA: você roubou um carro? ⭐⭐⭐⭐⭐",
          "🎮 O player falou que ia jogar só uma partida... 6 horas depois: ainda está procurando loot.",
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

      // ======================================================
      // AJUDA
      // ======================================================

      if (
        texto ===
        "!ajuda"
      ) {
        await message.reply(
          [
            "🤖 **MURILITO NEWS — COMANDOS**",
            "",
            "🧪 `!teste` — testa tudo",
            "🎮 `!teste fortnite` — testa Fortnite",
            "🚔 `!teste rockstar` — testa Rockstar",
            "📰 `!teste liberty` — testa LibertyCity",
            "🛒 `!teste loja` — testa a loja",
            "😂 `!piada` — manda uma piada",
            "❓ `!ajuda` — mostra os comandos",
          ].join(
            "\n"
          )
        );

        return;
      }
    } catch (erro) {
      console.error(
        "❌ Erro no comando:",
        erro.message
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

    // ========================================================
    // PRIMEIRO CICLO
    // ========================================================

    await cicloNoticias();

    // ========================================================
    // CICLO AUTOMÁTICO
    // ========================================================

    if (
      !proximoCicloAgendado
    ) {
      proximoCicloAgendado =
        true;

      setInterval(
        async () => {
          if (
            cicloExecutando
          ) {
            console.log(
              "⏳ O ciclo anterior ainda está rodando. Este ciclo será ignorado."
            );

            return;
          }

          await cicloNoticias();
        },
        INTERVALO_NOTICIAS
      );
    }

    // ========================================================
    // LOJA
    // ========================================================

    setInterval(
      async () => {
        await verificarHorarioLoja();
      },
      30000
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
// PROTEÇÃO CONTRA ERROS
// ============================================================

process.on(
  "unhandledRejection",
  (erro) => {
    console.error(
      "⚠️ UNHANDLED REJECTION:",
      erro
    );
  }
);

process.on(
  "uncaughtException",
  (erro) => {
    console.error(
      "⚠️ UNCAUGHT EXCEPTION:",
      erro
    );
  }
);

// ============================================================
// ENCERRAMENTO
// ============================================================

process.on(
  "SIGTERM",
  async () => {
    console.log(
      "🛑 SIGTERM recebido. Encerrando..."
    );

    await fecharBrowser();

    client.destroy();

    process.exit(0);
  }
);

process.on(
  "SIGINT",
  async () => {
    console.log(
      "🛑 SIGINT recebido. Encerrando..."
    );

    await fecharBrowser();

    client.destroy();

    process.exit(0);
  }
);

// ============================================================
// LOGIN
// ============================================================

client
  .login(TOKEN)
  .catch((erro) => {
    console.error(
      "❌ Falha ao conectar o bot:",
      erro.message
    );

    process.exit(1);
  });
