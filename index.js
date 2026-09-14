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

// Quantas notícias novas podem ser publicadas por ciclo
const MAX_NOTICIAS_POR_FONTE = 3;

// ======================================================
// DISCORD
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ======================================================
// NAVEGADOR
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

function normalizarUrl(url, base) {
  if (!url) return null;

  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

function limparTexto(texto) {
  if (!texto) return "";

  return texto
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function imagemValida(url) {
  if (!url) return false;

  const u = url.toLowerCase();

  if (
    u.includes("data:image") ||
    u.includes("avatar") ||
    u.includes("logo") ||
    u.includes("icon") ||
    u.includes("favicon") ||
    u.includes("discord.com/assets")
  ) {
    return false;
  }

  return (
    u.startsWith("http://") ||
    u.startsWith("https://")
  );
}

function escolherImagem(imagens) {
  if (!Array.isArray(imagens)) return null;

  for (const imagem of imagens) {
    if (imagemValida(imagem)) {
      return imagem;
    }
  }

  return null;
}

// ======================================================
// VERIFICAR DUPLICADAS
// ======================================================

async function noticiaJaPublicada(canal, url, titulo) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    const tituloLimpo = limparTexto(titulo)
      .toLowerCase()
      .substring(0, 80);

    for (const mensagem of mensagens.values()) {
      if (url && mensagem.content?.includes(url)) {
        return true;
      }

      for (const embed of mensagem.embeds || []) {
        if (
          embed.url &&
          url &&
          embed.url === url
        ) {
          return true;
        }

        const embedTitulo = limparTexto(
          embed.title || ""
        )
          .toLowerCase()
          .substring(0, 80);

        if (
          tituloLimpo &&
          embedTitulo &&
          embedTitulo.includes(tituloLimpo)
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
// PEGAR IMAGEM/TEXTO DO CARD
// ======================================================

async function extrairCardDaPagina(
  page,
  link,
  seletorBase
) {
  try {
    return await page.evaluate(
      ({ link, seletorBase }) => {
        const anchors = [
          ...document.querySelectorAll(seletorBase),
        ];

        const anchor = anchors.find((a) => {
          const href = a.href || "";
          return href === link;
        });

        if (!anchor) {
          return null;
        }

        let container = anchor;

        // Sobe alguns níveis tentando encontrar
        // o card inteiro da notícia.
        for (let i = 0; i < 7; i++) {
          if (!container.parentElement) break;

          container = container.parentElement;

          const imagens = [
            ...container.querySelectorAll("img"),
          ];

          const texto = (
            container.innerText || ""
          ).trim();

          if (
            imagens.length > 0 &&
            texto.length > 40
          ) {
            break;
          }
        }

        // ----------------------------------------------
        // TÍTULO
        // ----------------------------------------------

        let titulo = "";

        const possiveisTitulos = [
          anchor.querySelector("h1"),
          anchor.querySelector("h2"),
          anchor.querySelector("h3"),
          anchor.querySelector("h4"),
          container.querySelector("h1"),
          container.querySelector("h2"),
          container.querySelector("h3"),
          container.querySelector("h4"),
        ];

        for (const elemento of possiveisTitulos) {
          if (elemento?.innerText?.trim()) {
            titulo = elemento.innerText.trim();
            break;
          }
        }

        if (!titulo) {
          titulo =
            anchor.getAttribute("aria-label") ||
            anchor.getAttribute("title") ||
            anchor.innerText ||
            "";
        }

        titulo = titulo
          .replace(/\s+/g, " ")
          .trim();

        // ----------------------------------------------
        // IMAGENS
        // ----------------------------------------------

        const imagens = [];

        for (const img of container.querySelectorAll(
          "img"
        )) {
          const atributos = [
            img.getAttribute("src"),
            img.getAttribute("data-src"),
            img.getAttribute("data-lazy-src"),
            img.getAttribute("data-original"),
            img.getAttribute("data-image"),
          ];

          for (const valor of atributos) {
            if (valor) imagens.push(valor);
          }

          const srcset =
            img.getAttribute("srcset") ||
            img.getAttribute("data-srcset");

          if (srcset) {
            const partes = srcset.split(",");

            for (const parte of partes) {
              const url = parte.trim().split(" ")[0];

              if (url) imagens.push(url);
            }
          }
        }

        // Também procura background-image
        for (const elemento of container.querySelectorAll(
          "[style]"
        )) {
          const style =
            elemento.getAttribute("style") || "";

          const encontrados = style.match(
            /url\(["']?([^"')]+)["']?\)/gi
          );

          if (encontrados) {
            for (const item of encontrados) {
              const match = item.match(
                /url\(["']?([^"')]+)["']?\)/i
              );

              if (match?.[1]) {
                imagens.push(match[1]);
              }
            }
          }
        }

        // ----------------------------------------------
        // RESUMO
        // ----------------------------------------------

        let resumo = "";

        const metaDescription =
          container.querySelector(
            'meta[name="description"]'
          );

        if (metaDescription) {
          resumo =
            metaDescription.getAttribute("content") ||
            "";
        }

        if (!resumo) {
          const paragrafos = [
            ...container.querySelectorAll("p"),
          ];

          for (const p of paragrafos) {
            const texto = (
              p.innerText || ""
            )
              .replace(/\s+/g, " ")
              .trim();

            if (
              texto.length >= 50 &&
              texto !== titulo
            ) {
              resumo = texto;
              break;
            }
          }
        }

        if (!resumo) {
          resumo =
            container.innerText
              ?.replace(/\s+/g, " ")
              .trim() || "";
        }

        return {
          titulo,
          resumo,
          imagens,
        };
      },
      {
        link,
        seletorBase,
      }
    );
  } catch (erro) {
    console.log(
      "⚠️ Erro extraindo card:",
      erro.message
    );

    return null;
  }
}

// ======================================================
// FORTNITE
// ======================================================

async function buscarNoticiasFortnite() {
  console.log(
    "🔎 Fortnite: abrindo página oficial de notícias..."
  );

  let page = null;

  try {
    const browser = await iniciarBrowser();

    page = await browser.newPage();

    await page.setViewport({
      width: 1440,
      height: 1000,
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
    );

    console.log(
      `🌐 Fortnite: ${URL_FORTNITE}`
    );

    const resposta = await page.goto(
      URL_FORTNITE,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

    console.log(
      `🌐 Fortnite status: ${
        resposta ? resposta.status() : "?"
      }`
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 5000)
    );

    const links = await page.evaluate(() => {
      const resultado = [];

      const anchors = [
        ...document.querySelectorAll(
          'a[href*="/news/"]'
        ),
      ];

      for (const a of anchors) {
        const href = a.href || "";

        if (!href.includes("/news/")) continue;

        if (
          href.includes("/news?") ||
          href.endsWith("/news/") ||
          href.endsWith("/news")
        ) {
          continue;
        }

        const texto =
          a.innerText ||
          a.getAttribute("aria-label") ||
          a.getAttribute("title") ||
          "";

        const titulo = texto
          .replace(/\s+/g, " ")
          .trim();

        if (titulo.length < 15) continue;

        resultado.push({
          link: href,
          titulo,
        });
      }

      const unicos = [];
      const vistos = new Set();

      for (const item of resultado) {
        if (vistos.has(item.link)) continue;

        vistos.add(item.link);
        unicos.push(item);
      }

      return unicos.slice(0, 30);
    });

    console.log(
      `🔎 Fortnite: ${links.length} links encontrados.`
    );

    const noticias = [];

    for (const item of links.slice(
      0,
      MAX_NOTICIAS_POR_FONTE + 5
    )) {
      try {
        const dados = await extrairCardDaPagina(
          page,
          item.link,
          'a[href*="/news/"]'
        );

        const titulo =
          dados?.titulo || item.titulo;

        let imagem = escolherImagem(
          dados?.imagens || []
        );

        imagem = normalizarUrl(
          imagem,
          URL_FORTNITE
        );

        let resumo = limparTexto(
          dados?.resumo || ""
        );

        if (resumo.length > 500) {
          resumo =
            resumo.substring(0, 497) + "...";
        }

        noticias.push({
          titulo,
          link: item.link,
          resumo,
          imagem,
        });
      } catch {
        noticias.push({
          titulo: item.titulo,
          link: item.link,
          resumo:
            "🔥 Nova notícia do Fortnite!",
          imagem: null,
        });
      }
    }

    return noticias;
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

async function publicarFortnite(noticia) {
  const canal =
    await client.channels.fetch(ID_FORTNITE);

  if (!canal) {
    console.log(
      "❌ Canal Fortnite não encontrado."
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
      `⏭️ Fortnite: já publicada: ${noticia.titulo}`
    );

    return false;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${noticia.titulo}`)
    .setURL(noticia.link)
    .setDescription(
      `${noticia.resumo || "🔥 Nova notícia do Fortnite!"}\n\n` +
        `👇 **Clique no título acima para ler a matéria completa.**`
    )
    .setFooter({
      text: "Murilito NEWS • Fortnite",
    })
    .setTimestamp();

  if (imagemValida(noticia.imagem)) {
    embed.setImage(noticia.imagem);
  }

  await canal.send({
    content:
      "@everyone 🎮 **NOVIDADE DO FORTNITE!** 🔥",
    embeds: [embed],
  });

  console.log(
    `✅ Fortnite publicada: ${noticia.titulo}`
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
    const browser = await iniciarBrowser();

    page = await browser.newPage();

    await page.setViewport({
      width: 1440,
      height: 1000,
    });

    const resposta = await page.goto(
      URL_LIBERTYCITY,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

    console.log(
      `🌐 LibertyCity status: ${
        resposta ? resposta.status() : "?"
      }`
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 3000)
    );

    const links = await page.evaluate(() => {
      const resultado = [];

      const anchors = [
        ...document.querySelectorAll(
          'a[href*="/news/"]'
        ),
      ];

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

      for (const a of anchors) {
        const href = a.href || "";

        const texto =
          a.innerText ||
          a.getAttribute("title") ||
          a.getAttribute("aria-label") ||
          "";

        const titulo = texto
          .replace(/\s+/g, " ")
          .trim();

        if (!href.includes("/news/")) continue;

        if (
          href ===
            "https://pt.libertycity.net/news/" ||
          href.endsWith("/news/#") ||
          href.endsWith("/news/")
        ) {
          continue;
        }

        const lower = titulo.toLowerCase();

        if (
          proibidos.some((p) =>
            lower.includes(p)
          )
        ) {
          continue;
        }

        // Uma notícia real normalmente possui URL
        // com número/slug.
        if (
          !/\/news\/.+/.test(
            new URL(href).pathname
          )
        ) {
          continue;
        }

        if (titulo.length < 20) continue;

        resultado.push({
          link: href,
          titulo,
        });
      }

      const unicos = [];
      const vistos = new Set();

      for (const item of resultado) {
        if (vistos.has(item.link)) continue;

        vistos.add(item.link);
        unicos.push(item);
      }

      return unicos;
    });

    console.log(
      `🔎 LibertyCity: ${links.length} notícias reais encontradas.`
    );

    const noticias = [];

    for (const item of links.slice(
      0,
      MAX_NOTICIAS_POR_FONTE + 5
    )) {
      const dados = await extrairCardDaPagina(
        page,
        item.link,
        'a[href*="/news/"]'
      );

      let imagem = escolherImagem(
        dados?.imagens || []
      );

      imagem = normalizarUrl(
        imagem,
        URL_LIBERTYCITY
      );

      let resumo = limparTexto(
        dados?.resumo || ""
      );

      if (!resumo) {
        resumo =
          "🚔 Nova notícia sobre GTA e Rockstar Games.";
      }

      if (resumo.length > 600) {
        resumo =
          resumo.substring(0, 597) + "...";
      }

      noticias.push({
        titulo:
          dados?.titulo || item.titulo,
        link: item.link,
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
// ROCKSTAR NEWSWIRE
// ======================================================

async function buscarNoticiasRockstar() {
  console.log(
    "🔎 Rockstar: abrindo Newswire..."
  );

  let page = null;

  try {
    const browser = await iniciarBrowser();

    page = await browser.newPage();

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

    const resposta = await page.goto(
      URL_ROCKSTAR,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      }
    );

    console.log(
      `🌐 Rockstar status: ${
        resposta ? resposta.status() : "?"
      }`
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 4000)
    );

    const links = await page.evaluate(() => {
      const resultado = [];

      const anchors = [
        ...document.querySelectorAll(
          'a[href*="/newswire/article/"]'
        ),
      ];

      for (const a of anchors) {
        const href = a.href || "";

        if (
          !href.includes(
            "/newswire/article/"
          )
        ) {
          continue;
        }

        const texto =
          a.innerText ||
          a.getAttribute("aria-label") ||
          a.getAttribute("title") ||
          "";

        const titulo = texto
          .replace(/\s+/g, " ")
          .trim();

        if (titulo.length < 15) continue;

        resultado.push({
          link: href,
          titulo,
        });
      }

      const unicos = [];
      const vistos = new Set();

      for (const item of resultado) {
        if (vistos.has(item.link)) continue;

        vistos.add(item.link);
        unicos.push(item);
      }

      return unicos;
    });

    console.log(
      `🔎 Rockstar: ${links.length} artigos encontrados.`
    );

    const noticias = [];

    // IMPORTANTE:
    // Não abrimos o artigo individual.
    // Pegamos imagem/resumo do próprio card
    // da página Newswire.
    for (const item of links.slice(
      0,
      MAX_NOTICIAS_POR_FONTE + 5
    )) {
      const dados = await extrairCardDaPagina(
        page,
        item.link,
        'a[href*="/newswire/article/"]'
      );

      let imagem = escolherImagem(
        dados?.imagens || []
      );

      imagem = normalizarUrl(
        imagem,
        URL_ROCKSTAR
      );

      let resumo = limparTexto(
        dados?.resumo || ""
      );

      if (!resumo) {
        resumo =
          "🚔 Nova notícia publicada pela Rockstar Games.";
      }

      if (resumo.length > 600) {
        resumo =
          resumo.substring(0, 597) + "...";
      }

      noticias.push({
        titulo:
          dados?.titulo || item.titulo,
        link: item.link,
        resumo,
        imagem,
      });

      console.log(
        `🖼️ Imagem encontrada: ${
          imagem ? "SIM" : "NÃO"
        }`
      );
    }

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

async function publicarGTA(noticia) {
  const canal =
    await client.channels.fetch(ID_GTA);

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

  // ================================================
  // CARD GTA
  // ================================================

  const embed = new EmbedBuilder()
    .setTitle(
      `🚔 ${noticia.titulo}`
    )
    .setURL(noticia.link)
    .setDescription(
      `${noticia.resumo}\n\n` +
        `👇 **Clique no título acima para ler a matéria completa.**`
    )
    .setFooter({
      text: "Murilito NEWS • GTA",
    })
    .setTimestamp();

  // AQUI está a parte importante:
  // imagem da notícia no próprio card.
  if (imagemValida(noticia.imagem)) {
    console.log(
      `🖼️ GTA usando imagem: ${noticia.imagem}`
    );

    embed.setImage(noticia.imagem);
  } else {
    console.log(
      "⚠️ GTA: nenhuma imagem encontrada para esta notícia."
    );
  }

  await canal.send({
    content:
      "@everyone 🚔 **NOVIDADE DO GTA!** 🔥",
    embeds: [embed],
  });

  console.log(
    `✅ GTA publicada: ${noticia.titulo}`
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

  let publicadasLiberty = 0;

  for (const noticia of liberty) {
    if (
      publicadasLiberty >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    const publicou =
      await publicarGTA(noticia);

    if (publicou) {
      total++;
      publicadasLiberty++;
    }
  }

  console.log(
    `📊 GTA LibertyCity: ${publicadasLiberty} notícia(s) nova(s) publicada(s).`
  );

  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  const rockstar =
    await buscarNoticiasRockstar();

  let publicadasRockstar = 0;

  for (const noticia of rockstar) {
    if (
      publicadasRockstar >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    const publicou =
      await publicarGTA(noticia);

    if (publicou) {
      total++;
      publicadasRockstar++;
    }
  }

  console.log(
    `📊 Rockstar: ${publicadasRockstar} notícia(s) nova(s) publicada(s).`
  );

  return total;
}

// ======================================================
// LOJA FORTNITE
// ======================================================

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(ID_LOJA);

    if (!canal) {
      console.log(
        "❌ Canal da loja não encontrado."
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(
        "🛒 LOJA DO FORTNITE ATUALIZADA!"
      )
      .setDescription(
        "🔥 A loja do Fortnite foi atualizada!\n\n" +
          "👇 **Clique abaixo para conferir a loja completa.**"
      )
      .setURL(URL_LOJA)
      .setImage(
        "https://fortnite.gg/img/og-shop.jpg"
      )
      .setFooter({
        text: "Murilito NEWS • Fortnite",
      })
      .setTimestamp();

    await canal.send({
      content:
        "🛒 **LOJA DO FORTNITE ATUALIZADA!**",
      embeds: [embed],
    });

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

// ======================================================
// TESTES
// ======================================================

async function testarFortnite() {
  console.log(
    "🧪 TESTE FORTNITE"
  );

  const noticias =
    await buscarNoticiasFortnite();

  if (!noticias.length) {
    console.log(
      "❌ Nenhuma notícia Fortnite encontrada."
    );
    return;
  }

  await publicarFortnite(noticias[0]);
}

async function testarGTA() {
  console.log(
    "🧪 TESTE GTA"
  );

  const total =
    await processarGTA();

  console.log(
    `🧪 Teste GTA terminou: ${total} publicada(s).`
  );
}

// ======================================================
// CICLO DE NOTÍCIAS
// ======================================================

let cicloRodando = false;

async function cicloNoticias() {
  if (cicloRodando) {
    console.log(
      "⚠️ Ciclo anterior ainda está rodando."
    );
    return;
  }

  cicloRodando = true;

  try {
    console.log(
      "📰 INICIANDO CICLO DE NOTÍCIAS"
    );

    console.log(
      `🇧🇷 ${new Date().toLocaleString(
        "pt-BR",
        {
          timeZone: "America/Sao_Paulo",
        }
      )}`
    );

    // ==============================================
    // FORTNITE
    // ==============================================

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );

    const fortnite =
      await buscarNoticiasFortnite();

    let publicadasFortnite = 0;

    for (const noticia of fortnite) {
      if (
        publicadasFortnite >=
        MAX_NOTICIAS_POR_FONTE
      ) {
        break;
      }

      const publicou =
        await publicarFortnite(noticia);

      if (publicou) {
        publicadasFortnite++;
      }
    }

    if (publicadasFortnite === 0) {
      console.log(
        "❌ Nenhuma notícia Fortnite nova."
      );
    }

    // ==============================================
    // GTA
    // ==============================================

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
    cicloRodando = false;
  }
}

// ======================================================
// COMANDOS
// ======================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const texto =
    message.content.trim().toLowerCase();

  if (texto === "!teste") {
    await message.reply(
      "🤖 **Murilito NEWS está funcionando!**"
    );
    return;
  }

  if (texto === "!teste fortnite") {
    await message.reply(
      "🎮 Buscando notícia do Fortnite..."
    );

    await testarFortnite();
    return;
  }

  if (texto === "!teste liberty") {
    await message.reply(
      "🚔 Buscando notícias do LibertyCity..."
    );

    const noticias =
      await buscarNoticiasLibertyCity();

    if (!noticias.length) {
      await message.reply(
        "❌ Nenhuma notícia encontrada."
      );
      return;
    }

    await message.reply(
      `📰 Encontrei **${noticias.length}** notícias no LibertyCity.`
    );

    return;
  }

  if (texto === "!teste rockstar") {
    await message.reply(
      "🚔 Buscando notícias da Rockstar..."
    );

    const noticias =
      await buscarNoticiasRockstar();

    if (!noticias.length) {
      await message.reply(
        "❌ Nenhuma notícia encontrada."
      );
      return;
    }

    await message.reply(
      `📰 Encontrei **${noticias.length}** notícias no Rockstar Newswire.`
    );

    return;
  }

  if (texto === "!teste loja") {
    await message.reply(
      "🛒 Publicando teste da loja..."
    );

    await publicarLoja();
    return;
  }

  if (texto === "!piada") {
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
          Math.random() * piadas.length
        )
      ];

    await message.reply(piada);
    return;
  }

  if (texto === "!ajuda") {
    await message.reply(
      "🤖 **COMANDOS MURILITO NEWS**\n\n" +
        "`!teste` — Testa o bot\n" +
        "`!teste fortnite` — Testa Fortnite\n" +
        "`!teste liberty` — Testa LibertyCity\n" +
        "`!teste rockstar` — Testa Rockstar\n" +
        "`!teste loja` — Testa a loja\n" +
        "`!piada` — Manda uma piada 😂"
    );

    return;
  }
});

// ======================================================
// BOT ONLINE
// ======================================================

client.once("ready", async () => {
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

  // Primeiro ciclo depois de 10 segundos
  setTimeout(() => {
    cicloNoticias();
  }, 10000);

  // Notícias a cada 10 minutos
  setInterval(() => {
    cicloNoticias();
  }, 10 * 60 * 1000);

  // ================================================
  // LOJA TODOS OS DIAS ÀS 21:00
  // ================================================

  setInterval(() => {
    const agora = new Date();

    const brasil = new Date(
      agora.toLocaleString("en-US", {
        timeZone: "America/Sao_Paulo",
      })
    );

    const hora = brasil.getHours();
    const minuto = brasil.getMinutes();

    if (hora === 21 && minuto === 0) {
      publicarLoja();
    }
  }, 60 * 1000);
});

// ======================================================
// LOGIN
// ======================================================

if (!TOKEN) {
  console.error(
    "❌ ERRO: variável TOKEN não encontrada."
  );

  process.exit(1);
}

client.login(TOKEN);
