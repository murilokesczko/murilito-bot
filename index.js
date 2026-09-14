require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const Parser = require("rss-parser");

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const TOKEN = process.env.TOKEN;

// IDs DOS CANAIS
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// Intervalos
const INTERVALO_NOTICIAS = 10 * 60 * 1000; // 10 minutos
const HORA_LOJA = 21;
const MINUTO_LOJA = 0;

// Limite de notícias
const MAX_NOTICIAS_ANALISADAS = 10;

// ======================================================
// VALIDAÇÃO DO TOKEN
// ======================================================

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado nas variáveis do Railway.");
  process.exit(1);
}

// ======================================================
// CLIENTE DISCORD
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ======================================================
// RSS
// ======================================================

const parser = new Parser({
  timeout: 15000,
});

// ======================================================
// AXIOS
// ======================================================

const http = axios.create({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.7",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

// ======================================================
// ESTADO
// ======================================================

let ultimoDiaLoja = null;
let cicloEmAndamento = false;

// ======================================================
// UTILITÁRIOS
// ======================================================

function normalizarTexto(texto) {
  return String(texto || "")
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function limparTitulo(titulo) {
  let texto = normalizarTexto(titulo);

  // Remove alguns sufixos comuns de RSS
  texto = texto
    .replace(/\s+-\s+Rockstar Games$/i, "")
    .replace(/\s+-\s+Fortnite$/i, "")
    .replace(/\s+-\s+FortniteGG$/i, "")
    .replace(/\s+\|\s+Rockstar Games$/i, "")
    .trim();

  return texto;
}

function urlValida(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ======================================================
// HTTP COM RETRY
// ======================================================

async function getComRetry(url, opcoes = {}, tentativas = 3) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const resposta = await http.get(url, opcoes);

      console.log(`✅ HTTP ${resposta.status} | ${url}`);

      return resposta;
    } catch (erro) {
      ultimoErro = erro;

      const status = erro.response?.status || "sem status";

      console.warn(`⚠️ Falha HTTP: ${url}`);
      console.warn(`   Status: ${status}`);

      if (tentativa < tentativas) {
        await esperar(1500 * tentativa);
      }
    }
  }

  throw ultimoErro;
}

// ======================================================
// DUPLICIDADE
// ======================================================

async function noticiaJaPublicada(canal, url) {
  if (!canal || !url) return false;

  try {
    const mensagens = await canal.messages.fetch({
      limit: 100,
    });

    for (const [, mensagem] of mensagens) {
      if (!mensagem.embeds?.length) continue;

      for (const embed of mensagem.embeds) {
        if (!embed.url) continue;

        if (embed.url === url) {
          return true;
        }
      }
    }
  } catch (erro) {
    console.warn(
      `⚠️ Não foi possível verificar duplicidade: ${erro.message}`
    );
  }

  return false;
}

// ======================================================
// PUBLICAÇÃO DE NOTÍCIA
// ======================================================

async function publicarNoticia({
  canal,
  fonte,
  titulo,
  url,
  descricao = "",
  imagem = null,
}) {
  if (!canal) {
    console.error(`❌ Canal não encontrado para ${fonte}.`);
    return false;
  }

  titulo = limparTitulo(titulo);
  descricao = normalizarTexto(descricao);

  if (!titulo || !url || !urlValida(url)) {
    console.warn(`⚠️ ${fonte}: notícia inválida.`);
    return false;
  }

  if (await noticiaJaPublicada(canal, url)) {
    console.log(`⏭️ ${fonte}: notícia já publicada, ignorando.`);
    return false;
  }

  const embed = new EmbedBuilder()
    .setTitle(titulo.substring(0, 256))
    .setURL(url)
    .setDescription(
      descricao
        ? descricao.substring(0, 1000)
        : `Confira a notícia completa em ${fonte}.`
    )
    .setFooter({
      text: `Murilito NEWS • ${fonte}`,
    })
    .setTimestamp();

  if (imagem && urlValida(imagem)) {
    embed.setImage(imagem);
  }

  try {
    await canal.send({
      embeds: [embed],
    });

    console.log(`📢 ${fonte}: notícia publicada.`);
    console.log(`   ${titulo}`);
    console.log(`   ${url}`);

    return true;
  } catch (erro) {
    console.error(
      `❌ Erro ao publicar notícia de ${fonte}:`,
      erro.message
    );

    return false;
  }
}

// ======================================================
// RSS GENÉRICO
// ======================================================

async function buscarRSS(url, fonte) {
  try {
    const resposta = await getComRetry(
      url,
      {
        responseType: "text",
      },
      3
    );

    const feed = await parser.parseString(resposta.data);

    if (!feed.items || feed.items.length === 0) {
      console.warn(`⚠️ ${fonte}: RSS sem itens.`);
      return [];
    }

    return feed.items
      .slice(0, MAX_NOTICIAS_ANALISADAS)
      .map((item) => ({
        titulo: limparTitulo(item.title),
        url: item.link,
        descricao:
          item.contentSnippet ||
          item.content ||
          item.summary ||
          "",
        imagem:
          item.enclosure?.url ||
          null,
        data:
          item.isoDate ||
          item.pubDate ||
          null,
      }))
      .filter((item) => item.titulo && urlValida(item.url));
  } catch (erro) {
    console.error(`❌ ${fonte}: erro no RSS.`);
    console.error(`   ${erro.message}`);

    return [];
  }
}

// ======================================================
// FORTNITE - API
// ======================================================

async function buscarFortniteAPI() {
  const urls = [
    "https://fortnite-api.com/v2/news",
    "https://fortnite-api.com/v2/news/br",
  ];

  for (const url of urls) {
    try {
      console.log(`🔎 Fortnite API: tentando ${url}`);

      const resposta = await getComRetry(url, {}, 2);

      const dados = resposta.data;

      if (!dados) {
        continue;
      }

      let itens = [];

      // Estrutura mais comum
      if (Array.isArray(dados.data)) {
        itens = dados.data;
      }

      // Algumas versões podem retornar objetos
      if (!itens.length && dados.data?.br) {
        itens = dados.data.br;
      }

      if (!itens.length && dados.data?.battleRoyale) {
        itens = dados.data.battleRoyale;
      }

      if (!itens.length && dados.data?.items) {
        itens = dados.data.items;
      }

      if (!itens.length) {
        console.warn(
          "⚠️ Fortnite API respondeu, mas não encontrei notícias na estrutura."
        );
        continue;
      }

      console.log(
        `📰 Fortnite API: ${itens.length} possíveis notícias.`
      );

      const noticias = itens
        .map((item) => {
          const titulo =
            item.title ||
            item.name ||
            item.headline ||
            item.news?.title ||
            "";

          const descricao =
            item.body ||
            item.description ||
            item.message ||
            item.news?.body ||
            "";

          const imagem =
            item.image ||
            item.imageUrl ||
            item.images?.[0]?.url ||
            item.news?.image ||
            null;

          let url =
            item.url ||
            item.link ||
            item.news?.url ||
            null;

          // Se a API não fornecer URL individual,
          // usamos a página oficial de notícias.
          if (!url) {
            url = "https://www.fortnite.com/news";
          }

          return {
            titulo: limparTitulo(titulo),
            descricao: normalizarTexto(descricao),
            url,
            imagem,
            data:
              item.date ||
              item.publishedAt ||
              item.published ||
              null,
          };
        })
        .filter((item) => item.titulo);

      if (noticias.length) {
        return noticias.slice(0, MAX_NOTICIAS_ANALISADAS);
      }
    } catch (erro) {
      console.warn(
        `⚠️ Fortnite API falhou: ${erro.message}`
      );
    }
  }

  return [];
}

// ======================================================
// FORTNITE - FALLBACK RSS
// ======================================================

async function buscarFortniteRSS() {
  console.log("🔁 Fortnite: usando fallback RSS.");

  const feeds = [
    // Notícias do Fortnite.gg
    "https://news.google.com/rss/search?q=site%3Afortnite.gg%2Fnews&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",

    // Notícias oficiais Fortnite
    "https://news.google.com/rss/search?q=site%3Afortnite.com%2Fnews&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",
  ];

  for (const feedUrl of feeds) {
    const noticias = await buscarRSS(
      feedUrl,
      "Fortnite RSS"
    );

    if (noticias.length) {
      return noticias;
    }
  }

  return [];
}

// ======================================================
// FORTNITE
// ======================================================

async function buscarFortnite() {
  console.log("🔎 Fortnite: iniciando busca de notícias.");

  // 1º tenta API
  let noticias = await buscarFortniteAPI();

  if (noticias.length) {
    console.log(
      `✅ Fortnite: API encontrou ${noticias.length} notícias.`
    );

    return noticias;
  }

  // 2º fallback RSS
  noticias = await buscarFortniteRSS();

  if (noticias.length) {
    console.log(
      `✅ Fortnite: RSS encontrou ${noticias.length} notícias.`
    );
  } else {
    console.warn(
      "⚠️ Fortnite: nenhuma notícia disponível."
    );
  }

  return noticias;
}

// ======================================================
// LIBERTYCITY
// ======================================================

function ehArtigoLibertyCity(url) {
  try {
    const parsed = new URL(url);

    if (
      parsed.hostname !== "pt.libertycity.net" &&
      parsed.hostname !== "www.libertycity.net"
    ) {
      return false;
    }

    const path = parsed.pathname;

    if (!path.startsWith("/news/")) {
      return false;
    }

    // Bloqueia paginação
    if (/^\/news\/page\/\d+\/?$/i.test(path)) {
      return false;
    }

    // Bloqueia raiz
    if (path === "/news/" || path === "/news") {
      return false;
    }

    // Bloqueia páginas genéricas
    const bloqueados = [
      "/news/category/",
      "/news/tag/",
      "/news/tags/",
      "/news/search/",
    ];

    for (const bloqueado of bloqueados) {
      if (path.startsWith(bloqueado)) {
        return false;
      }
    }

    const partes = path
      .split("/")
      .filter(Boolean);

    // /news/alguma-coisa
    return partes.length >= 2;
  } catch {
    return false;
  }
}

async function buscarLibertyCity() {
  const paginas = [
    "https://pt.libertycity.net/news/",
    "https://pt.libertycity.net/news/page/2/",
  ];

  for (const pagina of paginas) {
    try {
      const resposta = await getComRetry(
        pagina,
        {},
        3
      );

      const $ = cheerio.load(resposta.data);

      const noticias = [];

      $("a[href]").each((_, elemento) => {
        if (noticias.length >= MAX_NOTICIAS_ANALISADAS) {
          return;
        }

        const link = $(elemento).attr("href");

        if (!link) return;

        let urlFinal;

        try {
          urlFinal = new URL(
            link,
            "https://pt.libertycity.net"
          ).href;
        } catch {
          return;
        }

        if (!ehArtigoLibertyCity(urlFinal)) {
          return;
        }

        let titulo = normalizarTexto(
          $(elemento).text()
        );

        if (!titulo) {
          titulo = normalizarTexto(
            $(elemento)
              .closest("article")
              .find("h1,h2,h3,h4,.title")
              .first()
              .text()
          );
        }

        if (!titulo) return;

        // Evita lixo
        const tituloLower = titulo.toLowerCase();

        if (
          tituloLower.includes("próxima página") ||
          tituloLower.includes("next page") ||
          tituloLower === "mais notícias" ||
          tituloLower === "notícias"
        ) {
          return;
        }

        if (
          noticias.some(
            (item) => item.url === urlFinal
          )
        ) {
          return;
        }

        noticias.push({
          titulo,
          url: urlFinal,
          descricao: "",
          imagem: null,
        });
      });

      console.log(
        `🔎 LibertyCity: ${noticias.length} possíveis notícias.`
      );

      if (noticias.length) {
        return noticias;
      }
    } catch (erro) {
      console.error(
        `❌ LibertyCity: erro em ${pagina}`
      );

      console.error(`   ${erro.message}`);
    }
  }

  // Fallback RSS do Google News
  console.log(
    "🔁 LibertyCity: tentando fallback RSS."
  );

  const rss = await buscarRSS(
    "https://news.google.com/rss/search?q=site%3Apt.libertycity.net%2Fnews&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",
    "LibertyCity RSS"
  );

  return rss;
}

// ======================================================
// ROCKSTAR
// ======================================================

async function buscarRockstarRSS() {
  const feeds = [
    // Rockstar Newswire oficial
    "https://news.google.com/rss/search?q=site%3Arockstargames.com%2Fbr%2Fnewswire&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",

    // Rockstar Newswire sem /br
    "https://news.google.com/rss/search?q=site%3Arockstargames.com%2Fnewswire&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",
  ];

  for (const feedUrl of feeds) {
    const noticias = await buscarRSS(
      feedUrl,
      "Rockstar RSS"
    );

    if (!noticias.length) {
      continue;
    }

    // Mantém apenas itens realmente relacionados
    const filtradas = noticias.filter((item) => {
      const texto =
        `${item.titulo} ${item.url}`.toLowerCase();

      return (
        texto.includes("rockstar") ||
        texto.includes("gta") ||
        texto.includes("grand theft auto") ||
        texto.includes("red dead")
      );
    });

    if (filtradas.length) {
      return filtradas;
    }

    return noticias;
  }

  return [];
}

// ======================================================
// ROCKSTAR HTML - FALLBACK EXTRA
// ======================================================

async function buscarRockstarHTML() {
  const urls = [
    "https://www.rockstargames.com/br/newswire",
    "https://www.rockstargames.com/newswire",
  ];

  for (const url of urls) {
    try {
      const resposta = await getComRetry(
        url,
        {},
        2
      );

      const html = resposta.data;

      console.log(
        `🔎 Rockstar: HTML recebido (${html.length} caracteres).`
      );

      const $ = cheerio.load(html);

      const noticias = [];

      $("a[href]").each((_, elemento) => {
        if (noticias.length >= MAX_NOTICIAS_ANALISADAS) {
          return;
        }

        const href = $(elemento).attr("href");

        if (!href) return;

        if (
          !href.includes("/newswire/") &&
          !href.includes("/br/newswire/")
        ) {
          return;
        }

        let urlFinal;

        try {
          urlFinal = new URL(
            href,
            "https://www.rockstargames.com"
          ).href;
        } catch {
          return;
        }

        if (
          noticias.some(
            (item) => item.url === urlFinal
          )
        ) {
          return;
        }

        let titulo = normalizarTexto(
          $(elemento).text()
        );

        if (!titulo) {
          titulo = normalizarTexto(
            $(elemento)
              .closest("article")
              .find("h1,h2,h3,h4")
              .first()
              .text()
          );
        }

        if (!titulo) return;

        noticias.push({
          titulo,
          url: urlFinal,
          descricao: "",
          imagem: null,
        });
      });

      console.log(
        `🔎 Rockstar: ${noticias.length} possíveis URLs encontradas.`
      );

      if (noticias.length) {
        return noticias;
      }
    } catch (erro) {
      console.warn(
        `⚠️ Rockstar HTML falhou: ${erro.message}`
      );
    }
  }

  return [];
}

// ======================================================
// ROCKSTAR PRINCIPAL
// ======================================================

async function buscarRockstar() {
  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  // 1º método: RSS
  let noticias = await buscarRockstarRSS();

  if (noticias.length) {
    console.log(
      `✅ Rockstar: RSS encontrou ${noticias.length} notícias.`
    );

    return noticias;
  }

  // 2º método: HTML
  noticias = await buscarRockstarHTML();

  if (noticias.length) {
    console.log(
      `✅ Rockstar: HTML encontrou ${noticias.length} notícias.`
    );

    return noticias;
  }

  console.warn(
    "⚠️ Rockstar: nenhuma notícia disponível."
  );

  return [];
}

// ======================================================
// PROCESSAR UMA FONTE
// ======================================================

async function processarFonte({
  nome,
  canal,
  buscar,
}) {
  try {
    console.log("");
    console.log(`━━━━━━━━ ${nome} ━━━━━━━━`);

    const noticias = await buscar();

    if (!noticias || !noticias.length) {
      console.warn(
        `⚠️ ${nome}: nenhuma notícia encontrada.`
      );

      return false;
    }

    console.log(
      `📰 ${nome}: ${noticias.length} notícias recebidas.`
    );

    // Procura a primeira notícia que ainda não foi publicada
    for (const noticia of noticias) {
      const publicada = await noticiaJaPublicada(
        canal,
        noticia.url
      );

      if (publicada) {
        console.log(
          `⏭️ ${nome}: já publicada: ${noticia.titulo}`
        );

        continue;
      }

      const sucesso = await publicarNoticia({
        canal,
        fonte: nome,
        titulo: noticia.titulo,
        url: noticia.url,
        descricao: noticia.descricao,
        imagem: noticia.imagem,
      });

      if (sucesso) {
        return true;
      }
    }

    console.log(
      `⏭️ ${nome}: nenhuma notícia nova.`
    );

    return false;
  } catch (erro) {
    console.error(
      `❌ ${nome}: erro geral:`
    );

    console.error(erro);

    return false;
  }
}

// ======================================================
// CICLO DE NOTÍCIAS
// ======================================================

async function cicloNoticias() {
  if (cicloEmAndamento) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando. Ignorando."
    );

    return;
  }

  cicloEmAndamento = true;

  try {
    console.log("");
    console.log("========================================");
    console.log("📰 INICIANDO CICLO DE NOTÍCIAS");
    console.log(
      `🇧🇷 ${new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })}`
    );
    console.log("========================================");

    const canalFortnite =
      await client.channels.fetch(ID_FORTNITE);

    const canalGTA =
      await client.channels.fetch(ID_GTA);

    // Fortnite
    await processarFonte({
      nome: "Fortnite",
      canal: canalFortnite,
      buscar: buscarFortnite,
    });

    // Pequena pausa entre fontes
    await esperar(2000);

    // LibertyCity
    await processarFonte({
      nome: "LibertyCity",
      canal: canalGTA,
      buscar: buscarLibertyCity,
    });

    await esperar(2000);

    // Rockstar
    await processarFonte({
      nome: "Rockstar",
      canal: canalGTA,
      buscar: buscarRockstar,
    });

    console.log("========================================");
    console.log("✅ CICLO FINALIZADO");
    console.log("========================================");
  } catch (erro) {
    console.error(
      "❌ Erro no ciclo de notícias:",
      erro
    );
  } finally {
    cicloEmAndamento = false;
  }
}

// ======================================================
// LOJA FORTNITE
// ======================================================

async function postarLojaFortnite() {
  try {
    const canal =
      await client.channels.fetch(ID_LOJA);

    if (!canal) {
      console.error(
        "❌ Canal da loja não encontrado."
      );

      return false;
    }

    const urlLoja =
      "https://fortnite.gg/shop";

    const embed = new EmbedBuilder()
      .setTitle("🛍️ LOJA DO FORTNITE")
      .setDescription(
        "Confira a loja do Fortnite atualizada!"
      )
      .setURL(urlLoja)
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
      "✅ Loja Fortnite publicada."
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

// ======================================================
// CONTROLE DA LOJA - 21:00
// ======================================================

async function verificarHorarioLoja() {
  try {
    const agora = new Date();

    const partes = new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).formatToParts(agora);

    const valores = {};

    for (const parte of partes) {
      valores[parte.type] = parte.value;
    }

    const ano = valores.year;
    const mes = valores.month;
    const dia = valores.day;
    const hora = Number(valores.hour);
    const minuto = Number(valores.minute);

    const dataHoje = `${ano}-${mes}-${dia}`;

    if (
      hora === HORA_LOJA &&
      minuto === MINUTO_LOJA &&
      ultimoDiaLoja !== dataHoje
    ) {
      console.log(
        "⏰ Horário da loja atingido."
      );

      const sucesso =
        await postarLojaFortnite();

      if (sucesso) {
        ultimoDiaLoja = dataHoje;
      }
    }
  } catch (erro) {
    console.error(
      "❌ Erro no controle da loja:",
      erro.message
    );
  }
}

// ======================================================
// PIADA
// ======================================================

const piadas = [
  "😂 O cara entrou no GTA RP para ser cidadão de bem e terminou preso.",
  "🤣 Fortnite: onde 12 anos de idade podem acabar com sua autoestima em 30 segundos.",
  "😂 Meu PC roda GTA RP tão bem que até o personagem pede para trocar de computador.",
  "🤣 Eu ia jogar só 20 minutos... 4 horas depois ainda estou procurando vaga no servidor.",
  "😂 A internet caiu e eu descobri que tenho uma família.",
  "🤣 O maior inimigo do jogador não é outro player. É o ping.",
  "😂 Meu FPS está tão baixo que o personagem anda por turnos.",
];

// ======================================================
// COMANDOS
// ======================================================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const conteudo = message.content.trim();

  // ==============================================
  // TESTE
  // ==============================================

  if (conteudo === "!teste") {
    await message.reply(
      "🧪 Iniciando teste completo das fontes..."
    );

    await cicloNoticias();

    return;
  }

  // ==============================================
  // TESTE FORTNITE
  // ==============================================

  if (conteudo === "!teste fortnite") {
    await message.reply(
      "🧪 Testando fonte Fortnite..."
    );

    const canal =
      await client.channels.fetch(ID_FORTNITE);

    await processarFonte({
      nome: "Fortnite",
      canal,
      buscar: buscarFortnite,
    });

    return;
  }

  // ==============================================
  // TESTE LIBERTYCITY
  // ==============================================

  if (conteudo === "!teste liberty") {
    await message.reply(
      "🧪 Testando fonte LibertyCity..."
    );

    const canal =
      await client.channels.fetch(ID_GTA);

    await processarFonte({
      nome: "LibertyCity",
      canal,
      buscar: buscarLibertyCity,
    });

    return;
  }

  // ==============================================
  // TESTE ROCKSTAR
  // ==============================================

  if (conteudo === "!teste rockstar") {
    await message.reply(
      "🧪 Testando fonte Rockstar..."
    );

    const canal =
      await client.channels.fetch(ID_GTA);

    await processarFonte({
      nome: "Rockstar",
      canal,
      buscar: buscarRockstar,
    });

    return;
  }

  // ==============================================
  // TESTE LOJA
  // ==============================================

  if (conteudo === "!teste loja") {
    await message.reply(
      "🧪 Publicando teste da loja..."
    );

    await postarLojaFortnite();

    return;
  }

  // ==============================================
  // PIADA
  // ==============================================

  if (conteudo === "!piada") {
    const piada =
      piadas[Math.floor(Math.random() * piadas.length)];

    await message.reply(piada);

    return;
  }

  // ==============================================
  // AJUDA
  // ==============================================

  if (conteudo === "!ajuda") {
    const embed = new EmbedBuilder()
      .setTitle("🤖 Murilito NEWS")
      .setDescription(
        "Comandos disponíveis:"
      )
      .addFields(
        {
          name: "🧪 Testes",
          value:
            "`!teste`\n" +
            "`!teste fortnite`\n" +
            "`!teste liberty`\n" +
            "`!teste rockstar`\n" +
            "`!teste loja`",
        },
        {
          name: "😂 Diversão",
          value: "`!piada`",
        }
      )
      .setFooter({
        text: "Murilito NEWS",
      });

    await message.reply({
      embeds: [embed],
    });

    return;
  }
});

// ======================================================
// BOT ONLINE
// ======================================================

client.once("ready", async () => {
  console.log("");
  console.log("========================================");
  console.log("🤖 MURILITO NEWS ONLINE");
  console.log("========================================");
  console.log(`👤 Logado como: ${client.user.tag}`);
  console.log(`🆔 ID: ${client.user.id}`);
  console.log("========================================");

  console.log(
    "⏰ Loja configurada para 21:00 (Brasil)."
  );

  console.log(
    "📰 Notícias configuradas para verificar a cada 10 minutos."
  );

  console.log(
    "========================================"
  );

  // Primeira verificação de notícias
  await cicloNoticias();

  // Verifica notícias a cada 10 minutos
  setInterval(
    cicloNoticias,
    INTERVALO_NOTICIAS
  );

  // Verifica horário da loja
  setInterval(
    verificarHorarioLoja,
    30 * 1000
  );

  // Verificação inicial da loja
  await verificarHorarioLoja();
});

// ======================================================
// ERROS
// ======================================================

process.on("unhandledRejection", (erro) => {
  console.error(
    "❌ Unhandled Rejection:",
    erro
  );
});

process.on("uncaughtException", (erro) => {
  console.error(
    "❌ Uncaught Exception:",
    erro
  );
});

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
