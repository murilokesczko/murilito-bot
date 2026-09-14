require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
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

const MAX_NOTICIAS_GTA = 2;

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
// BROWSER
// ======================================================

let browser = null;
let browserPromise = null;

async function iniciarBrowser() {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch {
      browser = null;
    }
  }

  if (browserPromise) {
    return browserPromise;
  }

  browserPromise = (async () => {
    console.log("🌐 Iniciando navegador Puppeteer...");

    const novoBrowser = await puppeteer.launch({
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

// ======================================================
// VERIFICAR DUPLICADA
// ======================================================

async function noticiaJaPublicada(canal, url, titulo) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    const tituloNormalizado =
      limparTexto(titulo).toLowerCase();

    for (const mensagem of mensagens.values()) {
      if (
        url &&
        mensagem.content &&
        mensagem.content.includes(url)
      ) {
        return true;
      }

      if (
        tituloNormalizado &&
        mensagem.content &&
        mensagem.content
          .toLowerCase()
          .includes(tituloNormalizado)
      ) {
        return true;
      }
    }

    return false;
  } catch (erro) {
    console.log(
      "⚠️ Erro verificando notícia duplicada:",
      erro.message
    );

    return false;
  }
}

// ======================================================
// PUBLICAR GTA
//
// IMPORTANTE:
// NÃO usamos EmbedBuilder aqui.
//
// O Discord recebe o link e gera sozinho a prévia
// da Rockstar/LibertyCity.
// ======================================================

async function publicarGTA(noticia, forcar = false) {
  try {
    const canal = await client.channels.fetch(ID_GTA);

    if (!canal) {
      console.log("❌ Canal GTA não encontrado.");
      return false;
    }

    if (!noticia.link) {
      console.log(
        "❌ GTA: notícia sem link."
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
          `⏭️ GTA: já publicada: ${noticia.titulo}`
        );

        return false;
      }
    }

    console.log(
      `🚔 GTA enviando link: ${noticia.link}`
    );

    // ==================================================
    // AQUI ESTÁ A MÁGICA:
    //
    // O Discord recebe o link e cria a prévia nativa.
    // Não colocamos EmbedBuilder.
    // Não colocamos imagem manual.
    // ==================================================

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

// ======================================================
// ROCKSTAR
// ======================================================

async function buscarNoticiasRockstar() {
  console.log(
    "🔎 Rockstar: procurando notícias..."
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

    await new Promise((resolve) =>
      setTimeout(resolve, 6000)
    );

    // ==================================================
    // PEGAMOS OS LINKS REAIS DO NEWSWIRE
    // ==================================================

    const artigos =
      await page.evaluate(() => {
        const resultado = [];

        const links = [
          ...document.querySelectorAll(
            'a[href*="/newswire/article/"]'
          ),
        ];

        for (const link of links) {
          const href =
            link.href || "";

          if (
            !href.includes(
              "/newswire/article/"
            )
          ) {
            continue;
          }

          // --------------------------------------------
          // TEXTO DO LINK
          // --------------------------------------------

          let texto =
            link.innerText ||
            link.textContent ||
            link.getAttribute(
              "aria-label"
            ) ||
            link.getAttribute(
              "title"
            ) ||
            "";

          texto = texto
            .replace(/\s+/g, " ")
            .trim();

          // --------------------------------------------
          // PROCURAR TÍTULO EM ELEMENTOS PRÓXIMOS
          // --------------------------------------------

          let elemento = link;

          for (let i = 0; i < 6; i++) {
            if (!elemento.parentElement) {
              break;
            }

            elemento =
              elemento.parentElement;

            const headings = [
              ...elemento.querySelectorAll(
                "h1,h2,h3,h4,h5,h6"
              ),
            ];

            for (const heading of headings) {
              const h =
                (
                  heading.innerText ||
                  ""
                )
                  .replace(/\s+/g, " ")
                  .trim();

              if (
                h.length >= 20
              ) {
                texto = h;
                break;
              }
            }

            if (
              texto.length >= 20
            ) {
              break;
            }
          }

          // --------------------------------------------
          // LIMPEZA
          // --------------------------------------------

          texto = texto
            .replace(
              /^GTA Online\s*/i,
              ""
            )
            .replace(
              /^Grand Theft Auto VI\s*/i,
              ""
            )
            .replace(
              /^Grand Theft Auto V\s*/i,
              ""
            )
            .trim();

          // --------------------------------------------
          // IGNORAR COISAS QUE NÃO SÃO NOTÍCIAS
          // --------------------------------------------

          const proibidos = [
            "aviso sobre cookies",
            "cookies",
            "cookie",
            "política de privacidade",
            "privacy policy",
            "privacy",
            "terms of service",
            "termos de serviço",
            "entrar",
            "login",
            "sign in",
            "criar conta",
            "create account",
            "pesquisar",
            "search",
          ];

          const textoLower =
            texto.toLowerCase();

          if (
            proibidos.some((item) =>
              textoLower.includes(item)
            )
          ) {
            continue;
          }

          if (
            texto.length < 20
          ) {
            continue;
          }

          resultado.push({
            titulo: texto,
            link: href,
          });
        }

        // --------------------------------------------
        // REMOVER DUPLICADAS
        // --------------------------------------------

        const unicos = [];
        const vistos = new Set();

        for (const artigo of resultado) {
          if (
            vistos.has(artigo.link)
          ) {
            continue;
          }

          vistos.add(artigo.link);
          unicos.push(artigo);
        }

        return unicos;
      });

    console.log(
      `🔎 Rockstar: ${artigos.length} candidatos encontrados.`
    );

    // Mostra os primeiros para facilitar diagnóstico
    for (
      const artigo of artigos.slice(0, 10)
    ) {
      console.log(
        `📰 Rockstar candidato: ${artigo.titulo}`
      );
    }

    return artigos.slice(0, 15);
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

    await new Promise((resolve) =>
      setTimeout(resolve, 2500)
    );

    const artigos =
      await page.evaluate(() => {
        const resultado = [];

        const links = [
          ...document.querySelectorAll(
            'a[href*="/news/"]'
          ),
        ];

        const proibidos = [
          "todos os arquivos",
          "arquivos",
          "login",
          "registrar",
          "register",
          "pesquisar",
          "search",
        ];

        for (const link of links) {
          const href =
            link.href || "";

          let titulo =
            link.innerText ||
            link.getAttribute(
              "title"
            ) ||
            link.getAttribute(
              "aria-label"
            ) ||
            "";

          titulo = titulo
            .replace(/\s+/g, " ")
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
            )
          ) {
            continue;
          }

          if (
            titulo.length < 20
          ) {
            continue;
          }

          const lower =
            titulo.toLowerCase();

          if (
            proibidos.some((item) =>
              lower.includes(item)
            )
          ) {
            continue;
          }

          resultado.push({
            titulo,
            link: href,
          });
        }

        const unicos = [];
        const vistos = new Set();

        for (const artigo of resultado) {
          if (
            vistos.has(artigo.link)
          ) {
            continue;
          }

          vistos.add(artigo.link);
          unicos.push(artigo);
        }

        return unicos;
      });

    console.log(
      `🔎 LibertyCity: ${artigos.length} notícias reais encontradas.`
    );

    return artigos.slice(0, 15);
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
// PROCESSAR GTA
// ======================================================

async function processarGTA() {
  let total = 0;

  // ==================================================
  // LIBERTYCITY
  // ==================================================

  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  const liberty =
    await buscarNoticiasLibertyCity();

  let publicadasLiberty = 0;

  for (
    const noticia of liberty
  ) {
    if (
      publicadasLiberty >=
      MAX_NOTICIAS_GTA
    ) {
      break;
    }

    const publicou =
      await publicarGTA(
        noticia
      );

    if (publicou) {
      publicadasLiberty++;
      total++;
    }
  }

  console.log(
    `📊 GTA LibertyCity: ${publicadasLiberty} notícia(s) nova(s) publicada(s).`
  );

  // ==================================================
  // ROCKSTAR
  // ==================================================

  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  const rockstar =
    await buscarNoticiasRockstar();

  let publicadasRockstar = 0;

  for (
    const noticia of rockstar
  ) {
    if (
      publicadasRockstar >=
      MAX_NOTICIAS_GTA
    ) {
      break;
    }

    const publicou =
      await publicarGTA(
        noticia
      );

    if (publicou) {
      publicadasRockstar++;
      total++;
    }
  }

  console.log(
    `📊 Rockstar: ${publicadasRockstar} notícia(s) nova(s) publicada(s).`
  );

  console.log(
    `📊 GTA TOTAL: ${total} notícia(s) nova(s) publicada(s).`
  );

  return total;
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

    await new Promise((resolve) =>
      setTimeout(resolve, 5000)
    );

    const artigos =
      await page.evaluate(() => {
        const resultado = [];

        const links = [
          ...document.querySelectorAll(
            'a[href*="/news/"]'
          ),
        ];

        for (const link of links) {
          const href =
            link.href || "";

          const titulo =
            (
              link.innerText ||
              link.getAttribute(
                "aria-label"
              ) ||
              link.getAttribute(
                "title"
              ) ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim();

          if (
            !href.includes(
              "/news/"
            )
          ) {
            continue;
          }

          if (
            titulo.length < 15
          ) {
            continue;
          }

          resultado.push({
            titulo,
            link: href,
          });
        }

        const unicos = [];
        const vistos = new Set();

        for (const artigo of resultado) {
          if (
            vistos.has(artigo.link)
          ) {
            continue;
          }

          vistos.add(artigo.link);
          unicos.push(artigo);
        }

        return unicos;
      });

    return artigos.slice(0, 10);
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
//
// Mantido separado para não alterar o funcionamento
// atual da Loja.
// ======================================================

async function publicarFortnite(noticia) {
  try {
    const canal =
      await client.channels.fetch(
        ID_FORTNITE
      );

    if (!canal) {
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

    await canal.send({
      content:
        `@everyone 🎮 **NOVIDADE DO FORTNITE!** 🔥\n\n` +
        `${noticia.link}`,
      allowedMentions: {
        parse: ["everyone"],
      },
    });

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

// ======================================================
// LOJA
// ======================================================

async function publicarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {
      return;
    }

    const {
      EmbedBuilder,
    } = require("discord.js");

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
      embeds: [embed],
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
// CICLO DE NOTÍCIAS
// ======================================================

let cicloRodando = false;

async function cicloNoticias() {
  if (cicloRodando) {
    console.log(
      "⚠️ Já existe um ciclo de notícias rodando. Ignorando."
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
          timeZone:
            "America/Sao_Paulo",
        }
      )}`
    );

    // ==================================================
    // FORTNITE
    // ==================================================

    console.log(
      "━━━━━━━━ Fortnite ━━━━━━━━"
    );

    const fortnite =
      await buscarNoticiasFortnite();

    let publicadasFortnite = 0;

    for (
      const noticia of fortnite
    ) {
      if (
        publicadasFortnite >=
        MAX_NOTICIAS_GTA
      ) {
        break;
      }

      const publicou =
        await publicarFortnite(
          noticia
        );

      if (publicou) {
        publicadasFortnite++;
      }
    }

    if (
      publicadasFortnite === 0
    ) {
      console.log(
        "❌ Nenhuma notícia Fortnite nova."
      );
    }

    // ==================================================
    // GTA
    // ==================================================

    await processarGTA();

    console.log(
      "📰 CICLO FINALIZADO"
    );
  } catch (erro) {
    console.log(
      "❌ ERRO NO CICLO:",
      erro.message
    );
  } finally {
    cicloRodando = false;
  }
}

// ======================================================
// COMANDOS
// ======================================================

let testeRodando = false;

client.on(
  "messageCreate",
  async (message) => {
    if (message.author.bot) {
      return;
    }

    const texto =
      message.content
        .trim()
        .toLowerCase();

    // ==================================================
    // !TESTE
    // ==================================================

    if (
      texto === "!teste"
    ) {
      await message.reply(
        "🤖 **Murilito NEWS está funcionando!**"
      );

      return;
    }

    // ==================================================
    // !TESTE ROCKSTAR
    //
    // Publica mesmo se já existir.
    // Serve para testar o preview do Discord.
    // ==================================================

    if (
      texto ===
      "!teste rockstar"
    ) {
      if (testeRodando) {
        await message.reply(
          "⏳ Já existe um teste de notícia rodando."
        );

        return;
      }

      testeRodando = true;

      try {
        await message.reply(
          "🚔 Buscando uma notícia da Rockstar para testar o card..."
        );

        const noticias =
          await buscarNoticiasRockstar();

        if (!noticias.length) {
          await message.reply(
            "❌ A Rockstar foi acessada, mas não encontrei uma notícia válida."
          );

          return;
        }

        const noticia =
          noticias[0];

        console.log(
          "🧪 TESTE ROCKSTAR:"
        );

        console.log(
          `📰 ${noticia.titulo}`
        );

        console.log(
          `🔗 ${noticia.link}`
        );

        await publicarGTA(
          noticia,
          true
        );

        await message.reply(
          "✅ **Teste enviado para o canal GTA.**\n\n" +
            "Agora confira se o Discord criou a prévia grande com título, descrição e imagem."
        );
      } finally {
        testeRodando = false;
      }

      return;
    }

    // ==================================================
    // !TESTE LIBERTY
    // ==================================================

    if (
      texto ===
      "!teste liberty"
    ) {
      if (testeRodando) {
        await message.reply(
          "⏳ Já existe um teste rodando."
        );

        return;
      }

      testeRodando = true;

      try {
        await message.reply(
          "🚔 Testando LibertyCity..."
        );

        const noticias =
          await buscarNoticiasLibertyCity();

        if (!noticias.length) {
          await message.reply(
            "❌ Nenhuma notícia encontrada."
          );

          return;
        }

        await publicarGTA(
          noticias[0],
          true
        );

        await message.reply(
          "✅ **Teste LibertyCity enviado para o canal GTA.**"
        );
      } finally {
        testeRodando = false;
      }

      return;
    }

    // ==================================================
    // !TESTE FORTNITE
    // ==================================================

    if (
      texto ===
      "!teste fortnite"
    ) {
      if (testeRodando) {
        await message.reply(
          "⏳ Já existe um teste rodando."
        );

        return;
      }

      testeRodando = true;

      try {
        await message.reply(
          "🎮 Testando Fortnite..."
        );

        const noticias =
          await buscarNoticiasFortnite();

        if (!noticias.length) {
          await message.reply(
            "❌ A Epic está bloqueando o acesso do Railway neste momento."
          );

          return;
        }

        await publicarFortnite(
          noticias[0]
        );
      } finally {
        testeRodando = false;
      }

      return;
    }

    // ==================================================
    // !TESTE LOJA
    // ==================================================

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

    // ==================================================
    // PIADA
    // ==================================================

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

    // ==================================================
    // AJUDA
    // ==================================================

    if (
      texto === "!ajuda"
    ) {
      await message.reply(
        "🤖 **COMANDOS MURILITO NEWS**\n\n" +
          "`!teste` — Testa o bot\n" +
          "`!teste rockstar` — Testa card da Rockstar\n" +
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
// BOT ONLINE
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

    // ==================================================
    // PRIMEIRO CICLO
    // ==================================================

    setTimeout(() => {
      cicloNoticias();
    }, 10000);

    // ==================================================
    // CICLO A CADA 10 MINUTOS
    // ==================================================

    setInterval(() => {
      cicloNoticias();
    }, 10 * 60 * 1000);

    // ==================================================
    // LOJA ÀS 21:00
    // ==================================================

    setInterval(() => {
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
    }, 60000);
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

client.login(TOKEN);
