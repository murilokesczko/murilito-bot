require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const axios = require("axios");
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


// =====================================================
// CLIENT DISCORD
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});


// =====================================================
// VARIÁVEIS
// =====================================================

let cicloExecutando = false;
let browser = null;


// =====================================================
// INICIAR NAVEGADOR
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
// PUBLICAR NOTÍCIA
// =====================================================

async function publicarNoticia(
  canal,
  titulo,
  link,
  tipo = "fortnite",
  imagem = null,
  resumo = ""
) {
  if (!canal || !link || !titulo) return false;

  const jaPublicada = await noticiaJaPublicada(canal, link, titulo);

  if (jaPublicada) {
    console.log(`⏭️ ${tipo.toUpperCase()}: já publicada: ${titulo}`);
    return false;
  }

  let embed;

  if (tipo === "fortnite") {
    embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🎮 ${titulo}`)
      .setURL(link)
      .setDescription(
        `🔥 **Nova notícia do Fortnite!**\n\n` +
        `Leia a notícia completa no site oficial do Fortnite.`
      )
      .setFooter({
        text: "Murilito NEWS • Fortnite",
      })
      .setTimestamp();
  } else {
    embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setTitle(`🚔 ${titulo}`)
      .setURL(link)
      .setDescription(
        resumo ||
          "Confira a notícia completa no link abaixo."
      )
      .setFooter({
        text: "Murilito NEWS • GTA",
      })
      .setTimestamp();

    if (imagem) {
      embed.setImage(imagem);
    }
  }

  const mensagem =
    tipo === "fortnite"
      ? "@everyone 🎮 **NOVIDADE DO FORTNITE!** 🔥"
      : "@everyone 🚔 **NOVIDADE DO GTA!** 🔥";

  await canal.send({
    content: mensagem,
    embeds: [embed],
  });

  console.log(`✅ ${tipo.toUpperCase()} publicada: ${titulo}`);

  return true;
}


// =====================================================
// VERIFICAR SE JÁ FOI PUBLICADA
// =====================================================

async function noticiaJaPublicada(canal, link, titulo) {
  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    const linkNormalizado = link.trim();

    for (const [, mensagem] of mensagens) {
      if (
        mensagem.content &&
        mensagem.content.includes(linkNormalizado)
      ) {
        return true;
      }

      for (const embed of mensagem.embeds) {
        if (
          embed.url &&
          embed.url.trim() === linkNormalizado
        ) {
          return true;
        }

        if (
          embed.title &&
          embed.title
            .toLowerCase()
            .includes(titulo.toLowerCase().substring(0, 30))
        ) {
          return true;
        }
      }
    }

    return false;
  } catch (erro) {
    console.log(
      "⚠️ Erro verificando notícia:",
      erro.message
    );

    return false;
  }
}


// =====================================================
// FORTNITE — API OFICIAL DO SITE
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
    console.log("🌐 Fortnite API:", apiUrl);

    const resposta = await axios.get(apiUrl, {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0.0.0 Safari/537.36",

        "Accept":
          "application/json,text/plain,*/*",

        "Accept-Language":
          "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",

        "Referer":
          "https://www.fortnite.com/news?lang=pt-BR",
      },
    });

    console.log(
      `🌐 Fortnite API status: ${resposta.status}`
    );

    const dados = resposta.data;

    if (!dados) {
      console.log(
        "⚠️ Fortnite API retornou resposta vazia."
      );
      return [];
    }

    console.log(
      "📦 Fortnite API respondeu corretamente."
    );

    // =================================================
    // A API pode devolver os artigos em estruturas
    // diferentes dependendo da versão.
    // Procuramos os objetos recursivamente.
    // =================================================

    const encontrados = [];

    function procurar(obj) {
      if (!obj) return;

      if (Array.isArray(obj)) {
        for (const item of obj) {
          procurar(item);
        }

        return;
      }

      if (typeof obj !== "object") {
        return;
      }

      const titulo =
        obj.title ||
        obj.name ||
        obj.headline ||
        obj.postTitle;

      const slug =
        obj.slug ||
        obj.postSlug ||
        obj.urlSlug;

      let link =
        obj.link ||
        obj.url ||
        obj.href ||
        obj.path;

      if (
        titulo &&
        typeof titulo === "string" &&
        titulo.trim().length >= 5
      ) {
        if (
          link &&
          typeof link === "string"
        ) {
          if (link.startsWith("/")) {
            link =
              "https://www.fortnite.com" +
              link;
          }

          if (
            link.startsWith("https://www.fortnite.com")
          ) {
            encontrados.push({
              title: titulo.trim(),
              link,
            });
          }
        } else if (
          slug &&
          typeof slug === "string"
        ) {
          encontrados.push({
            title: titulo.trim(),
            link:
              "https://www.fortnite.com/news/" +
              slug,
          });
        }
      }

      for (const chave of Object.keys(obj)) {
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

    // Remover duplicados
    const unicos = [];

    const links = new Set();

    for (const item of encontrados) {
      if (!links.has(item.link)) {
        links.add(item.link);
        unicos.push(item);
      }
    }

    console.log(
      `📰 Fortnite API encontrou: ${unicos.length} notícia(s).`
    );

    for (const noticia of unicos.slice(0, 10)) {
      console.log(
        `🎮 ${noticia.title}`
      );

      console.log(
        `🔗 ${noticia.link}`
      );
    }

    return unicos.slice(0, 10);

  } catch (erro) {
    console.log(
      "❌ Erro na API do Fortnite:",
      erro.response?.status ||
        erro.code ||
        erro.message
    );

    if (erro.response?.data) {
      console.log(
        "📦 Resposta do servidor:",
        JSON.stringify(
          erro.response.data
        ).substring(0, 1000)
      );
    }

    return [];
  }
}


// =====================================================
// NOTÍCIAS FORTNITE
// =====================================================

async function processarFortnite() {
  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

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

  // Publica no máximo 3 por ciclo
  for (
    const noticia of noticias.slice(0, 3)
  ) {
    const publicada =
      await publicarNoticia(
        canal,
        noticia.title,
        noticia.link,
        "fortnite"
      );

    if (publicada) {
      publicadas++;
    }
  }

  console.log(
    `📊 FORTNITE: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}


// =====================================================
// LIBERTYCITY
// =====================================================

async function buscarLibertyCity() {
  console.log(
    "🔎 LibertyCity: tentando navegador..."
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
      resolve => setTimeout(resolve, 3000)
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
            a.href;

          if (
            titulo &&
            titulo.length >= 15 &&
            href &&
            href.includes(
              "libertycity.net"
            )
          ) {
            resultados.push({
              title: titulo,
              link: href,
            });
          }
        }

        return resultados;
      });

    await page.close();

    const unicos = [];
    const links = new Set();

    for (const item of noticias) {
      if (!links.has(item.link)) {
        links.add(item.link);
        unicos.push(item);
      }
    }

    console.log(
      `🔎 LibertyCity Puppeteer: ${unicos.length} candidatos.`
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
      resolve => setTimeout(resolve, 4000)
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
            a.href;

          if (
            titulo &&
            titulo.length >= 10 &&
            href &&
            href.includes(
              "rockstargames.com"
            ) &&
            href.includes("/newswire/")
          ) {
            resultados.push({
              title: titulo,
              link: href,
            });
          }
        }

        return resultados;
      });

    await page.close();

    const unicos = [];
    const links = new Set();

    for (const item of noticias) {
      if (!links.has(item.link)) {
        links.add(item.link);
        unicos.push(item);
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

  for (
    const noticia of liberty.slice(0, 5)
  ) {
    const publicada =
      await publicarNoticia(
        canal,
        noticia.title,
        noticia.link,
        "gta"
      );

    if (publicada) {
      publicadas++;
    }
  }

  console.log(
    `📊 GTA LibertyCity: ${publicadas} notícia(s) nova(s) publicada(s).`
  );

  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  const rockstar =
    await buscarRockstar();

  for (
    const noticia of rockstar.slice(0, 5)
  ) {
    const publicada =
      await publicarNoticia(
        canal,
        noticia.title,
        noticia.link,
        "gta"
      );

    if (publicada) {
      publicadas++;
    }
  }

  console.log(
    `📊 GTA total: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
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
        .setURL(LOJA_FORTNITE)
        .setImage(
          "https://fortnite.gg/img/og-shop.jpg"
        )
        .setFooter({
          text: "Murilito NEWS • Loja Fortnite",
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
// CICLO DE NOTÍCIAS
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

    // !teste
    if (texto === "!teste") {
      await message.reply(
        "🤖 Murilito NEWS está funcionando!"
      );
      return;
    }

    // !teste fortnite
    if (
      texto === "!teste fortnite"
    ) {
      await message.reply(
        "🎮 Testando notícias do Fortnite..."
      );

      await processarFortnite();
      return;
    }

    // !teste liberty
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
        await publicarNoticia(
          canal,
          noticia.title,
          noticia.link,
          "gta"
        );
      }

      return;
    }

    // !teste rockstar
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
        await publicarNoticia(
          canal,
          noticia.title,
          noticia.link,
          "gta"
        );
      }

      return;
    }

    // !teste loja
    if (
      texto === "!teste loja"
    ) {
      await message.reply(
        "🛒 Enviando teste da loja..."
      );

      await enviarLoja();
      return;
    }

    // !piada
    if (texto === "!piada") {
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

      await message.reply(piada);
      return;
    }

    // !ajuda
    if (texto === "!ajuda") {
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

    // Aguarda 10 segundos para o Discord
    // terminar de inicializar
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
