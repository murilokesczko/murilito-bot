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

// CANAIS
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// INTERVALOS
const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const HORA_LOJA = 21;
const MINUTO_LOJA = 0;

// Não aceitar notícias muito antigas
const MAX_IDADE_NOTICIA_DIAS = 7;

// ======================================================
// VALIDA TOKEN
// ======================================================

if (!TOKEN) {
  console.error(
    "❌ TOKEN não encontrado nas variáveis do Railway."
  );
  process.exit(1);
}

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
// RSS
// ======================================================

const parser = new Parser({
  timeout: 15000,
});

// ======================================================
// HTTP
// ======================================================

const http = axios.create({
  timeout: 15000,
  maxRedirects: 5,

  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",

    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.7",

    "Accept-Language":
      "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

// ======================================================
// ESTADO
// ======================================================

let ultimoDiaLoja = null;
let cicloEmAndamento = false;

// ======================================================
// FRASES
// ======================================================

const frasesFortnite = [
  "🚨 PARA TUDO! Tem novidade no Fortnite! Até seu duo precisa saber.",
  "🔥 O Fortnite acordou! E trouxe novidade para a galera.",
  "👀 ALERTA DE NOTÍCIA! Depois não diga que ninguém avisou.",
  "🎮 Mais uma notícia saindo do forno! Bora conferir antes de todo mundo.",
  "🚨 Breaking News do Fortnite! Seu squad foi oficialmente convocado.",
  "😂 Pare o que você está fazendo. Isso é importante... ou pelo menos parece.",
  "🔥 O Murilito NEWS não dorme! Mais uma novidade na área.",
  "👑 Informação chegando mais rápido que player correndo da tempestade.",
];

const frasesGTA = [
  "🚨 ATENÇÃO, LOS SANTOS! Tem novidade chegando.",
  "🔥 Notícia nova! Já prepara o carro e vai conferir.",
  "🚔 A polícia de Los Santos já está sabendo. E você?",
  "😂 Mais uma fofoca diretamente do mundo da Rockstar.",
  "🚗 Pega o carro, aumenta o som e vem conferir essa notícia.",
  "💰 Tem novidade na cidade! Só não pergunta de onde veio o dinheiro.",
  "👀 O Murilito NEWS descobriu primeiro. Corre conferir!",
  "🔥 Los Santos não para e o Murilito NEWS também não.",
];

function fraseAleatoria(lista) {
  return lista[
    Math.floor(Math.random() * lista.length)
  ];
}

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
  return normalizarTexto(titulo)
    .replace(/\s+-\s+Rockstar Games$/i, "")
    .replace(/\s+-\s+Fortnite$/i, "")
    .replace(/\s+-\s+FortniteGG$/i, "")
    .trim();
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
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

// ======================================================
// DATA
// ======================================================

function dataValida(data) {
  if (!data) return true;

  const timestamp = new Date(data).getTime();

  if (Number.isNaN(timestamp)) {
    return true;
  }

  const idade =
    Date.now() - timestamp;

  const limite =
    MAX_IDADE_NOTICIA_DIAS *
    24 *
    60 *
    60 *
    1000;

  if (idade < 0) {
    return true;
  }

  return idade <= limite;
}

// ======================================================
// HTTP COM RETRY
// ======================================================

async function getComRetry(
  url,
  opcoes = {},
  tentativas = 3
) {
  let ultimoErro = null;

  for (
    let tentativa = 1;
    tentativa <= tentativas;
    tentativa++
  ) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const resposta =
        await http.get(url, opcoes);

      console.log(
        `✅ HTTP ${resposta.status} | ${url}`
      );

      return resposta;
    } catch (erro) {
      ultimoErro = erro;

      console.warn(
        `⚠️ Falha HTTP: ${url}`
      );

      console.warn(
        `   Status: ${
          erro.response?.status || "sem status"
        }`
      );

      if (tentativa < tentativas) {
        await esperar(
          1500 * tentativa
        );
      }
    }
  }

  throw ultimoErro;
}

// ======================================================
// DUPLICIDADE
// ======================================================

async function noticiaJaPublicada(
  canal,
  url
) {
  if (!canal || !url) {
    return false;
  }

  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 100,
      });

    for (const [, mensagem] of mensagens) {
      if (!mensagem.embeds?.length) {
        continue;
      }

      for (const embed of mensagem.embeds) {
        if (
          embed.url &&
          embed.url === url
        ) {
          return true;
        }
      }
    }
  } catch (erro) {
    console.warn(
      `⚠️ Erro verificando duplicidade: ${erro.message}`
    );
  }

  return false;
}

// ======================================================
// PUBLICAR NOTÍCIA
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
    console.error(
      `❌ Canal não encontrado: ${fonte}`
    );

    return false;
  }

  titulo = limparTitulo(titulo);
  descricao = normalizarTexto(
    descricao
  );

  if (
    !titulo ||
    titulo.length < 5
  ) {
    console.warn(
      `⚠️ ${fonte}: título inválido.`
    );

    return false;
  }

  if (
    !url ||
    !urlValida(url)
  ) {
    console.warn(
      `⚠️ ${fonte}: URL inválida.`
    );

    return false;
  }

  // Bloqueia links intermediários do Google
  if (
    url.includes(
      "news.google.com/rss/articles"
    )
  ) {
    console.warn(
      `⛔ ${fonte}: link Google News rejeitado.`
    );

    return false;
  }

  if (
    await noticiaJaPublicada(
      canal,
      url
    )
  ) {
    console.log(
      `⏭️ ${fonte}: notícia já publicada, ignorando.`
    );

    return false;
  }

  const embed =
    new EmbedBuilder()
      .setTitle(
        titulo.substring(0, 256)
      )
      .setURL(url)
      .setDescription(
        descricao
          ? descricao.substring(
              0,
              1000
            )
          : `Confira a notícia completa em ${fonte}.`
      )
      .setFooter({
        text:
          `Murilito NEWS • ${fonte}`,
      })
      .setTimestamp();

  if (
    imagem &&
    urlValida(imagem)
  ) {
    embed.setImage(imagem);
  }

  let frase;

  if (
    fonte.toLowerCase()
      .includes("fortnite")
  ) {
    frase =
      fraseAleatoria(
        frasesFortnite
      );
  } else {
    frase =
      fraseAleatoria(
        frasesGTA
      );
  }

  try {
    // @everyone fica FORA do embed
    // para garantir a menção.
    await canal.send({
      content:
        `@everyone\n${frase}`,

      embeds: [embed],

      allowedMentions: {
        parse: ["everyone"],
      },
    });

    console.log(
      `📢 ${fonte}: notícia publicada.`
    );

    console.log(
      `   ${titulo}`
    );

    console.log(
      `   ${url}`
    );

    console.log(
      `   💬 ${frase}`
    );

    return true;
  } catch (erro) {
    console.error(
      `❌ Erro publicando ${fonte}:`,
      erro.message
    );

    return false;
  }
}

// ======================================================
// RSS
// ======================================================

async function buscarRSS(
  url,
  fonte
) {
  try {
    const resposta =
      await getComRetry(
        url,
        {
          responseType: "text",
        },
        3
      );

    const feed =
      await parser.parseString(
        resposta.data
      );

    if (
      !feed.items ||
      !feed.items.length
    ) {
      console.warn(
        `⚠️ ${fonte}: RSS sem itens.`
      );

      return [];
    }

    return feed.items
      .slice(0, 15)
      .map((item) => ({
        titulo:
          limparTitulo(
            item.title
          ),

        url:
          item.link,

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
      .filter(
        (item) =>
          item.titulo &&
          urlValida(item.url)
      );
  } catch (erro) {
    console.error(
      `❌ ${fonte}: erro RSS.`
    );

    console.error(
      `   ${erro.message}`
    );

    return [];
  }
}

// ======================================================
// GOOGLE NEWS -> TENTAR ENCONTRAR LINK ORIGINAL
// ======================================================

async function converterGoogleNewsParaOriginal(
  urlGoogle
) {
  if (
    !urlGoogle ||
    !urlGoogle.includes(
      "news.google.com"
    )
  ) {
    return urlGoogle;
  }

  try {
    const resposta =
      await getComRetry(
        urlGoogle,
        {
          responseType: "text",
        },
        2
      );

    const html =
      resposta.data;

    // Procura URLs conhecidas dentro
    // da página intermediária.
    const $ =
      cheerio.load(html);

    let original = null;

    $("a[href]").each(
      (_, elemento) => {
        if (original) return;

        const href =
          $(elemento).attr(
            "href"
          );

        if (!href) return;

        if (
          href.includes(
            "fortnite.gg/news"
          ) ||
          href.includes(
            "fortnite.com/news"
          ) ||
          href.includes(
            "rockstargames.com/newswire"
          )
        ) {
          original = href;
        }
      }
    );

    if (
      original &&
      urlValida(original)
    ) {
      return original;
    }
  } catch (erro) {
    console.warn(
      `⚠️ Não consegui converter Google News: ${erro.message}`
    );
  }

  return null;
}

// ======================================================
// FORTNITE API
// ======================================================

function extrairObjetosRecursivamente(
  objeto,
  resultado = []
) {
  if (!objeto) {
    return resultado;
  }

  if (Array.isArray(objeto)) {
    for (const item of objeto) {
      extrairObjetosRecursivamente(
        item,
        resultado
      );
    }

    return resultado;
  }

  if (
    typeof objeto !==
    "object"
  ) {
    return resultado;
  }

  const temTitulo =
    typeof objeto.title ===
      "string" ||
    typeof objeto.name ===
      "string" ||
    typeof objeto.headline ===
      "string";

  const temDescricao =
    typeof objeto.body ===
      "string" ||
    typeof objeto.description ===
      "string" ||
    typeof objeto.message ===
      "string";

  if (
    temTitulo &&
    temDescricao
  ) {
    resultado.push(
      objeto
    );
  }

  for (const chave of Object.keys(
    objeto
  )) {
    const valor =
      objeto[chave];

    if (
      valor &&
      typeof valor ===
        "object"
    ) {
      extrairObjetosRecursivamente(
        valor,
        resultado
      );
    }
  }

  return resultado;
}

async function buscarFortniteAPI() {
  const urls = [
    "https://fortnite-api.com/v2/news?language=pt-BR",
    "https://fortnite-api.com/v2/news/br",
    "https://fortnite-api.com/v2/news",
  ];

  for (const url of urls) {
    try {
      console.log(
        `🔎 Fortnite API: tentando ${url}`
      );

      const resposta =
        await getComRetry(
          url,
          {},
          2
        );

      const dados =
        resposta.data;

      const candidatos =
        extrairObjetosRecursivamente(
          dados
        );

      console.log(
        `🔎 Fortnite API: ${candidatos.length} objetos candidatos.`
      );

      if (
        !candidatos.length
      ) {
        continue;
      }

      const noticias =
        candidatos
          .map((item) => {
            const titulo =
              item.title ||
              item.name ||
              item.headline ||
              "";

            const descricao =
              item.body ||
              item.description ||
              item.message ||
              "";

            const imagem =
              item.image ||
              item.imageUrl ||
              item.images?.[0]?.url ||
              null;

            let url =
              item.url ||
              item.link ||
              null;

            // A API pode fornecer somente
            // dados da notícia, sem página.
            if (
              !url
            ) {
              url =
                "https://www.fortnite.com/news";
            }

            return {
              titulo:
                limparTitulo(
                  titulo
                ),

              descricao:
                normalizarTexto(
                  descricao
                ),

              url,

              imagem,

              data:
                item.date ||
                item.publishedAt ||
                item.published ||
                item.createdAt ||
                null,
            };
          })
          .filter(
            (item) =>
              item.titulo &&
              item.titulo.length >=
                5
          );

      if (
        noticias.length
      ) {
        console.log(
          `✅ Fortnite API encontrou ${noticias.length} candidatos.`
        );

        return noticias;
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
// FORTNITE RSS
// ======================================================

async function buscarFortniteRSS() {
  console.log(
    "🔁 Fortnite: usando fallback RSS."
  );

  const feeds = [
    "https://news.google.com/rss/search?q=site%3Afortnite.gg%2Fnews%20after%3A2026-09-01&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",

    "https://news.google.com/rss/search?q=site%3Afortnite.com%2Fnews%20after%3A2026-09-01&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",
  ];

  for (const feedUrl of feeds) {
    const noticias =
      await buscarRSS(
        feedUrl,
        "Fortnite RSS"
      );

    if (
      !noticias.length
    ) {
      continue;
    }

    const atuais = [];

    for (
      const noticia of noticias
    ) {
      // Bloqueia lixo
      if (
        !noticia.titulo ||
        noticia.titulo.length <
          10
      ) {
        continue;
      }

      // Tenta transformar Google URL
      if (
        noticia.url.includes(
          "news.google.com"
        )
      ) {
        const original =
          await converterGoogleNewsParaOriginal(
            noticia.url
          );

        if (
          original
        ) {
          noticia.url =
            original;
        } else {
          // Não publica link Google
          continue;
        }
      }

      // Só aceita domínio Fortnite
      if (
        !noticia.url.includes(
          "fortnite.gg"
        ) &&
        !noticia.url.includes(
          "fortnite.com"
        )
      ) {
        continue;
      }

      atuais.push(
        noticia
      );
    }

    if (
      atuais.length
    ) {
      return atuais;
    }
  }

  return [];
}

// ======================================================
// FORTNITE
// ======================================================

async function buscarFortnite() {
  console.log(
    "🔎 Fortnite: iniciando busca de notícias."
  );

  let noticias =
    await buscarFortniteAPI();

  // Filtra datas quando disponíveis
  noticias =
    noticias.filter(
      (item) =>
        dataValida(item.data)
    );

  if (
    noticias.length
  ) {
    return noticias.slice(
      0,
      10
    );
  }

  noticias =
    await buscarFortniteRSS();

  if (
    noticias.length
  ) {
    console.log(
      `✅ Fortnite RSS encontrou ${noticias.length} notícias válidas.`
    );

    return noticias.slice(
      0,
      10
    );
  }

  console.warn(
    "⚠️ Fortnite: nenhuma notícia válida encontrada."
  );

  return [];
}

// ======================================================
// LIBERTYCITY
// ======================================================

function ehArtigoLibertyCity(
  url
) {
  try {
    const parsed =
      new URL(url);

    if (
      parsed.hostname !==
        "pt.libertycity.net" &&
      parsed.hostname !==
        "www.libertycity.net"
    ) {
      return false;
    }

    const path =
      parsed.pathname;

    if (
      !path.startsWith(
        "/news/"
      )
    ) {
      return false;
    }

    if (
      /^\/news\/page\/\d+\/?$/i.test(
        path
      )
    ) {
      return false;
    }

    if (
      path === "/news/" ||
      path === "/news"
    ) {
      return false;
    }

    const bloqueados = [
      "/news/category/",
      "/news/tag/",
      "/news/tags/",
      "/news/search/",
    ];

    for (
      const bloqueado of bloqueados
    ) {
      if (
        path.startsWith(
          bloqueado
        )
      ) {
        return false;
      }
    }

    const partes =
      path
        .split("/")
        .filter(Boolean);

    return (
      partes.length >= 2
    );
  } catch {
    return false;
  }
}

async function buscarLibertyCity() {
  const paginas = [
    "https://pt.libertycity.net/news/",
    "https://pt.libertycity.net/news/page/2/",
  ];

  for (
    const pagina of paginas
  ) {
    try {
      const resposta =
        await getComRetry(
          pagina,
          {},
          3
        );

      const $ =
        cheerio.load(
          resposta.data
        );

      const noticias = [];

      $("a[href]").each(
        (_, elemento) => {
          if (
            noticias.length >=
            10
          ) {
            return;
          }

          const link =
            $(elemento).attr(
              "href"
            );

          if (!link) {
            return;
          }

          let urlFinal;

          try {
            urlFinal =
              new URL(
                link,
                "https://pt.libertycity.net"
              ).href;
          } catch {
            return;
          }

          if (
            !ehArtigoLibertyCity(
              urlFinal
            )
          ) {
            return;
          }

          let titulo =
            normalizarTexto(
              $(elemento).text()
            );

          if (!titulo) {
            titulo =
              normalizarTexto(
                $(elemento)
                  .closest(
                    "article"
                  )
                  .find(
                    "h1,h2,h3,h4,.title"
                  )
                  .first()
                  .text()
              );
          }

          if (
            !titulo ||
            titulo.length < 5
          ) {
            return;
          }

          const lower =
            titulo.toLowerCase();

          if (
            lower.includes(
              "próxima página"
            ) ||
            lower.includes(
              "next page"
            ) ||
            lower ===
              "mais notícias" ||
            lower ===
              "notícias"
          ) {
            return;
          }

          if (
            noticias.some(
              (item) =>
                item.url ===
                urlFinal
            )
          ) {
            return;
          }

          noticias.push({
            titulo,
            url:
              urlFinal,
            descricao:
              "",
            imagem:
              null,
          });
        }
      );

      console.log(
        `🔎 LibertyCity: ${noticias.length} possíveis notícias.`
      );

      if (
        noticias.length
      ) {
        return noticias;
      }
    } catch (erro) {
      console.error(
        `❌ LibertyCity: ${erro.message}`
      );
    }
  }

  return [];
}

// ======================================================
// ROCKSTAR RSS
// ======================================================

async function buscarRockstarRSS() {
  const feeds = [
    "https://news.google.com/rss/search?q=site%3Arockstargames.com%2Fbr%2Fnewswire%20after%3A2026-09-01&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",

    "https://news.google.com/rss/search?q=site%3Arockstargames.com%2Fnewswire%20after%3A2026-09-01&hl=pt-BR&gl=BR&ceid=BR%3Apt-419",
  ];

  for (
    const feedUrl of feeds
  ) {
    const noticias =
      await buscarRSS(
        feedUrl,
        "Rockstar RSS"
      );

    if (
      !noticias.length
    ) {
      continue;
    }

    const validas = [];

    for (
      const noticia of noticias
    ) {
      if (
        !noticia.titulo ||
        noticia.titulo.length <
          10
      ) {
        continue;
      }

      // Google News não é o link que queremos.
      if (
        noticia.url.includes(
          "news.google.com"
        )
      ) {
        const original =
          await converterGoogleNewsParaOriginal(
            noticia.url
          );

        if (
          original
        ) {
          noticia.url =
            original;
        } else {
          continue;
        }
      }

      if (
        !noticia.url.includes(
          "rockstargames.com"
        )
      ) {
        continue;
      }

      if (
        !noticia.url.includes(
          "/newswire/"
        )
      ) {
        continue;
      }

      validas.push(
        noticia
      );
    }

    if (
      validas.length
    ) {
      return validas;
    }
  }

  return [];
}

// ======================================================
// ROCKSTAR HTML
// ======================================================

async function buscarRockstarHTML() {
  const urls = [
    "https://www.rockstargames.com/br/newswire",
    "https://www.rockstargames.com/newswire",
  ];

  for (
    const url of urls
  ) {
    try {
      const resposta =
        await getComRetry(
          url,
          {},
          2
        );

      const $ =
        cheerio.load(
          resposta.data
        );

      const noticias = [];

      $("a[href]").each(
        (_, elemento) => {
          const href =
            $(elemento).attr(
              "href"
            );

          if (!href) {
            return;
          }

          if (
            !href.includes(
              "/newswire/"
            )
          ) {
            return;
          }

          let urlFinal;

          try {
            urlFinal =
              new URL(
                href,
                "https://www.rockstargames.com"
              ).href;
          } catch {
            return;
          }

          let titulo =
            normalizarTexto(
              $(elemento).text()
            );

          if (!titulo) {
            titulo =
              normalizarTexto(
                $(elemento)
                  .closest(
                    "article"
                  )
                  .find(
                    "h1,h2,h3,h4"
                  )
                  .first()
                  .text()
              );
          }

          if (
            !titulo ||
            titulo.length < 10
          ) {
            return;
          }

          if (
            noticias.some(
              (item) =>
                item.url ===
                urlFinal
            )
          ) {
            return;
          }

          noticias.push({
            titulo,
            url:
              urlFinal,
            descricao:
              "",
            imagem:
              null,
          });
        }
      );

      if (
        noticias.length
      ) {
        return noticias;
      }
    } catch (erro) {
      console.warn(
        `⚠️ Rockstar HTML: ${erro.message}`
      );
    }
  }

  return [];
}

// ======================================================
// ROCKSTAR
// ======================================================

async function buscarRockstar() {
  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  let noticias =
    await buscarRockstarRSS();

  if (
    noticias.length
  ) {
    console.log(
      `✅ Rockstar RSS encontrou ${noticias.length} notícias válidas.`
    );

    return noticias;
  }

  noticias =
    await buscarRockstarHTML();

  if (
    noticias.length
  ) {
    return noticias;
  }

  console.warn(
    "⚠️ Rockstar: nenhuma notícia válida encontrada."
  );

  return [];
}

// ======================================================
// PROCESSAR FONTE
// ======================================================

async function processarFonte({
  nome,
  canal,
  buscar,
}) {
  try {
    console.log("");
    console.log(
      `━━━━━━━━ ${nome} ━━━━━━━━`
    );

    const noticias =
      await buscar();

    if (
      !noticias ||
      !noticias.length
    ) {
      console.warn(
        `⚠️ ${nome}: nenhuma notícia encontrada.`
      );

      return false;
    }

    console.log(
      `📰 ${nome}: ${noticias.length} notícias recebidas.`
    );

    for (
      const noticia of noticias
    ) {
      if (
        !noticia.url ||
        !urlValida(
          noticia.url
        )
      ) {
        continue;
      }

      if (
        noticia.titulo
          .toLowerCase()
          .includes(
            "próxima página"
          )
      ) {
        continue;
      }

      const publicada =
        await noticiaJaPublicada(
          canal,
          noticia.url
        );

      if (
        publicada
      ) {
        console.log(
          `⏭️ ${nome}: já publicada: ${noticia.titulo}`
        );

        continue;
      }

      const sucesso =
        await publicarNoticia({
          canal,
          fonte:
            nome,
          titulo:
            noticia.titulo,
          url:
            noticia.url,
          descricao:
            noticia.descricao,
          imagem:
            noticia.imagem,
        });

      if (
        sucesso
      ) {
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

    console.error(
      erro
    );

    return false;
  }
}

// ======================================================
// CICLO
// ======================================================

async function cicloNoticias() {
  if (
    cicloEmAndamento
  ) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando."
    );

    return;
  }

  cicloEmAndamento =
    true;

  try {
    console.log("");
    console.log(
      "========================================"
    );

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

    console.log(
      "========================================"
    );

    const canalFortnite =
      await client.channels.fetch(
        ID_FORTNITE
      );

    const canalGTA =
      await client.channels.fetch(
        ID_GTA
      );

    // FORTNITE
    await processarFonte({
      nome:
        "Fortnite",
      canal:
        canalFortnite,
      buscar:
        buscarFortnite,
    });

    await esperar(
      2000
    );

    // LIBERTYCITY
    await processarFonte({
      nome:
        "LibertyCity",
      canal:
        canalGTA,
      buscar:
        buscarLibertyCity,
    });

    await esperar(
      2000
    );

    // ROCKSTAR
    await processarFonte({
      nome:
        "Rockstar",
      canal:
        canalGTA,
      buscar:
        buscarRockstar,
    });

    console.log(
      "========================================"
    );

    console.log(
      "✅ CICLO FINALIZADO"
    );

    console.log(
      "========================================"
    );
  } catch (erro) {
    console.error(
      "❌ Erro no ciclo:",
      erro
    );
  } finally {
    cicloEmAndamento =
      false;
  }
}

// ======================================================
// LOJA
// ======================================================

async function postarLojaFortnite() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🛍️ LOJA DO FORTNITE"
        )
        .setDescription(
          "🔥 A loja do Fortnite foi atualizada! Vai gastar seus V-Bucks ou vai só olhar? 😂"
        )
        .setURL(
          "https://fortnite.gg/shop"
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
        "@everyone\n🚨 A LOJA VIROU! Corre antes que mudem tudo de novo 😂",

      embeds: [
        embed,
      ],

      allowedMentions: {
        parse: [
          "everyone",
        ],
      },
    });

    console.log(
      "✅ Loja Fortnite publicada."
    );

    return true;
  } catch (erro) {
    console.error(
      "❌ Erro loja:",
      erro.message
    );

    return false;
  }
}

// ======================================================
// HORÁRIO DA LOJA
// ======================================================

async function verificarHorarioLoja() {
  try {
    const agora =
      new Date();

    const partes =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            "America/Sao_Paulo",
          year:
            "numeric",
          month:
            "2-digit",
          day:
            "2-digit",
          hour:
            "2-digit",
          minute:
            "2-digit",
          hour12:
            false,
        }
      ).formatToParts(
        agora
      );

    const valores = {};

    for (
      const parte of partes
    ) {
      valores[
        parte.type
      ] = parte.value;
    }

    const ano =
      valores.year;

    const mes =
      valores.month;

    const dia =
      valores.day;

    const hora =
      Number(
        valores.hour
      );

    const minuto =
      Number(
        valores.minute
      );

    const dataHoje =
      `${ano}-${mes}-${dia}`;

    if (
      hora ===
        HORA_LOJA &&
      minuto ===
        MINUTO_LOJA &&
      ultimoDiaLoja !==
        dataHoje
    ) {
      console.log(
        "⏰ Horário da loja atingido."
      );

      const sucesso =
        await postarLojaFortnite();

      if (
        sucesso
      ) {
        ultimoDiaLoja =
          dataHoje;
      }
    }
  } catch (erro) {
    console.error(
      "❌ Erro horário loja:",
      erro.message
    );
  }
}

// ======================================================
// PIADAS
// ======================================================

const piadas = [
  "😂 Entrei no GTA RP para trabalhar honestamente. Durou 7 minutos.",
  "🤣 Meu FPS caiu tanto que meu personagem começou a andar por fotos.",
  "😂 Fortnite me ensinou que construir uma casa é fácil. Arrumar a vida é outra história.",
  "🤣 Meu ping está tão alto que o tiro chega amanhã.",
  "😂 Fui jogar só uma partida. Essa mentira já tem 5 horas.",
  "🤣 O maior inimigo do jogador é o próprio PC.",
];

// ======================================================
// COMANDOS
// ======================================================

client.on(
  "messageCreate",
  async (message) => {
    if (
      message.author.bot
    ) {
      return;
    }

    const conteudo =
      message.content.trim();

    if (
      conteudo ===
      "!teste"
    ) {
      await message.reply(
        "🧪 Testando todas as fontes..."
      );

      await cicloNoticias();

      return;
    }

    if (
      conteudo ===
      "!teste fortnite"
    ) {
      await message.reply(
        "🧪 Testando Fortnite..."
      );

      const canal =
        await client.channels.fetch(
          ID_FORTNITE
        );

      await processarFonte({
        nome:
          "Fortnite",
        canal,
        buscar:
          buscarFortnite,
      });

      return;
    }

    if (
      conteudo ===
      "!teste liberty"
    ) {
      await message.reply(
        "🧪 Testando LibertyCity..."
      );

      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      await processarFonte({
        nome:
          "LibertyCity",
        canal,
        buscar:
          buscarLibertyCity,
      });

      return;
    }

    if (
      conteudo ===
      "!teste rockstar"
    ) {
      await message.reply(
        "🧪 Testando Rockstar..."
      );

      const canal =
        await client.channels.fetch(
          ID_GTA
        );

      await processarFonte({
        nome:
          "Rockstar",
        canal,
        buscar:
          buscarRockstar,
      });

      return;
    }

    if (
      conteudo ===
      "!teste loja"
    ) {
      await message.reply(
        "🧪 Testando loja..."
      );

      await postarLojaFortnite();

      return;
    }

    if (
      conteudo ===
      "!piada"
    ) {
      await message.reply(
        piadas[
          Math.floor(
            Math.random() *
              piadas.length
          )
        ]
      );

      return;
    }

    if (
      conteudo ===
      "!ajuda"
    ) {
      const embed =
        new EmbedBuilder()
          .setTitle(
            "🤖 Murilito NEWS"
          )
          .setDescription(
            "Comandos disponíveis:"
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
                "`!teste loja`",
            },
            {
              name:
                "😂 Diversão",
              value:
                "`!piada`",
            }
          )
          .setFooter({
            text:
              "Murilito NEWS",
          });

      await message.reply({
        embeds: [
          embed,
        ],
      });

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
    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "🤖 MURILITO NEWS ONLINE"
    );

    console.log(
      "========================================"
    );

    console.log(
      `👤 Logado como: ${client.user.tag}`
    );

    console.log(
      `🆔 ID: ${client.user.id}`
    );

    console.log(
      "========================================"
    );

    console.log(
      "⏰ Loja: 21:00 Brasil"
    );

    console.log(
      "📰 Notícias: a cada 10 minutos"
    );

    console.log(
      "📢 @everyone: ATIVADO"
    );

    console.log(
      "========================================"
    );

    await cicloNoticias();

    setInterval(
      cicloNoticias,
      INTERVALO_NOTICIAS
    );

    setInterval(
      verificarHorarioLoja,
      30 * 1000
    );

    await verificarHorarioLoja();
  }
);

// ======================================================
// ERROS
// ======================================================

process.on(
  "unhandledRejection",
  (erro) => {
    console.error(
      "❌ Unhandled Rejection:",
      erro
    );
  }
);

process.on(
  "uncaughtException",
  (erro) => {
    console.error(
      "❌ Uncaught Exception:",
      erro
    );
  }
);

// ======================================================
// LOGIN
// ======================================================

client.login(
  TOKEN
);
