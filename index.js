require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

const CONFIG = {
  intervaloNoticias: 10 * 60 * 1000, // 10 minutos
  horarioLoja: "21:00",
  timezone: "America/Sao_Paulo",

  timeout: 20000,
  tentativas: 3,

  mensagensVerificar: 100,

  // Quantos segundos esperar entre publicações
  intervaloPublicacao: 3,
};

// ============================================================
// CLIENTE DISCORD
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
  timeout: CONFIG.timeout,

  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9," +
      "image/avif,image/webp,image/apng,*/*;q=0.8",

    "Accept-Language":
      "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",

    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },

  maxRedirects: 5,
});

// ============================================================
// CONTROLE
// ============================================================

let cicloEmAndamento = false;
let lojaPublicadaHoje = false;
let ultimoDiaLoja = null;

// Evita que duas execuções publiquem a mesma notícia
const noticiasProcessadas = {
  fortnite: new Set(),
  libertycity: new Set(),
  rockstar: new Set(),
};

// ============================================================
// PIADAS
// ============================================================

const piadas = [
  "Por que o jogador caiu do ônibus? Porque esqueceu de abrir o planador. 😂",
  "Meu FPS está tão baixo que o inimigo me mata antes de eu ver a skin. 💀",
  "O GTA não trava. Ele só está pensando. 🤣",
  "Meu PC não tem Ray Tracing, mas tem sofrimento em 4K. 😂",
  "Fui jogar Fortnite e voltei três horas depois. A culpa é do matchmaking. 🎮",
  "Meu personagem tem mais skins que eu tenho roupas. 😎",
];

// ============================================================
// UTILITÁRIOS
// ============================================================

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limitarTexto(texto, limite = 4000) {
  if (!texto) return "";

  texto = String(texto)
    .replace(/\s+/g, " ")
    .trim();

  if (texto.length <= limite) {
    return texto;
  }

  return texto.substring(0, limite - 3) + "...";
}

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function urlAbsoluta(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

function obterImagem($, elemento, baseUrl) {
  const img = $(elemento).find("img").first();

  if (!img.length) {
    return null;
  }

  const candidatos = [
    img.attr("src"),
    img.attr("data-src"),
    img.attr("data-lazy-src"),
    img.attr("data-original"),
    img.attr("srcset")?.split(",")[0]?.trim()?.split(" ")[0],
  ];

  for (const imagem of candidatos) {
    if (!imagem) continue;

    const absoluta = urlAbsoluta(imagem, baseUrl);

    if (absoluta) {
      return absoluta;
    }
  }

  return null;
}

function extrairMetaImagem($) {
  const imagens = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[property="twitter:image"]').attr("content"),
  ];

  return imagens.find(Boolean) || null;
}

function extrairMetaDescricao($) {
  return limparTexto(
    $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      ""
  );
}

function extrairMetaTitulo($) {
  return limparTexto(
    $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").first().text() ||
      ""
  );
}

// ============================================================
// DOWNLOAD COM RETRY
// ============================================================

async function baixarPagina(url, opcoes = {}) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= CONFIG.tentativas; tentativa++) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${CONFIG.tentativas}`
      );

      const resposta = await http.get(url, {
        responseType: opcoes.responseType || "text",
        headers: opcoes.headers || {},
      });

      console.log(
        `✅ HTTP ${resposta.status} | ${url}`
      );

      return resposta.data;
    } catch (erro) {
      ultimoErro = erro;

      console.log(
        `⚠️ Falha HTTP: ${url}`
      );

      console.log(
        `   ${erro.response?.status || erro.code || erro.message}`
      );

      if (tentativa < CONFIG.tentativas) {
        await esperar(1500 * tentativa);
      }
    }
  }

  throw ultimoErro;
}

// ============================================================
// VERIFICAR DUPLICATA
// ============================================================

async function noticiaJaPublicada(channel, url) {
  if (!channel || !url) return false;

  try {
    const mensagens = await channel.messages.fetch({
      limit: CONFIG.mensagensVerificar,
    });

    for (const [, mensagem] of mensagens) {
      if (!mensagem.embeds?.length) continue;

      for (const embed of mensagem.embeds) {
        if (embed.url && embed.url === url) {
          return true;
        }
      }
    }

    return false;
  } catch (erro) {
    console.log(
      `⚠️ Não foi possível verificar duplicata: ${erro.message}`
    );

    return false;
  }
}

// ============================================================
// PUBLICAR NOTÍCIA
// ============================================================

async function publicarNoticia({
  channel,
  fonte,
  titulo,
  url,
  descricao,
  imagem,
  emoji = "📰",
}) {
  try {
    if (!channel) {
      console.log(`❌ ${fonte}: canal não encontrado.`);
      return false;
    }

    if (!titulo || !url) {
      console.log(
        `❌ ${fonte}: notícia sem título ou URL válida.`
      );

      return false;
    }

    const jaPublicada = await noticiaJaPublicada(
      channel,
      url
    );

    if (jaPublicada) {
      console.log(
        `⏭️ ${fonte}: notícia já publicada, ignorando.`
      );

      return false;
    }

    const embed = new EmbedBuilder()
      .setTitle(limitarTexto(titulo, 256))
      .setURL(url)
      .setDescription(
        limitarTexto(
          descricao ||
            "Confira a notícia completa no site oficial.",
          4000
        )
      )
      .setFooter({
        text: `Murilito NEWS • ${fonte}`,
      })
      .setTimestamp();

    if (imagem) {
      try {
        embed.setImage(imagem);
      } catch {
        console.log(
          `⚠️ ${fonte}: imagem inválida, continuando sem imagem.`
        );
      }
    }

    await channel.send({
      content: `${emoji} **Nova notícia: ${fonte}**`,
      embeds: [embed],
    });

    console.log(
      `✅ ${fonte}: notícia publicada: ${titulo}`
    );

    return true;
  } catch (erro) {
    console.log(
      `❌ ${fonte}: erro ao publicar notícia.`
    );

    console.log(erro.message);

    return false;
  }
}

// ============================================================
// FORTNITE
// ============================================================

async function buscarFortnite() {
  const fontes = [
    "https://fortnite.gg/news",
    "https://fortnite.gg/news/",
  ];

  for (const urlFonte of fontes) {
    try {
      console.log(`🔎 Fortnite: tentando ${urlFonte}`);

      const html = await baixarPagina(urlFonte);

      const $ = cheerio.load(html);

      const candidatos = [];

      $("a[href]").each((_, elemento) => {
        const href = $(elemento).attr("href");

        if (!href) return;

        const url = urlAbsoluta(
          href,
          "https://fortnite.gg"
        );

        if (!url) return;

        const urlLower = url.toLowerCase();

        if (
          !urlLower.includes("/news/") ||
          urlLower === "https://fortnite.gg/news"
        ) {
          return;
        }

        const titulo = limparTexto(
          $(elemento).find("h1,h2,h3,h4").first().text() ||
            $(elemento).text()
        );

        if (!titulo || titulo.length < 5) return;

        candidatos.push({
          titulo,
          url,
          imagem:
            obterImagem(
              $,
              elemento,
              "https://fortnite.gg"
            ) || extrairMetaImagem($),
        });
      });

      // Remover duplicados
      const unicos = [];

      for (const noticia of candidatos) {
        if (
          !unicos.some(
            (item) => item.url === noticia.url
          )
        ) {
          unicos.push(noticia);
        }
      }

      console.log(
        `🔎 Fortnite: ${unicos.length} possíveis notícias encontradas.`
      );

      if (!unicos.length) {
        continue;
      }

      const noticia = unicos[0];

      console.log(
        `📰 Fortnite encontrada: ${noticia.titulo}`
      );

      // Abrir a notícia para pegar descrição/imagem
      try {
        const artigoHtml = await baixarPagina(
          noticia.url
        );

        const artigo$ = cheerio.load(artigoHtml);

        const titulo =
          extrairMetaTitulo(artigo$) ||
          noticia.titulo;

        const descricao =
          extrairMetaDescricao(artigo$) ||
          limparTexto(
            artigo$("article p, main p, p")
              .first()
              .text()
          );

        const imagem =
          extrairMetaImagem(artigo$) ||
          noticia.imagem;

        return {
          fonte: "Fortnite",
          titulo,
          url: noticia.url,
          descricao,
          imagem,
        };
      } catch {
        return {
          fonte: "Fortnite",
          titulo: noticia.titulo,
          url: noticia.url,
          descricao:
            "Confira a notícia completa no Fortnite.gg.",
          imagem: noticia.imagem,
        };
      }
    } catch (erro) {
      console.log(
        `❌ Fortnite: erro ao processar ${urlFonte}`
      );

      console.log(
        `   ${erro.message}`
      );
    }
  }

  console.log(
    "❌ Fortnite: nenhuma notícia encontrada."
  );

  return null;
}

// ============================================================
// LIBERTYCITY
// ============================================================

async function buscarLibertyCity() {
  const urlBase =
    "https://pt.libertycity.net/news/";

  try {
    const html = await baixarPagina(urlBase);

    const $ = cheerio.load(html);

    const candidatos = [];

    $("a[href]").each((_, elemento) => {
      const href = $(elemento).attr("href");

      if (!href) return;

      const url = urlAbsoluta(
        href,
        "https://pt.libertycity.net"
      );

      if (!url) return;

      if (
        !url.includes("pt.libertycity.net/news/")
      ) {
        return;
      }

      const titulo =
        limparTexto(
          $(elemento)
            .find("h1,h2,h3,h4,.title")
            .first()
            .text()
        ) ||
        limparTexto($(elemento).text());

      if (!titulo || titulo.length < 5) return;

      // Evita páginas genéricas
      if (
        titulo.toLowerCase() === "news" ||
        titulo.toLowerCase() === "notícias"
      ) {
        return;
      }

      candidatos.push({
        titulo,
        url,
        imagem: obterImagem(
          $,
          elemento,
          "https://pt.libertycity.net"
        ),
      });
    });

    const unicos = [];

    for (const noticia of candidatos) {
      if (
        !unicos.some(
          (item) => item.url === noticia.url
        )
      ) {
        unicos.push(noticia);
      }
    }

    console.log(
      `🔎 LibertyCity: ${unicos.length} possíveis notícias.`
    );

    if (!unicos.length) {
      console.log(
        "❌ LibertyCity: nenhuma notícia encontrada."
      );

      return null;
    }

    const noticia = unicos[0];

    console.log(
      `📰 LibertyCity encontrada: ${noticia.titulo}`
    );

    try {
      const artigoHtml = await baixarPagina(
        noticia.url
      );

      const artigo$ = cheerio.load(artigoHtml);

      const titulo =
        extrairMetaTitulo(artigo$) ||
        noticia.titulo;

      const descricao =
        extrairMetaDescricao(artigo$) ||
        limparTexto(
          artigo$("article p, .article p, main p, p")
            .first()
            .text()
        );

      const imagem =
        extrairMetaImagem(artigo$) ||
        noticia.imagem;

      return {
        fonte: "LibertyCity",
        titulo,
        url: noticia.url,
        descricao:
          descricao ||
          "Confira a notícia completa no LibertyCity.",
        imagem,
      };
    } catch {
      return {
        fonte: "LibertyCity",
        titulo: noticia.titulo,
        url: noticia.url,
        descricao:
          "Confira a notícia completa no LibertyCity.",
        imagem: noticia.imagem,
      };
    }
  } catch (erro) {
    console.log(
      `❌ LibertyCity: ${erro.message}`
    );

    return null;
  }
}

// ============================================================
// ROCKSTAR
// ============================================================

async function buscarRockstar() {
  const urlBase =
    "https://www.rockstargames.com/br/newswire";

  try {
    const html = await baixarPagina(urlBase);

    console.log(
      `🔎 Rockstar: HTML recebido (${html.length} caracteres).`
    );

    const $ = cheerio.load(html);

    const candidatos = [];

    // --------------------------------------------------------
    // MÉTODO 1 - links tradicionais
    // --------------------------------------------------------

    $("a[href]").each((_, elemento) => {
      const href = $(elemento).attr("href");

      if (!href) return;

      const url = urlAbsoluta(
        href,
        "https://www.rockstargames.com"
      );

      if (!url) return;

      const urlLower = url.toLowerCase();

      if (
        !urlLower.includes("/newswire/")
      ) {
        return;
      }

      const titulo =
        limparTexto(
          $(elemento)
            .find("h1,h2,h3,h4,h5")
            .first()
            .text()
        ) ||
        limparTexto($(elemento).text());

      if (!titulo || titulo.length < 5) {
        return;
      }

      candidatos.push({
        titulo,
        url,
        imagem: obterImagem(
          $,
          elemento,
          "https://www.rockstargames.com"
        ),
      });
    });

    // --------------------------------------------------------
    // MÉTODO 2 - procurar URLs dentro do HTML bruto
    // --------------------------------------------------------

    const regex =
      /(?:https?:\/\/www\.rockstargames\.com)?\/br\/newswire\/[^"'\\<>\s]+/gi;

    const encontrados =
      html.match(regex) || [];

    for (const encontrado of encontrados) {
      const url = urlAbsoluta(
        encontrado,
        "https://www.rockstargames.com"
      );

      if (!url) continue;

      candidatos.push({
        titulo: "",
        url,
        imagem: null,
      });
    }

    // --------------------------------------------------------
    // Remover duplicados
    // --------------------------------------------------------

    const unicos = [];

    for (const noticia of candidatos) {
      if (
        !unicos.some(
          (item) => item.url === noticia.url
        )
      ) {
        unicos.push(noticia);
      }
    }

    console.log(
      `🔎 Rockstar: ${unicos.length} possíveis URLs encontradas.`
    );

    // --------------------------------------------------------
    // Se achou URL mas não achou título,
    // abrir a página individual
    // --------------------------------------------------------

    for (const noticia of unicos.slice(0, 10)) {
      try {
        const artigoHtml =
          await baixarPagina(noticia.url);

        const artigo$ =
          cheerio.load(artigoHtml);

        const titulo =
          extrairMetaTitulo(artigo$) ||
          noticia.titulo;

        if (!titulo || titulo.length < 5) {
          continue;
        }

        const descricao =
          extrairMetaDescricao(artigo$) ||
          limparTexto(
            artigo$("article p, main p, p")
              .first()
              .text()
          );

        const imagem =
          extrairMetaImagem(artigo$) ||
          noticia.imagem;

        console.log(
          `📰 Rockstar encontrada: ${titulo}`
        );

        return {
          fonte: "Rockstar Games",
          titulo,
          url: noticia.url,
          descricao:
            descricao ||
            "Confira a notícia completa no Rockstar Newswire.",
          imagem,
        };
      } catch (erro) {
        console.log(
          `⚠️ Rockstar: não foi possível abrir ${noticia.url}`
        );
      }
    }

    // --------------------------------------------------------
    // FALLBACK: procurar dados JSON embutidos
    // --------------------------------------------------------

    const scripts = $("script")
      .map((_, el) => $(el).html())
      .get()
      .filter(Boolean);

    for (const script of scripts) {
      if (
        !script.includes("newswire") &&
        !script.includes("Newswire")
      ) {
        continue;
      }

      const urls =
        script.match(
          /\/br\/newswire\/[A-Za-z0-9_\-./?=&]+/g
        ) || [];

      if (!urls.length) continue;

      const url = urlAbsoluta(
        urls[0],
        "https://www.rockstargames.com"
      );

      if (!url) continue;

      console.log(
        `🔎 Rockstar fallback encontrou: ${url}`
      );

      return {
        fonte: "Rockstar Games",
        titulo: "Nova notícia no Rockstar Newswire",
        url,
        descricao:
          "Confira a notícia mais recente diretamente no Rockstar Newswire.",
        imagem: null,
      };
    }

    console.log(
      "❌ Rockstar: não foi possível identificar notícias no HTML."
    );

    return null;
  } catch (erro) {
    console.log(
      `❌ Rockstar: ${erro.message}`
    );

    return null;
  }
}

// ============================================================
// LOJA FORTNITE
// ============================================================

async function postarLojaFortnite() {
  try {
    const channel =
      await client.channels.fetch(ID_LOJA);

    if (!channel) {
      console.log(
        "❌ Canal da loja não encontrado."
      );

      return false;
    }

    const embed = new EmbedBuilder()
      .setTitle("🛒 Loja Fortnite")
      .setDescription(
        "A loja do Fortnite foi atualizada!\n\n" +
        "Confira todas as skins, itens e novidades:"
      )
      .setURL("https://fortnite.gg/shop")
      .setImage(
        "https://fortnite.gg/img/og-shop.jpg"
      )
      .setFooter({
        text: "Murilito NEWS • Fortnite Shop",
      })
      .setTimestamp();

    await channel.send({
      content:
        "🛒 **LOJA DO FORTNITE ATUALIZADA!**",
      embeds: [embed],
    });

    console.log(
      "✅ Loja Fortnite publicada."
    );

    return true;
  } catch (erro) {
    console.log(
      `❌ Loja Fortnite: ${erro.message}`
    );

    return false;
  }
}

// ============================================================
// PUBLICAR FORTNITE
// ============================================================

async function postarFortnite() {
  try {
    const noticia = await buscarFortnite();

    if (!noticia) {
      console.log(
        "⚠️ Fortnite: nenhuma notícia disponível."
      );

      return;
    }

    const channel =
      await client.channels.fetch(ID_FORTNITE);

    await publicarNoticia({
      channel,
      ...noticia,
      emoji: "🎮",
    });
  } catch (erro) {
    console.log(
      `❌ Fortnite: ${erro.message}`
    );
  }
}

// ============================================================
// PUBLICAR LIBERTYCITY
// ============================================================

async function postarLibertyCity() {
  try {
    const noticia =
      await buscarLibertyCity();

    if (!noticia) {
      console.log(
        "⚠️ LibertyCity: nenhuma notícia disponível."
      );

      return;
    }

    const channel =
      await client.channels.fetch(ID_GTA);

    await publicarNoticia({
      channel,
      ...noticia,
      emoji: "🚗",
    });
  } catch (erro) {
    console.log(
      `❌ LibertyCity: ${erro.message}`
    );
  }
}

// ============================================================
// PUBLICAR ROCKSTAR
// ============================================================

async function postarRockstar() {
  try {
    const noticia =
      await buscarRockstar();

    if (!noticia) {
      console.log(
        "⚠️ Rockstar: nenhuma notícia disponível."
      );

      return;
    }

    const channel =
      await client.channels.fetch(ID_GTA);

    await publicarNoticia({
      channel,
      ...noticia,
      emoji: "🎮",
    });
  } catch (erro) {
    console.log(
      `❌ Rockstar: ${erro.message}`
    );
  }
}

// ============================================================
// CICLO DE NOTÍCIAS
// ============================================================

async function executarCicloNoticias() {
  if (cicloEmAndamento) {
    console.log(
      "⏭️ Ciclo anterior ainda está executando. Ignorando."
    );

    return;
  }

  cicloEmAndamento = true;

  console.log("");
  console.log(
    "📰 INICIANDO CICLO DE NOTÍCIAS"
  );
  console.log(
    `🇧🇷 ${new Date().toLocaleString("pt-BR", {
      timeZone: CONFIG.timezone,
    })}`
  );
  console.log(
    "========================================"
  );

  try {
    // Fortnite
    await postarFortnite();

    await esperar(CONFIG.intervaloPublicacao);

    // LibertyCity
    await postarLibertyCity();

    await esperar(CONFIG.intervaloPublicacao);

    // Rockstar
    await postarRockstar();
  } catch (erro) {
    console.log(
      `❌ Erro geral no ciclo: ${erro.message}`
    );
  }

  console.log(
    "========================================"
  );

  console.log(
    "✅ CICLO FINALIZADO"
  );

  cicloEmAndamento = false;
}

// ============================================================
// CONTROLE DA LOJA - HORÁRIO DE BRASÍLIA
// ============================================================

function verificarHorarioLoja() {
  const agora = new Date();

  const partes = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: CONFIG.timezone,
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

  const horaAtual =
    `${valores.hour}:${valores.minute}`;

  const diaAtual =
    `${valores.year}-${valores.month}-${valores.day}`;

  if (
    horaAtual === CONFIG.horarioLoja &&
    ultimoDiaLoja !== diaAtual
  ) {
    ultimoDiaLoja = diaAtual;

    console.log(
      "🛒 Horário da loja atingido. Publicando..."
    );

    postarLojaFortnite();
  }
}

// ============================================================
// PIADA
// ============================================================

async function enviarPiada(message) {
  const piada =
    piadas[
      Math.floor(
        Math.random() * piadas.length
      )
    ];

  await message.reply(
    `😂 **Piada do Murilito:**\n${piada}`
  );
}

// ============================================================
// AJUDA
// ============================================================

async function enviarAjuda(message) {
  await message.reply(
    [
      "🤖 **MURILITO NEWS**",
      "",
      "`!piada` → Recebe uma piada",
      "`!teste` → Testa todas as fontes",
      "`!teste fortnite` → Testa Fortnite",
      "`!teste liberty` → Testa LibertyCity",
      "`!teste rockstar` → Testa Rockstar",
      "`!teste loja` → Testa a loja",
      "`!ajuda` → Mostra esta mensagem",
    ].join("\n")
  );
}

// ============================================================
// TESTES
// ============================================================

async function executarTeste(tipo, message) {
  switch (tipo) {
    case "fortnite":
      await message.reply(
        "🔎 Testando fonte Fortnite..."
      );

      await postarFortnite();

      await message.channel.send(
        "✅ Teste Fortnite finalizado. Veja os logs do Railway para detalhes."
      );
      break;

    case "liberty":
    case "libertycity":
      await message.reply(
        "🔎 Testando LibertyCity..."
      );

      await postarLibertyCity();

      await message.channel.send(
        "✅ Teste LibertyCity finalizado. Veja os logs do Railway para detalhes."
      );
      break;

    case "rockstar":
      await message.reply(
        "🔎 Testando Rockstar..."
      );

      await postarRockstar();

      await message.channel.send(
        "✅ Teste Rockstar finalizado. Veja os logs do Railway para detalhes."
      );
      break;

    case "loja":
      await message.reply(
        "🛒 Testando loja Fortnite..."
      );

      await postarLojaFortnite();

      await message.channel.send(
        "✅ Teste da loja finalizado."
      );
      break;

    default:
      await message.reply(
        "🧪 Iniciando teste completo..."
      );

      await postarFortnite();

      await esperar(CONFIG.intervaloPublicacao);

      await postarLibertyCity();

      await esperar(CONFIG.intervaloPublicacao);

      await postarRockstar();

      await esperar(CONFIG.intervaloPublicacao);

      await postarLojaFortnite();

      await message.channel.send(
        "✅ Teste completo finalizado."
      );
  }
}

// ============================================================
// EVENTO READY
// ============================================================

client.once("ready", async () => {
  console.log("");
  console.log("========================================");
  console.log("🤖 MURILITO NEWS ONLINE");
  console.log(`👤 Login: ${client.user.tag}`);
  console.log("========================================");

  console.log(
    `📰 Notícias: a cada ${CONFIG.intervaloNoticias / 60000} minutos`
  );

  console.log(
    `🛒 Loja: todos os dias às ${CONFIG.horarioLoja} (Brasil)`
  );

  console.log(
    "========================================"
  );

  // Executa um ciclo inicial
  await executarCicloNoticias();

  // Notícias
  setInterval(
    executarCicloNoticias,
    CONFIG.intervaloNoticias
  );

  // Loja
  setInterval(
    verificarHorarioLoja,
    30000
  );

  console.log(
    "⏰ Agendamentos iniciados."
  );
});

// ============================================================
// MENSAGENS
// ============================================================

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const texto = message.content
      .trim()
      .toLowerCase();

    if (!texto.startsWith("!")) {
      return;
    }

    if (texto === "!piada") {
      await enviarPiada(message);
      return;
    }

    if (texto === "!ajuda") {
      await enviarAjuda(message);
      return;
    }

    if (texto === "!teste") {
      await executarTeste(
        "todos",
        message
      );

      return;
    }

    if (texto === "!teste fortnite") {
      await executarTeste(
        "fortnite",
        message
      );

      return;
    }

    if (
      texto === "!teste liberty" ||
      texto === "!teste libertycity"
    ) {
      await executarTeste(
        "liberty",
        message
      );

      return;
    }

    if (texto === "!teste rockstar") {
      await executarTeste(
        "rockstar",
        message
      );

      return;
    }

    if (texto === "!teste loja") {
      await executarTeste(
        "loja",
        message
      );

      return;
    }
  } catch (erro) {
    console.log(
      `❌ Erro no comando: ${erro.message}`
    );

    try {
      await message.reply(
        "❌ Ocorreu um erro ao executar o comando."
      );
    } catch {}
  }
});

// ============================================================
// REAÇÕES
// ============================================================

client.on(
  "messageReactionAdd",
  async (reaction, user) => {
    try {
      if (user.bot) return;

      if (
        reaction.emoji.name === "🛒"
      ) {
        console.log(
          `🛒 ${user.tag} reagiu com carrinho.`
        );
      }

      if (
        reaction.emoji.name === "🚗"
      ) {
        console.log(
          `🚗 ${user.tag} reagiu com carro.`
        );
      }
    } catch (erro) {
      console.log(
        `⚠️ Erro na reação: ${erro.message}`
      );
    }
  }
);

// ============================================================
// ERROS
// ============================================================

process.on(
  "unhandledRejection",
  (erro) => {
    console.error(
      "❌ UNHANDLED REJECTION:",
      erro
    );
  }
);

process.on(
  "uncaughtException",
  (erro) => {
    console.error(
      "❌ UNCAUGHT EXCEPTION:",
      erro
    );
  }
);

// ============================================================
// LOGIN
// ============================================================

if (!TOKEN) {
  console.error(
    "❌ DISCORD_TOKEN não encontrado nas variáveis do Railway."
  );

  process.exit(1);
}

client.login(TOKEN).catch((erro) => {
  console.error(
    "❌ Erro ao conectar no Discord:"
  );

  console.error(erro);
});
