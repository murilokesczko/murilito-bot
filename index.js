require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const puppeteer = require("puppeteer");

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const TOKEN = process.env.TOKEN;

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const URL_LOJA =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

const URL_FORTNITE =
  "https://www.fortnite.com/news?lang=pt-BR";

const URL_LIBERTYCITY =
  "https://pt.libertycity.net/news/";

const URL_ROCKSTAR =
  "https://www.rockstargames.com/br/newswire";

const MAX_NOTICIAS_POR_FONTE = 3;

// ======================================================
// CLIENT DISCORD
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ======================================================
// BROWSER
// ======================================================

let browser = null;

async function iniciarBrowser() {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch {
      browser = null;
    }
  }

  console.log("🌐 Iniciando navegador Puppeteer...");

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

  console.log("✅ Puppeteer iniciado.");

  return browser;
}

// ======================================================
// UTILIDADES
// ======================================================

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarUrl(url, base) {
  if (!url) return null;

  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

function imagemValida(url) {
  if (!url) return false;

  const texto = url.toLowerCase();

  if (
    texto.startsWith("data:") ||
    texto.includes("favicon") ||
    texto.includes("avatar") ||
    texto.includes("icon") ||
    texto.includes("logo") ||
    texto.includes("discord.com/assets")
  ) {
    return false;
  }

  return (
    texto.startsWith("http://") ||
    texto.startsWith("https://")
  );
}

function escolherImagem(lista) {
  if (!Array.isArray(lista)) {
    return null;
  }

  for (const imagem of lista) {
    if (imagemValida(imagem)) {
      return imagem;
    }
  }

  return null;
}

// ======================================================
// DUPLICADAS
// ======================================================

async function noticiaJaPublicada(
  canal,
  url,
  titulo
) {
  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 100,
      });

    const tituloNormalizado =
      limparTexto(titulo).toLowerCase();

    for (const mensagem of mensagens.values()) {
      if (
        url &&
        mensagem.embeds?.some(
          (embed) => embed.url === url
        )
      ) {
        return true;
      }

      if (
        url &&
        mensagem.content?.includes(url)
      ) {
        return true;
      }

      for (const embed of mensagem.embeds || []) {
        const tituloEmbed =
          limparTexto(
            embed.title || ""
          ).toLowerCase();

        if (
          tituloNormalizado &&
          tituloEmbed &&
          tituloEmbed.includes(
            tituloNormalizado.substring(
              0,
              70
            )
          )
        ) {
          return true;
        }
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

// ======================================================
// FILTRO ROCKSTAR
// ======================================================

function tituloRockstarValido(titulo) {
  if (!titulo) return false;

  const t = limparTexto(titulo).toLowerCase();

  if (t.length < 20) {
    return false;
  }

  const proibidos = [
    "aviso sobre cookies",
    "cookie",
    "cookies",
    "privacy policy",
    "política de privacidade",
    "privacy",
    "terms of service",
    "termos de serviço",
    "sign in",
    "log in",
    "login",
    "create account",
    "criar conta",
    "subscribe",
    "inscreva-se",
    "menu",
    "search",
    "pesquisar",
    "open search",
    "abrir pesquisa",
    "download launcher",
    "obter launcher",
    "rockstar games launcher",
  ];

  for (const proibido of proibidos) {
    if (t.includes(proibido)) {
      return false;
    }
  }

  return true;
}

// ======================================================
// ROCKSTAR — COLETA DOS CARDS
// ======================================================

async function buscarNoticiasRockstar() {
  console.log(
    "🔎 Rockstar: abrindo Newswire..."
  );

  let page = null;

  try {
    const navegador =
      await iniciarBrowser();

    page = await navegador.newPage();

    await page.setViewport({
      width: 1600,
      height: 1200,
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
    );

    console.log(
      `🌐 Rockstar: ${URL_ROCKSTAR}`
    );

    const resposta =
      await page.goto(URL_ROCKSTAR, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

    console.log(
      `🌐 Rockstar status: ${
        resposta
          ? resposta.status()
          : "?"
      }`
    );

    // --------------------------------------------------
    // ESPERA A APLICAÇÃO CARREGAR
    // --------------------------------------------------

    await new Promise((resolve) =>
      setTimeout(resolve, 6000)
    );

    // --------------------------------------------------
    // TIRA ELEMENTOS DE COOKIE / MODAIS
    // --------------------------------------------------

    await page.evaluate(() => {
      const textosProibidos = [
        "aviso sobre cookies",
        "cookie policy",
        "privacy policy",
        "política de privacidade",
      ];

      const elementos =
        document.querySelectorAll(
          "div, section, aside, dialog"
        );

      for (const elemento of elementos) {
        const texto =
          (elemento.innerText || "")
            .trim()
            .toLowerCase();

        if (
          texto.length < 500 &&
          textosProibidos.some((p) =>
            texto.includes(p)
          )
        ) {
          try {
            elemento.remove();
          } catch {}
        }
      }
    });

    // --------------------------------------------------
    // PEGAR SOMENTE LINKS REAIS DE ARTIGOS
    // --------------------------------------------------

    const artigos =
      await page.evaluate(() => {
        const encontrados = [];

        const links =
          document.querySelectorAll(
            'a[href*="/newswire/article/"]'
          );

        for (const a of links) {
          const href =
            a.href || "";

          if (
            !href.includes(
              "/newswire/article/"
            )
          ) {
            continue;
          }

          // ============================================
          // ENCONTRAR O CARD
          // ============================================

          let card = a;

          for (let i = 0; i < 8; i++) {
            if (!card.parentElement) {
              break;
            }

            card = card.parentElement;

            const imgs =
              card.querySelectorAll(
                "img"
              );

            const texto =
              (
                card.innerText || ""
              ).trim();

            if (
              imgs.length > 0 &&
              texto.length > 50
            ) {
              break;
            }
          }

          // ============================================
          // TÍTULO
          // ============================================

          let titulo = "";

          const candidatos = [
            a.querySelector("h1"),
            a.querySelector("h2"),
            a.querySelector("h3"),
            a.querySelector("h4"),
            card.querySelector("h1"),
            card.querySelector("h2"),
            card.querySelector("h3"),
            card.querySelector("h4"),
          ];

          for (
            const elemento of candidatos
          ) {
            const texto =
              elemento?.innerText?.trim();

            if (texto) {
              titulo = texto;
              break;
            }
          }

          if (!titulo) {
            titulo =
              a.getAttribute(
                "aria-label"
              ) ||
              a.getAttribute("title") ||
              "";
          }

          titulo =
            titulo
              .replace(/\s+/g, " ")
              .trim();

          // ============================================
          // IGNORAR COOKIES / MENU
          // ============================================

          const lower =
            titulo.toLowerCase();

          const proibidos = [
            "aviso sobre cookies",
            "cookies",
            "privacy",
            "privacy policy",
            "política de privacidade",
            "terms of service",
            "login",
            "sign in",
            "create account",
            "search",
            "pesquisar",
            "launcher",
          ];

          if (
            proibidos.some((p) =>
              lower.includes(p)
            )
          ) {
            continue;
          }

          if (titulo.length < 20) {
            continue;
          }

          // ============================================
          // IMAGENS
          // ============================================

          const imagens = [];

          const imgs =
            card.querySelectorAll(
              "img"
            );

          for (const img of imgs) {
            const atributos = [
              "src",
              "data-src",
              "data-lazy-src",
              "data-original",
              "data-image",
            ];

            for (
              const atributo of atributos
            ) {
              const valor =
                img.getAttribute(
                  atributo
                );

              if (valor) {
                imagens.push(valor);
              }
            }

            const srcset =
              img.getAttribute(
                "srcset"
              ) ||
              img.getAttribute(
                "data-srcset"
              );

            if (srcset) {
              for (
                const parte of srcset.split(
                  ","
                )
              ) {
                const url =
                  parte
                    .trim()
                    .split(" ")[0];

                if (url) {
                  imagens.push(url);
                }
              }
            }
          }

          // ============================================
          // BACKGROUND IMAGE
          // ============================================

          const elementosComStyle =
            card.querySelectorAll(
              "[style]"
            );

          for (
            const elemento of elementosComStyle
          ) {
            const style =
              elemento.getAttribute(
                "style"
              ) || "";

            const regex =
              /url\(["']?([^"')]+)["']?\)/gi;

            let match;

            while (
              (match =
                regex.exec(style))
            ) {
              if (match[1]) {
                imagens.push(
                  match[1]
                );
              }
            }
          }

          // ============================================
          // RESUMO
          // ============================================

          let resumo = "";

          const paragrafos =
            card.querySelectorAll(
              "p"
            );

          for (
            const p of paragrafos
          ) {
            const texto =
              (
                p.innerText || ""
              )
                .replace(/\s+/g, " ")
                .trim();

            if (
              texto.length >= 40 &&
              texto !== titulo
            ) {
              resumo = texto;
              break;
            }
          }

          // ============================================
          // DATA
          // ============================================

          const cardTexto =
            (
              card.innerText || ""
            )
              .replace(/\s+/g, " ")
              .trim();

          encontrados.push({
            titulo,
            link: href,
            imagens,
            resumo,
            cardTexto,
          });
        }

        // ==============================================
        // REMOVER DUPLICADOS
        // ==============================================

        const unicos = [];
        const vistos =
          new Set();

        for (
          const artigo of encontrados
        ) {
          if (
            vistos.has(
              artigo.link
            )
          ) {
            continue;
          }

          vistos.add(
            artigo.link
          );

          unicos.push(
            artigo
          );
        }

        return unicos;
      });

    console.log(
      `🔎 Rockstar: ${artigos.length} artigos candidatos encontrados.`
    );

    // --------------------------------------------------
    // FILTRAR NOVAMENTE NO NODE
    // --------------------------------------------------

    const noticias = [];

    for (
      const artigo of artigos
    ) {
      if (
        !tituloRockstarValido(
          artigo.titulo
        )
      ) {
        continue;
      }

      let imagem =
        escolherImagem(
          artigo.imagens
        );

      imagem =
        normalizarUrl(
          imagem,
          URL_ROCKSTAR
        );

      let resumo =
        limparTexto(
          artigo.resumo
        );

      if (!resumo) {
        resumo =
          "🚔 Nova notícia publicada pela Rockstar Games.";
      }

      if (
        resumo.length > 600
      ) {
        resumo =
          resumo.substring(
            0,
            597
          ) + "...";
      }

      console.log(
        `📰 Rockstar: ${artigo.titulo}`
      );

      console.log(
        `🖼️ Imagem: ${
          imagem
            ? "SIM"
            : "NÃO"
        }`
      );

      noticias.push({
        titulo:
          artigo.titulo,
        link:
          artigo.link,
        resumo,
        imagem,
      });

      if (
        noticias.length >= 20
      ) {
        break;
      }
    }

    console.log(
      `✅ Rockstar: ${noticias.length} notícias reais após filtro.`
    );

    return noticias;
  } catch (erro) {
    console.log(
      "❌ Erro Rockstar:",
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

// ======================================================
// PUBLICAR GTA
// ======================================================

async function publicarGTA(
  noticia
) {
  const canal =
    await client.channels.fetch(
      ID_GTA
    );

  if (!canal) {
    console.log(
      "❌ Canal GTA não encontrado."
    );

    return false;
  }

  if (
    await noticiaJaPublicada(
      canal,
      noticia.link,
      noticia.titulo
    )
  ) {
    console.log(
      `⏭️ GTA: já publicada: ${noticia.titulo}`
    );

    return false;
  }

  // ====================================================
  // CARD
  // ====================================================

  const embed =
    new EmbedBuilder()
      .setTitle(
        `🚔 ${noticia.titulo}`
      )
      .setURL(
        noticia.link
      )
      .setDescription(
        `${noticia.resumo}\n\n` +
          `👇 **Clique no título acima para ler a matéria completa.**`
      )
      .setFooter({
        text:
          "Murilito NEWS • GTA",
      })
      .setTimestamp();

  // ====================================================
  // IMAGEM
  // ====================================================

  if (
    imagemValida(
      noticia.imagem
    )
  ) {
    console.log(
      `🖼️ GTA usando imagem: ${noticia.imagem}`
    );

    embed.setImage(
      noticia.imagem
    );
  } else {
    console.log(
      "⚠️ GTA sem imagem."
    );
  }

  // ====================================================
  // ENVIO
  // ====================================================

  await canal.send({
    content:
      "@everyone 🚔 **NOVIDADE DO GTA!** 🔥",
    embeds: [
      embed,
    ],
  });

  console.log(
    `✅ GTA publicada: ${noticia.titulo}`
  );

  return true;
}

// ======================================================
// LIBERTYCITY
// ======================================================

async function buscarNoticiasLibertyCity() {
  console.log(
    "🔎 LibertyCity: procurando SOMENTE notícias..."
  );

  let page = null;

  try {
    const navegador =
      await iniciarBrowser();

    page =
      await navegador.newPage();

    await page.setViewport({
      width: 1440,
      height: 1000,
    });

    const resposta =
      await page.goto(
        URL_LIBERTYCITY,
        {
          waitUntil:
            "domcontentloaded",
          timeout: 60000,
        }
      );

    console.log(
      `🌐 LibertyCity status: ${
        resposta
          ? resposta.status()
          : "?"
      }`
    );

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          3000
        )
    );

    const links =
      await page.evaluate(
        () => {
          const resultado =
            [];

          const proibidos = [
            "todos os arquivos",
            "arquivos de autores",
            "melhores arquivos da semana",
            "carregar arquivo",
            "login",
            "register",
            "registrar",
            "pesquisar",
            "search",
          ];

          const anchors =
            document.querySelectorAll(
              'a[href*="/news/"]'
            );

          for (
            const a of anchors
          ) {
            const href =
              a.href || "";

            const titulo =
              (
                a.innerText ||
                a.getAttribute(
                  "title"
                ) ||
                a.getAttribute(
                  "aria-label"
                ) ||
                ""
              )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();

            if (
              !href.includes(
                "/news/"
              )
            ) {
              continue;
            }

            if (
              href.endsWith(
                "/news/"
              ) ||
              href.endsWith(
                "/news/#"
              )
            ) {
              continue;
            }

            const lower =
              titulo.toLowerCase();

            if (
              proibidos.some(
                (p) =>
                  lower.includes(p)
              )
            ) {
              continue;
            }

            if (
              titulo.length < 20
            ) {
              continue;
            }

            resultado.push({
              link: href,
              titulo,
            });
          }

          const unicos =
            [];

          const vistos =
            new Set();

          for (
            const item of resultado
          ) {
            if (
              vistos.has(
                item.link
              )
            ) {
              continue;
            }

            vistos.add(
              item.link
            );

            unicos.push(
              item
            );
          }

          return unicos;
        }
      );

    console.log(
      `🔎 LibertyCity: ${links.length} notícias reais encontradas.`
    );

    const noticias =
      [];

    for (
      const item of links.slice(
        0,
        20
      )
    ) {
      let imagem =
        null;

      let resumo =
        "🚔 Nova notícia sobre GTA e Rockstar Games.";

      try {
        const dados =
          await page.evaluate(
            (link) => {
              const a =
                [
                  ...document.querySelectorAll(
                    'a[href*="/news/"]'
                  ),
                ].find(
                  (x) =>
                    x.href ===
                    link
                );

              if (!a)
                return null;

              let card =
                a;

              for (
                let i = 0;
                i < 6;
                i++
              ) {
                if (
                  !card.parentElement
                )
                  break;

                card =
                  card.parentElement;

                if (
                  card.querySelector(
                    "img"
                  )
                ) {
                  break;
                }
              }

              const imagens =
                [];

              for (
                const img of card.querySelectorAll(
                  "img"
                )
              ) {
                const src =
                  img.getAttribute(
                    "src"
                  );

                const dataSrc =
                  img.getAttribute(
                    "data-src"
                  );

                if (src)
                  imagens.push(
                    src
                  );

                if (dataSrc)
                  imagens.push(
                    dataSrc
                  );
              }

              const paragrafos =
                [
                  ...card.querySelectorAll(
                    "p"
                  ),
                ];

              let resumo =
                "";

              for (
                const p of paragrafos
              ) {
                const texto =
                  (
                    p.innerText ||
                    ""
                  )
                    .replace(
                      /\s+/g,
                      " "
                    )
                    .trim();

                if (
                  texto.length >
                    40
                ) {
                  resumo =
                    texto;

                  break;
                }
              }

              return {
                imagens,
                resumo,
              };
            },
            item.link
          );

        imagem =
          escolherImagem(
            dados?.imagens ||
              []
          );

        imagem =
          normalizarUrl(
            imagem,
            URL_LIBERTYCITY
          );

        if (
          dados?.resumo
        ) {
          resumo =
            limparTexto(
              dados.resumo
            );
        }
      } catch {}

      if (
        resumo.length >
        600
      ) {
        resumo =
          resumo.substring(
            0,
            597
          ) + "...";
      }

      noticias.push({
        titulo:
          item.titulo,
        link:
          item.link,
        resumo,
        imagem,
      });
    }

    return noticias;
  } catch (erro) {
    console.log(
      "❌ Erro LibertyCity:",
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

// ======================================================
// FORTNITE
// ======================================================

async function buscarNoticiasFortnite() {
  console.log(
    "🔎 Fortnite: tentando página oficial..."
  );

  let page = null;

  try {
    const navegador =
      await iniciarBrowser();

    page =
      await navegador.newPage();

    await page.setViewport({
      width: 1440,
      height: 1000,
    });

    const resposta =
      await page.goto(
        URL_FORTNITE,
        {
          waitUntil:
            "domcontentloaded",
          timeout: 60000,
        }
      );

    console.log(
      `🌐 Fortnite status: ${
        resposta
          ? resposta.status()
          : "?"
      }`
    );

    if (
      resposta &&
      resposta.status() >= 400
    ) {
      console.log(
        "⚠️ Fortnite bloqueado pela proteção da Epic."
      );

      return [];
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          5000
        )
    );

    const links =
      await page.evaluate(
        () => {
          const resultado =
            [];

          const anchors =
            document.querySelectorAll(
              'a[href*="/news/"]'
            );

          for (
            const a of anchors
          ) {
            const href =
              a.href || "";

            const titulo =
              (
                a.innerText ||
                a.getAttribute(
                  "aria-label"
                ) ||
                a.getAttribute(
                  "title"
                ) ||
                ""
              )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();

            if (
              !href.includes(
                "/news/"
              )
            )
              continue;

            if (
              href.endsWith(
                "/news/"
              ) ||
              href.includes(
                "/news?"
              )
            )
              continue;

            if (
              titulo.length < 15
            )
              continue;

            resultado.push({
              link: href,
              titulo,
            });
          }

          const unicos =
            [];

          const vistos =
            new Set();

          for (
            const item of resultado
          ) {
            if (
              vistos.has(
                item.link
              )
            )
              continue;

            vistos.add(
              item.link
            );

            unicos.push(
              item
            );
          }

          return unicos;
        }
      );

    console.log(
      `🔎 Fortnite: ${links.length} links encontrados.`
    );

    return links
      .slice(0, 20)
      .map(
        (item) => ({
          titulo:
            item.titulo,
          link:
            item.link,
          resumo:
            "🔥 Nova notícia do Fortnite!",
          imagem:
            null,
        })
      );
  } catch (erro) {
    console.log(
      "❌ Erro Fortnite:",
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

// ======================================================
// PUBLICAR FORTNITE
// ======================================================

async function publicarFortnite(
  noticia
) {
  const canal =
    await client.channels.fetch(
      ID_FORTNITE
    );

  if (!canal)
    return false;

  if (
    await noticiaJaPublicada(
      canal,
      noticia.link,
      noticia.titulo
    )
  ) {
    console.log(
      `⏭️ Fortnite: já publicada: ${noticia.titulo}`
    );

    return false;
  }

  const embed =
    new EmbedBuilder()
      .setTitle(
        `🎮 ${noticia.titulo}`
      )
      .setURL(
        noticia.link
      )
      .setDescription(
        `${noticia.resumo}\n\n` +
          `👇 **Clique no título acima para ler a matéria completa.**`
      )
      .setFooter({
        text:
          "Murilito NEWS • Fortnite",
      })
      .setTimestamp();

  if (
    imagemValida(
      noticia.imagem
    )
  ) {
    embed.setImage(
      noticia.imagem
    );
  }

  await canal.send({
    content:
      "@everyone 🎮 **NOVIDADE DO FORTNITE!** 🔥",
    embeds: [
      embed,
    ],
  });

  console.log(
    `✅ Fortnite publicada: ${noticia.titulo}`
  );

  return true;
}

// ======================================================
// PROCESSAR GTA
// ======================================================

async function processarGTA() {
  let total = 0;

  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  const liberty =
    await buscarNoticiasLibertyCity();

  let novasLiberty = 0;

  for (
    const noticia of liberty
  ) {
    if (
      novasLiberty >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    const publicou =
      await publicarGTA(
        noticia
      );

    if (publicou) {
      total++;
      novasLiberty++;
    }
  }

  console.log(
    `📊 GTA LibertyCity: ${novasLiberty} notícia(s) nova(s) publicada(s).`
  );

  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  const rockstar =
    await buscarNoticiasRockstar();

  let novasRockstar = 0;

  for (
    const noticia of rockstar
  ) {
    if (
      novasRockstar >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    const publicou =
      await publicarGTA(
        noticia
      );

    if (publicou) {
      total++;
      novasRockstar++;
    }
  }

  console.log(
    `📊 Rockstar: ${novasRockstar} notícia(s) nova(s) publicada(s).`
  );

  return total;
}

// ======================================================
// LOJA
// ======================================================

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal)
      return;

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setDescription(
          "🔥 A loja do Fortnite foi atualizada!\n\n" +
            "👇 **Clique no título acima para conferir a loja completa.**"
        )
        .setURL(
          URL_LOJA
        )
        .setImage(
          "https://fortnite.gg/img/og-shop.jpg"
        )
        .setFooter({
          text:
            "Murilito NEWS • Fortnite",
        })
        .setTimestamp();

    await canal.send({
      content:
        "🛒 **LOJA DO FORTNITE ATUALIZADA!**",
      embeds: [
        embed,
      ],
    });

    console.log(
      "🛒 Loja do Fortnite publicada."
    );
  } catch (erro) {
    console.log(
      "❌ Erro loja:",
      erro.message
    );
  }
}

// ======================================================
// CICLO
// ======================================================

let cicloRodando =
  false;

async function cicloNoticias() {
  if (cicloRodando) {
    console.log(
      "⚠️ Ciclo anterior ainda está rodando."
    );

    return;
  }

  cicloRodando =
    true;

  try {
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

    // ================================================
    // FORTNITE
    // ================================================

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );

    const fortnite =
      await buscarNoticiasFortnite();

    let novasFortnite =
      0;

    for (
      const noticia of fortnite
    ) {
      if (
        novasFortnite >=
        MAX_NOTICIAS_POR_FONTE
      )
        break;

      const publicou =
        await publicarFortnite(
          noticia
        );

      if (publicou) {
        novasFortnite++;
      }
    }

    if (
      novasFortnite === 0
    ) {
      console.log(
        "❌ Nenhuma notícia Fortnite nova."
      );
    }

    // ================================================
    // GTA
    // ================================================

    const totalGTA =
      await processarGTA();

    console.log(
      `📊 GTA TOTAL: ${totalGTA} notícia(s) nova(s) publicada(s).`
    );

    console.log(
      "📰 CICLO FINALIZADO"
    );
  } catch (erro) {
    console.log(
      "❌ ERRO NO CICLO:",
      erro
    );
  } finally {
    cicloRodando =
      false;
  }
}

// ======================================================
// COMANDOS
// ======================================================

client.on(
  "messageCreate",
  async (message) => {
    if (
      message.author.bot
    )
      return;

    const texto =
      message.content
        .trim()
        .toLowerCase();

    if (
      texto === "!teste"
    ) {
      await message.reply(
        "🤖 **Murilito NEWS está funcionando!**"
      );

      return;
    }

    if (
      texto ===
      "!teste rockstar"
    ) {
      await message.reply(
        "🚔 Testando o card da Rockstar..."
      );

      const noticias =
        await buscarNoticiasRockstar();

      if (
        !noticias.length
      ) {
        await message.reply(
          "❌ Não encontrei notícias da Rockstar."
        );

        return;
      }

      const noticia =
        noticias[0];

      console.log(
        "🧪 TESTE ROCKSTAR:"
      );

      console.log(
        noticia
      );

      await message.reply(
        `🧪 **Teste encontrado:**\n🚔 ${noticia.titulo}\n🖼️ Imagem: ${
          noticia.imagem
            ? "SIM"
            : "NÃO"
        }`
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

      const noticias =
        await buscarNoticiasLibertyCity();

      if (
        !noticias.length
      ) {
        await message.reply(
          "❌ Nenhuma notícia encontrada."
        );

        return;
      }

      await message.reply(
        `📰 Encontrei **${noticias.length}** notícias reais no LibertyCity.`
      );

      return;
    }

    if (
      texto ===
      "!teste fortnite"
    ) {
      await message.reply(
        "🎮 Testando Fortnite..."
      );

      const noticias =
        await buscarNoticiasFortnite();

      if (
        !noticias.length
      ) {
        await message.reply(
          "❌ Fortnite está bloqueando o acesso do Railway neste momento."
        );

        return;
      }

      await publicarFortnite(
        noticias[0]
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

      await publicarLoja();

      return;
    }

    if (
      texto === "!piada"
    ) {
      const piadas = [
        "😂 O GTA 6 vai sair antes do meu PC conseguir rodar no ultra.",
        "🤣 O Fortnite atualizou de novo e meu SSD pediu demissão.",
        "🚔 A polícia do GTA viu meu personagem e já sabe que vai dar merda.",
        "🎮 Meu FPS caiu tanto que virou apresentação de slides.",
        "😂 Minha placa de vídeo não esquenta, ela trabalha em home office no inferno.",
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

    if (
      texto === "!ajuda"
    ) {
      await message.reply(
        "🤖 **COMANDOS MURILITO NEWS**\n\n" +
          "`!teste` — Testa o bot\n" +
          "`!teste rockstar` — Testa card Rockstar\n" +
          "`!teste liberty` — Testa LibertyCity\n" +
          "`!teste fortnite` — Testa Fortnite\n" +
          "`!teste loja` — Testa loja\n" +
          "`!piada` — Piada 😂"
      );

      return;
    }
  }
);

// ======================================================
// ONLINE
// ======================================================

client.once(
  "ready",
  async () => {
    console.log(
      `🤖 ${client.user.tag} está ONLINE!`
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
      "📰 Sistema automático de notícias iniciado."
    );

    setTimeout(
      () => {
        cicloNoticias();
      },
      10000
    );

    setInterval(
      () => {
        cicloNoticias();
      },
      10 * 60 * 1000
    );

    // ================================================
    // LOJA 21:00
    // ================================================

    setInterval(
      () => {
        const agora =
          new Date();

        const brasil =
          new Date(
            agora.toLocaleString(
              "en-US",
              {
                timeZone:
                  "America/Sao_Paulo",
              }
            )
          );

        const hora =
          brasil.getHours();

        const minuto =
          brasil.getMinutes();

        if (
          hora === 21 &&
          minuto === 0
        ) {
          publicarLoja();
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
  console.error(
    "❌ ERRO: variável TOKEN não encontrada."
  );

  process.exit(1);
}

client.login(
  TOKEN
);
