require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const puppeteer = require("puppeteer");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const TOKEN = process.env.TOKEN;

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

const FORTNITE_OFICIAL =
  "https://www.fortnite.com/news?lang=pt-BR";

const LIBERTYCITY =
  "https://pt.libertycity.net/news/";

const ROCKSTAR =
  "https://www.rockstargames.com/br/newswire";

let cicloExecutando = false;
let browser = null;


// =====================================================
// DISCORD
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});


// =====================================================
// BROWSER
// =====================================================

async function iniciarBrowser() {
  if (browser) return browser;

  console.log("🌐 Iniciando navegador Puppeteer...");

  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  console.log("✅ Puppeteer iniciado.");

  return browser;
}


// =====================================================
// VERIFICAR NOTÍCIA DUPLICADA
// =====================================================

async function noticiaJaPublicada(canal, link, titulo) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    const linkNormalizado = link.trim();

    for (const [, mensagem] of mensagens) {
      // Verifica URL no conteúdo
      if (
        mensagem.content &&
        mensagem.content.includes(linkNormalizado)
      ) {
        return true;
      }

      // Verifica embeds
      for (const embed of mensagem.embeds) {
        if (
          embed.url &&
          embed.url.trim() === linkNormalizado
        ) {
          return true;
        }

        if (
          embed.title &&
          titulo &&
          embed.title
            .toLowerCase()
            .includes(
              titulo
                .toLowerCase()
                .substring(0, 35)
            )
        ) {
          return true;
        }
      }
    }

    return false;

  } catch (erro) {
    console.log(
      "⚠️ Erro verificando duplicidade:",
      erro.message
    );

    return false;
  }
}


// =====================================================
// PUBLICAR FORTNITE
// =====================================================

async function publicarFortnite(
  canal,
  titulo,
  link,
  imagem = null
) {
  if (!canal || !titulo || !link) {
    return false;
  }

  if (
    await noticiaJaPublicada(
      canal,
      link,
      titulo
    )
  ) {
    console.log(
      `⏭️ Fortnite: já publicada: ${titulo}`
    );

    return false;
  }

  const embed =
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎮 ${titulo}`)
      .setURL(link)
      .setDescription(
        "🔥 **Nova notícia do Fortnite!**\n\n" +
        "Clique no título para ler a notícia completa."
      )
      .setFooter({
        text: "Murilito NEWS • Fortnite",
      })
      .setTimestamp();

  if (imagem) {
    embed.setImage(imagem);
  }

  await canal.send({
    content:
      "@everyone 🎮 **NOVIDADE DO FORTNITE!** 🔥",
    embeds: [embed],
  });

  console.log(
    `✅ Fortnite publicada: ${titulo}`
  );

  return true;
}


// =====================================================
// PUBLICAR GTA — CARD COMPLETO
// =====================================================

async function publicarGTA(
  canal,
  titulo,
  link,
  imagem = null,
  resumo = null
) {
  if (!canal || !titulo || !link) {
    return false;
  }

  if (
    await noticiaJaPublicada(
      canal,
      link,
      titulo
    )
  ) {
    console.log(
      `⏭️ GTA: já publicada: ${titulo}`
    );

    return false;
  }

  let descricao =
    resumo ||
    "Confira a notícia completa no link abaixo.";

  // Discord aceita descrição limitada
  if (descricao.length > 1000) {
    descricao =
      descricao.substring(0, 997) + "...";
  }

  const embed =
    new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle(`🚔 ${titulo}`)
      .setURL(link)
      .setDescription(descricao)
      .setFooter({
        text: "Murilito NEWS • GTA",
      })
      .setTimestamp();

  // AQUI ESTÁ O CARD COM IMAGEM
  if (
    imagem &&
    typeof imagem === "string"
  ) {
    embed.setImage(imagem);
  }

  await canal.send({
    content:
      "@everyone 🚔 **NOVIDADE DO GTA!** 🔥",
    embeds: [embed],
  });

  console.log(
    `✅ GTA publicada: ${titulo}`
  );

  return true;
}


// =====================================================
// PEGAR IMAGEM + RESUMO DA NOTÍCIA
// =====================================================

async function pegarDadosDaNoticia(link) {
  try {
    const browser =
      await iniciarBrowser();

    const page =
      await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language":
        "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    console.log(
      `🖼️ Abrindo notícia para pegar imagem: ${link}`
    );

    const resposta =
      await page.goto(
        link,
        {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }
      );

    console.log(
      `🌐 Página da notícia: ${
        resposta?.status()
      }`
    );

    await new Promise(
      resolve =>
        setTimeout(resolve, 1500)
    );

    const dados =
      await page.evaluate(() => {
        function meta(nome) {
          const el =
            document.querySelector(
              `meta[property="${nome}"]`
            );

          if (el) {
            return (
              el.getAttribute("content") ||
              ""
            ).trim();
          }

          const el2 =
            document.querySelector(
              `meta[name="${nome}"]`
            );

          return (
            el2?.getAttribute("content") ||
            ""
          ).trim();
        }

        let imagem =
          meta("og:image");

        if (!imagem) {
          imagem =
            meta("twitter:image");
        }

        let descricao =
          meta("og:description");

        if (!descricao) {
          descricao =
            meta("description");
        }

        return {
          imagem,
          descricao,
        };
      });

    await page.close();

    return {
      imagem:
        dados.imagem || null,

      resumo:
        dados.descricao || null,
    };

  } catch (erro) {
    console.log(
      "⚠️ Não foi possível pegar imagem:",
      erro.message
    );

    return {
      imagem: null,
      resumo: null,
    };
  }
}


// =====================================================
// FORTNITE — API PELO NAVEGADOR
// =====================================================

async function buscarNoticiasFortnite() {
  console.log(
    "🔎 Fortnite: buscando diretamente no site oficial..."
  );

  const apiUrl =
    "https://www.fortnite.com/api/blog/getPosts" +
    "?category=" +
    "&postsPerPage=20" +
    "&offset=0" +
    "&locale=pt-BR" +
    "&rootPageSlug=blog";

  try {
    const browser =
      await iniciarBrowser();

    const page =
      await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language":
        "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    console.log(
      `🌐 Fortnite API pelo navegador: ${apiUrl}`
    );

    const resposta =
      await page.goto(
        apiUrl,
        {
          waitUntil: "networkidle2",
          timeout: 30000,
        }
      );

    console.log(
      `🌐 Fortnite API status: ${
        resposta?.status()
      }`
    );

    await new Promise(
      resolve =>
        setTimeout(resolve, 1000)
    );

    const texto =
      await page.evaluate(
        () => document.body.innerText
      );

    await page.close();

    if (!texto) {
      console.log(
        "⚠️ Fortnite API retornou vazio."
      );

      return [];
    }

    let dados;

    try {
      dados = JSON.parse(texto);
    } catch {
      console.log(
        "⚠️ Resposta não é JSON."
      );

      console.log(
        texto.substring(0, 500)
      );

      return [];
    }

    const resultados = [];

    function procurar(obj) {
      if (!obj) return;

      if (Array.isArray(obj)) {
        for (const item of obj) {
          procurar(item);
        }

        return;
      }

      if (
        typeof obj !== "object"
      ) {
        return;
      }

      const titulo =
        obj.title ||
        obj.name ||
        obj.headline ||
        obj.postTitle;

      let link =
        obj.link ||
        obj.url ||
        obj.href ||
        obj.path;

      const slug =
        obj.slug ||
        obj.postSlug ||
        obj.urlSlug;

      let imagem =
        obj.image ||
        obj.imageUrl ||
        obj.imageURL ||
        obj.thumbnail ||
        obj.banner ||
        null;

      if (
        titulo &&
        typeof titulo === "string" &&
        titulo.trim().length >= 8
      ) {
        if (
          link &&
          typeof link === "string"
        ) {
          if (
            link.startsWith("/")
          ) {
            link =
              "https://www.fortnite.com" +
              link;
          }
        }

        if (
          !link &&
          slug &&
          typeof slug === "string"
        ) {
          link =
            "https://www.fortnite.com/news/" +
            slug;
        }

        if (
          link &&
          link.includes(
            "fortnite.com"
          )
        ) {
          resultados.push({
            title:
              titulo.trim(),

            link,

            image:
              typeof imagem === "string"
                ? imagem
                : null,
          });
        }
      }

      for (
        const chave of Object.keys(obj)
      ) {
        const valor = obj[chave];

        if (
          valor &&
          typeof valor === "object"
        ) {
          procurar(valor);
        }
      }
    }

    procurar(dados);

    const unicos = [];
    const links = new Set();

    for (
      const noticia of resultados
    ) {
      if (
        !links.has(noticia.link)
      ) {
        links.add(noticia.link);

        unicos.push(noticia);
      }
    }

    console.log(
      `📰 Fortnite encontrou: ${unicos.length} notícia(s).`
    );

    return unicos.slice(0, 10);

  } catch (erro) {
    console.log(
      "❌ Erro Fortnite:",
      erro.message
    );

    return [];
  }
}


// =====================================================
// PROCESSAR FORTNITE
// =====================================================

async function processarFortnite() {
  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

  try {
    const canal =
      await client.channels.fetch(
        ID_FORTNITE
      );

    if (!canal) {
      console.log(
        "❌ Canal Fortnite não encontrado."
      );

      return;
    }

    const noticias =
      await buscarNoticiasFortnite();

    if (!noticias.length) {
      console.log(
        "❌ Nenhuma notícia Fortnite encontrada."
      );

      return;
    }

    let publicadas = 0;

    for (
      const noticia of noticias.slice(0, 3)
    ) {
      let imagem =
        noticia.image;

      // Se a API não fornecer imagem,
      // pega diretamente da página.
      if (!imagem) {
        const dados =
          await pegarDadosDaNoticia(
            noticia.link
          );

        imagem =
          dados.imagem;
      }

      const publicou =
        await publicarFortnite(
          canal,
          noticia.title,
          noticia.link,
          imagem
        );

      if (publicou) {
        publicadas++;
      }
    }

    console.log(
      `📊 FORTNITE: ${publicadas} notícia(s) nova(s) publicada(s).`
    );

  } catch (erro) {
    console.log(
      "❌ Erro processando Fortnite:",
      erro.message
    );
  }
}


// =====================================================
// LIBERTYCITY
// SOMENTE LINKS /news/ REAIS
// =====================================================

async function buscarLibertyCity() {
  console.log(
    "🔎 LibertyCity: procurando SOMENTE notícias..."
  );

  try {
    const browser =
      await iniciarBrowser();

    const page =
      await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    console.log(
      `🌐 Puppeteer abrindo: ${LIBERTYCITY}`
    );

    const resposta =
      await page.goto(
        LIBERTYCITY,
        {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }
      );

    console.log(
      `🌐 Puppeteer status: ${
        resposta?.status()
      }`
    );

    await new Promise(
      resolve =>
        setTimeout(resolve, 2000)
    );

    const noticias =
      await page.evaluate(() => {
        const resultados = [];

        const links =
          document.querySelectorAll(
            "a[href]"
          );

        for (const a of links) {
          const titulo =
            a.innerText?.trim();

          let href =
            a.href?.trim();

          if (!titulo || !href) {
            continue;
          }

          // ==========================================
          // SÓ ACEITA URL REAL DE NOTÍCIA
          // ==========================================

          if (
            !href.includes(
              "libertycity.net/news/"
            )
          ) {
            continue;
          }

          // Não aceita a página principal
          if (
            href ===
              "https://libertycity.net/news/" ||
            href ===
              "https://pt.libertycity.net/news/"
          ) {
            continue;
          }

          // ==========================================
          // BLOQUEIA MENUS E ARQUIVOS
          // ==========================================

          const proibidos = [
            "all-files",
            "author-files",
            "best-files",
            "upload",
            "search",
            "login",
            "register",
          ];

          const urlLower =
            href.toLowerCase();

          const tituloLower =
            titulo.toLowerCase();

          if (
            proibidos.some(
              palavra =>
                urlLower.includes(
                  palavra
                )
            )
          ) {
            continue;
          }

          if (
            tituloLower ===
              "todos os arquivos" ||
            tituloLower ===
              "arquivos de autores" ||
            tituloLower ===
              "melhores arquivos da semana" ||
            tituloLower ===
              "carregar arquivo"
          ) {
            continue;
          }

          // ==========================================
          // TÍTULO PRECISA PARECER NOTÍCIA
          // ==========================================

          if (
            titulo.length < 20
          ) {
            continue;
          }

          resultados.push({
            title: titulo,
            link: href,
          });
        }

        return resultados;
      });

    await page.close();

    const unicos = [];
    const links = new Set();

    for (
      const noticia of noticias
    ) {
      if (
        !links.has(noticia.link)
      ) {
        links.add(noticia.link);

        unicos.push(noticia);
      }
    }

    console.log(
      `🔎 LibertyCity: ${unicos.length} notícias reais encontradas.`
    );

    return unicos.slice(0, 10);

  } catch (erro) {
    console.log(
      "❌ Erro LibertyCity:",
      erro.message
    );

    return [];
  }
}


// =====================================================
// ROCKSTAR
// =====================================================

async function buscarRockstar() {
  console.log(
    "🔎 Rockstar: abrindo Newswire..."
  );

  try {
    const browser =
      await iniciarBrowser();

    const page =
      await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
    );

    console.log(
      `🌐 Puppeteer abrindo: ${ROCKSTAR}`
    );

    const resposta =
      await page.goto(
        ROCKSTAR,
        {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        }
      );

    console.log(
      `🌐 Puppeteer status: ${
        resposta?.status()
      }`
    );

    await new Promise(
      resolve =>
        setTimeout(resolve, 3000)
    );

    const noticias =
      await page.evaluate(() => {
        const resultados = [];

        const links =
          document.querySelectorAll(
            "a[href]"
          );

        for (const a of links) {
          const titulo =
            a.innerText?.trim();

          const href =
            a.href?.trim();

          if (
            !titulo ||
            titulo.length < 15 ||
            !href
          ) {
            continue;
          }

          if (
            !href.includes(
              "rockstargames.com"
            )
          ) {
            continue;
          }

          if (
            !href.includes(
              "/newswire/"
            )
          ) {
            continue;
          }

          resultados.push({
            title: titulo,
            link: href,
          });
        }

        return resultados;
      });

    await page.close();

    const unicos = [];
    const links = new Set();

    for (
      const noticia of noticias
    ) {
      if (
        !links.has(noticia.link)
      ) {
        links.add(noticia.link);

        unicos.push(noticia);
      }
    }

    console.log(
      `🔎 Rockstar: ${unicos.length} artigos encontrados.`
    );

    return unicos.slice(0, 10);

  } catch (erro) {
    console.log(
      "❌ Erro Rockstar:",
      erro.message
    );

    return [];
  }
}


// =====================================================
// PROCESSAR GTA
// =====================================================

async function processarGTA() {
  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  try {
    const canal =
      await client.channels.fetch(
        ID_GTA
      );

    if (!canal) {
      console.log(
        "❌ Canal GTA não encontrado."
      );

      return;
    }

    const liberty =
      await buscarLibertyCity();

    let publicadas = 0;

    // ================================================
    // LIBERTYCITY
    // ================================================

    for (
      const noticia of liberty.slice(0, 3)
    ) {
      console.log(
        `📰 GTA LibertyCity: ${noticia.title}`
      );

      // PEGA IMAGEM E RESUMO
      const dados =
        await pegarDadosDaNoticia(
          noticia.link
        );

      const publicou =
        await publicarGTA(
          canal,
          noticia.title,
          noticia.link,
          dados.imagem,
          dados.resumo
        );

      if (publicou) {
        publicadas++;
      }
    }

    console.log(
      `📊 GTA LibertyCity: ${publicadas} notícia(s) nova(s) publicada(s).`
    );

    // ================================================
    // ROCKSTAR
    // ================================================

    console.log(
      "━━━━━━━━ Rockstar ━━━━━━━━"
    );

    const rockstar =
      await buscarRockstar();

    let publicadasRockstar = 0;

    for (
      const noticia of rockstar.slice(0, 3)
    ) {
      console.log(
        `📰 Rockstar: ${noticia.title}`
      );

      // PEGA IMAGEM E RESUMO
      const dados =
        await pegarDadosDaNoticia(
          noticia.link
        );

      const publicou =
        await publicarGTA(
          canal,
          noticia.title,
          noticia.link,
          dados.imagem,
          dados.resumo
        );

      if (publicou) {
        publicadasRockstar++;
      }
    }

    console.log(
      `📊 Rockstar: ${publicadasRockstar} notícia(s) nova(s) publicada(s).`
    );

    console.log(
      `📊 GTA TOTAL: ${
        publicadas +
        publicadasRockstar
      } notícia(s) nova(s) publicada(s).`
    );

  } catch (erro) {
    console.log(
      "❌ Erro processando GTA:",
      erro.message
    );
  }
}


// =====================================================
// LOJA FORTNITE
// =====================================================

async function enviarLoja() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    if (!canal) {
      console.log(
        "❌ Canal da loja não encontrado."
      );

      return;
    }

    const embed =
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setDescription(
          "🔥 A loja do Fortnite foi atualizada!\n\n" +
          "Clique abaixo para conferir os itens disponíveis hoje."
        )
        .setURL(
          LOJA_FORTNITE
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
      embeds: [embed],
    });

    console.log(
      "🛒 Loja Fortnite publicada."
    );

  } catch (erro) {
    console.log(
      "❌ Erro enviando loja:",
      erro.message
    );
  }
}


// =====================================================
// CICLO
// =====================================================

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
      `🇧🇷 ${new Date().toLocaleString(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo",
        }
      )}`
    );

    await processarFortnite();

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
    cicloExecutando = false;
  }
}


// =====================================================
// COMANDOS
// =====================================================

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) return;

    const texto =
      message.content
        .trim()
        .toLowerCase();

    // -----------------------------------------------
    // TESTE
    // -----------------------------------------------

    if (
      texto === "!teste"
    ) {
      await message.reply(
        "🤖 Murilito NEWS está funcionando!"
      );

      return;
    }

    // -----------------------------------------------
    // TESTE FORTNITE
    // -----------------------------------------------

    if (
      texto === "!teste fortnite"
    ) {
      await message.reply(
        "🎮 Testando notícias do Fortnite..."
      );

      await processarFortnite();

      return;
    }

    // -----------------------------------------------
    // TESTE LIBERTYCITY
    // -----------------------------------------------

    if (
      texto === "!teste liberty"
    ) {
      await message.reply(
        "🚔 Testando LibertyCity..."
      );

      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      const noticias =
        await buscarLibertyCity();

      for (
        const noticia of noticias.slice(0, 3)
      ) {
        const dados =
          await pegarDadosDaNoticia(
            noticia.link
          );

        await publicarGTA(
          canal,
          noticia.title,
          noticia.link,
          dados.imagem,
          dados.resumo
        );
      }

      return;
    }

    // -----------------------------------------------
    // TESTE ROCKSTAR
    // -----------------------------------------------

    if (
      texto === "!teste rockstar"
    ) {
      await message.reply(
        "🚔 Testando Rockstar..."
      );

      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      const noticias =
        await buscarRockstar();

      for (
        const noticia of noticias.slice(0, 3)
      ) {
        const dados =
          await pegarDadosDaNoticia(
            noticia.link
          );

        await publicarGTA(
          canal,
          noticia.title,
          noticia.link,
          dados.imagem,
          dados.resumo
        );
      }

      return;
    }

    // -----------------------------------------------
    // TESTE LOJA
    // -----------------------------------------------

    if (
      texto === "!teste loja"
    ) {
      await message.reply(
        "🛒 Enviando teste da loja..."
      );

      await enviarLoja();

      return;
    }

    // -----------------------------------------------
    // PIADA
    // -----------------------------------------------

    if (
      texto === "!piada"
    ) {
      const piadas = [
        "😂 Por que o computador foi ao médico? Porque estava com um vírus!",
        "😂 O que o GTA falou para o Fortnite? Para de construir e vem dirigir!",
        "😂 Meu PC não é ruim... ele só está fazendo um estágio em batata.",
        "😂 Fortnite sem skin é igual GTA sem carro: dá, mas não tem graça.",
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

    // -----------------------------------------------
    // AJUDA
    // -----------------------------------------------

    if (
      texto === "!ajuda"
    ) {
      await message.reply(
        "🤖 **Murilito NEWS**\n\n" +
        "🧪 `!teste` — testa o bot\n" +
        "🎮 `!teste fortnite` — testa Fortnite\n" +
        "🚔 `!teste liberty` — testa LibertyCity\n" +
        "🚔 `!teste rockstar` — testa Rockstar\n" +
        "🛒 `!teste loja` — testa a loja\n" +
        "😂 `!piada` — manda uma piada"
      );

      return;
    }
  }
);


// =====================================================
// BOT ONLINE
// =====================================================

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

    // Primeiro ciclo
    setTimeout(
      () => {
        cicloNoticias();
      },
      10000
    );

    // Notícias a cada 10 minutos
    setInterval(
      () => {
        cicloNoticias();
      },
      10 * 60 * 1000
    );

    // Loja diariamente às 21:00
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
          enviarLoja();
        }
      },
      60 * 1000
    );
  }
);


// =====================================================
// LOGIN
// =====================================================

if (!TOKEN) {
  console.error(
    "❌ ERRO: variável TOKEN não encontrada."
  );

  process.exit(1);
}

client.login(TOKEN);
