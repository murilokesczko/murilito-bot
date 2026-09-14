require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");

// ======================================================
// CONFIGURAÇÃO
// ======================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado nas variáveis do Railway.");
  process.exit(1);
}

// CANAIS
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// URLS
const FORTNITE_NEWS =
  "https://www.fortnite.com/news?lang=pt-BR";

const FORTNITE_NEWS_ALL =
  "https://www.fortnite.com/news/tag/all-news?lang=pt-BR";

const ROCKSTAR_NEWSWIRE =
  "https://www.rockstargames.com/br/newswire";

const LIBERTYCITY_NEWS =
  "https://pt.libertycity.net/news/";

const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

// INTERVALOS
const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const INTERVALO_LOJA = 30 * 1000;

// LIMITES
const MAX_NOTICIAS_POR_FONTE = 3;
const MAX_CANDIDATOS = 12;

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
// AXIOS
// ======================================================

const axiosConfig = {
  timeout: 15000,
  maxRedirects: 5,

  validateStatus: (status) =>
    status >= 200 && status < 400,

  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
      "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",

    "Cache-Control":
      "no-cache",

    Pragma:
      "no-cache",
  },
};

// ======================================================
// FRASES
// ======================================================

const FRASES_FORTNITE = [
  "🎮 NOVIDADE QUENTE NO FORTNITE! 👀",
  "🔥 ACABOU DE SAIR! OLHA ESSA NOVIDADE DO FORTNITE!",
  "🚨 ATENÇÃO, PLAYERS! TEM NOVIDADE NOVA NO FORTNITE!",
  "👀 OLHA O QUE ACABOU DE SAIR NO FORTNITE!",
  "🔥 FORTNITE NÃO PARA! CONFIRA ESSA NOVIDADE!",
  "⚡ TEM NOVIDADE FRESQUINHA NO FORTNITE!",
];

const FRASES_GTA = [
  "🚨 NOVIDADE QUENTE NO UNIVERSO GTA! 👀",
  "🔥 ACABOU DE SAIR! OLHA ESSA NOVIDADE!",
  "👀 OLHA O QUE A ROCKSTAR ACABOU DE REVELAR!",
  "🚔 TEM NOVIDADE NO GTA! CONFIRA ESSA!",
  "🔥 MAIS UMA DO UNIVERSO GTA! NÃO PERDE ESSA!",
  "💥 GTA NÃO PARA! CONFIRA A NOVIDADE!",
];

const FRASES_GERAL = [
  "📰 ACABOU DE SAIR! 👀",
  "🔥 TEM NOVIDADE FRESQUINHA!",
  "🚨 ATENÇÃO! OLHA ESSA NOVIDADE!",
  "👀 VOCÊ PRECISA VER ESSA!",
  "🔥 NOVIDADE NOVA CHEGANDO NO MURILITO NEWS!",
];

// ======================================================
// FRASE DETERMINÍSTICA
// ======================================================

function gerarFrase(tipo, titulo = "") {
  let lista = FRASES_GERAL;

  if (tipo === "fortnite") {
    lista = FRASES_FORTNITE;
  }

  if (tipo === "gta") {
    lista = FRASES_GTA;
  }

  let soma = 0;

  for (let i = 0; i < titulo.length; i++) {
    soma += titulo.charCodeAt(i);
  }

  return lista[soma % lista.length];
}

// ======================================================
// GET COM RETRY
// ======================================================

async function getComRetry(
  url,
  tentativas = 2,
  configExtra = {}
) {
  for (
    let tentativa = 1;
    tentativa <= tentativas;
    tentativa++
  ) {
    try {
      console.log(
        `🌐 GET ${url} | tentativa ${tentativa}/${tentativas}`
      );

      const resposta = await axios.get(
        url,
        {
          ...axiosConfig,
          ...configExtra,
        }
      );

      console.log(
        `✅ HTTP ${resposta.status} | ${url}`
      );

      return resposta;
    } catch (erro) {
      const status =
        erro.response?.status ||
        "sem resposta";

      console.log(
        `⚠️ Falha HTTP: ${status} | ${url}`
      );

      if (
        tentativa < tentativas
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              1200
            )
        );
      }
    }
  }

  return null;
}

// ======================================================
// LIMPEZA
// ======================================================

function limparTexto(texto) {
  if (!texto) return "";

  return String(texto)
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function limitarTexto(
  texto,
  tamanho = 450
) {
  texto = limparTexto(texto);

  if (
    texto.length <= tamanho
  ) {
    return texto;
  }

  return (
    texto
      .substring(
        0,
        tamanho - 3
      )
      .trim() + "..."
  );
}

// ======================================================
// URL
// ======================================================

function normalizarUrl(url) {
  if (!url) return null;

  try {
    const u = new URL(url);

    u.hash = "";
    u.search = "";

    return u.toString();
  } catch {
    return null;
  }
}

function tornarUrlAbsoluta(
  url,
  base
) {
  if (!url) return null;

  try {
    return new URL(
      url,
      base
    ).href;
  } catch {
    return null;
  }
}

// ======================================================
// VERIFICA DOMÍNIO
// ======================================================

function ehFortnite(url) {
  if (!url) return false;

  try {
    const u = new URL(url);

    return (
      u.hostname ===
        "www.fortnite.com" &&
      u.pathname.startsWith(
        "/news/"
      )
    );
  } catch {
    return false;
  }
}

function ehRockstar(url) {
  if (!url) return false;

  try {
    const u = new URL(url);

    return (
      (
        u.hostname ===
          "www.rockstargames.com" ||
        u.hostname ===
          "rockstargames.com"
      ) &&
      u.pathname.includes(
        "/newswire/"
      )
    );
  } catch {
    return false;
  }
}

function ehLibertyCity(url) {
  if (!url) return false;

  try {
    const u = new URL(url);

    return (
      u.hostname ===
        "pt.libertycity.net" &&
      u.pathname.includes(
        "/news/"
      ) &&
      u.pathname.endsWith(
        ".html"
      )
    );
  } catch {
    return false;
  }
}

// ======================================================
// DATA
// ======================================================

function obterDataPublicacao(
  elemento,
  $
) {
  const candidatos = [
    $(elemento)
      .find("time")
      .attr("datetime"),

    $(elemento)
      .find("time")
      .text(),

    $(elemento)
      .find(
        ".date, .time, .published, .publication-date"
      )
      .first()
      .text(),

    $(elemento)
      .attr(
        "data-date"
      ),

    $(elemento)
      .attr(
        "data-published"
      ),
  ];

  for (
    const candidato of candidatos
  ) {
    if (!candidato) continue;

    const data =
      new Date(candidato);

    if (
      !isNaN(
        data.getTime()
      )
    ) {
      return data;
    }
  }

  return null;
}

// ======================================================
// METADADOS
// ======================================================

async function buscarMetadados(
  url,
  tipo
) {
  console.log(
    `📝 ${tipo.toUpperCase()}: buscando imagem e prévia...`
  );

  const resposta =
    await getComRetry(
      url,
      2
    );

  if (
    !resposta?.data
  ) {
    return {
      titulo: "",
      descricao: "",
      imagem: null,
    };
  }

  try {
    const $ =
      cheerio.load(
        resposta.data
      );

    let titulo =
      limparTexto(
        $(
          'meta[property="og:title"]'
        ).attr("content") ||
          $(
            'meta[name="twitter:title"]'
          ).attr("content") ||
          $("title").text()
      );

    let descricao =
      limparTexto(
        $(
          'meta[property="og:description"]'
        ).attr("content") ||
          $(
            'meta[name="description"]'
          ).attr("content") ||
          $(
            'meta[name="twitter:description"]'
          ).attr("content")
      );

    let imagem =
      $(
        'meta[property="og:image"]'
      ).attr("content") ||
      $(
        'meta[name="twitter:image"]'
      ).attr("content") ||
      $(
        'meta[property="twitter:image"]'
      ).attr("content");

    // ==================================================
    // JSON-LD
    // ==================================================

    if (!imagem) {
      $(
        'script[type="application/ld+json"]'
      ).each(
        (_, elemento) => {
          if (imagem) return;

          try {
            const texto =
              $(elemento)
                .contents()
                .text();

            const json =
              JSON.parse(
                texto
              );

            const lista =
              Array.isArray(
                json
              )
                ? json
                : [json];

            for (
              const item of lista
            ) {
              if (!item) continue;

              if (
                typeof item.image ===
                "string"
              ) {
                imagem =
                  item.image;
                break;
              }

              if (
                item.image?.url
              ) {
                imagem =
                  item.image.url;
                break;
              }

              if (
                Array.isArray(
                  item.image
                ) &&
                item.image.length
              ) {
                imagem =
                  typeof item.image[0] ===
                  "string"
                    ? item.image[0]
                    : item.image[0]
                        ?.url;

                if (imagem)
                  break;
              }
            }
          } catch {}
        }
      );
    }

    // ==================================================
    // FALLBACK DE IMAGEM
    // ==================================================

    if (!imagem) {
      const seletores = [
        "article img",
        "main img",
        ".article img",
        ".news img",
        ".post img",
        ".content img",
      ];

      for (
        const seletor of seletores
      ) {
        const src =
          $(seletor)
            .first()
            .attr(
              "src"
            );

        if (src) {
          imagem =
            src;
          break;
        }
      }
    }

    imagem =
      tornarUrlAbsoluta(
        imagem,
        url
      );

    if (imagem) {
      console.log(
        "🖼️ Imagem encontrada"
      );
    }

    if (descricao) {
      console.log(
        "📢 Prévia encontrada"
      );
    }

    return {
      titulo,
      descricao,
      imagem,
    };
  } catch (erro) {
    console.log(
      `⚠️ Erro nos metadados: ${erro.message}`
    );

    return {
      titulo: "",
      descricao: "",
      imagem: null,
    };
  }
}

// ======================================================
// DUPLICADAS
// ======================================================

async function jaFoiPublicada(
  canal,
  url
) {
  if (
    !canal ||
    !url
  ) {
    return false;
  }

  try {
    const mensagens =
      await canal.messages.fetch(
        {
          limit: 100,
        }
      );

    const alvo =
      normalizarUrl(url);

    for (
      const mensagem of mensagens.values()
    ) {
      if (
        !mensagem.embeds?.length
      ) {
        continue;
      }

      for (
        const embed of mensagem.embeds
      ) {
        if (!embed.url)
          continue;

        if (
          normalizarUrl(
            embed.url
          ) === alvo
        ) {
          return true;
        }
      }
    }
  } catch {}

  return false;
}

async function jaFoiPublicadaPorId(
  canalId,
  url
) {
  try {
    const canal =
      await client.channels.fetch(
        canalId
      );

    return await jaFoiPublicada(
      canal,
      url
    );
  } catch {
    return false;
  }
}

// ======================================================
// PUBLICAÇÃO
// ======================================================

async function publicarNoticia({
  canalId,
  tipo,
  titulo,
  descricao,
  imagem,
  url,
}) {
  if (
    !canalId ||
    !titulo ||
    !url
  ) {
    return false;
  }

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

  if (
    await jaFoiPublicada(
      canal,
      url
    )
  ) {
    console.log(
      `⏭️ ${tipo.toUpperCase()}: já publicada: ${titulo}`
    );

    return false;
  }

  const frase =
    gerarFrase(
      tipo,
      titulo
    );

  const resumo =
    limitarTexto(
      descricao ||
        "Confira todos os detalhes dessa novidade na matéria completa.",
      500
    );

  const embed =
    new EmbedBuilder()
      .setTitle(
        titulo
      )
      .setURL(
        url
      )
      .setDescription(
        `🔥 ${resumo}`
      )
      .setFooter({
        text:
          tipo ===
          "fortnite"
            ? "Murilito NEWS • Fortnite"
            : "Murilito NEWS • GTA",
      })
      .setTimestamp();

  if (imagem) {
    embed.setImage(
      imagem
    );
  }

  await canal.send({
    content:
      `@everyone ${frase}`,

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
    "📢 NOTÍCIA PUBLICADA!"
  );

  console.log(
    `   ${titulo}`
  );

  console.log(
    `   ${url}`
  );

  return true;
}

// ======================================================
// FORTNITE — LEITOR OFICIAL
// ======================================================

function extrairNoticiasFortnite(
  html
) {
  const $ =
    cheerio.load(
      html
    );

  const noticias = [];
  const urls = new Set();

  // Todos os links da página
  $("a[href]").each(
    (_, elemento) => {
      let href =
        $(elemento).attr(
          "href"
        );

      if (!href) return;

      const url =
        tornarUrlAbsoluta(
          href,
          "https://www.fortnite.com"
        );

      if (!url) return;

      if (
        !ehFortnite(url)
      ) {
        return;
      }

      const texto =
        limparTexto(
          $(elemento).text()
        );

      // Ignorar navegação
      if (
        !texto ||
        texto.length < 4
      ) {
        return;
      }

      if (
        /item shop|loja|login|terms|privacy|support/i.test(
          texto
        )
      ) {
        return;
      }

      const urlFinal =
        normalizarUrl(
          url
        );

      if (
        urls.has(
          urlFinal
        )
      ) {
        return;
      }

      urls.add(
        urlFinal
      );

      noticias.push({
        titulo:
          texto,
        url:
          urlFinal,
        elemento,
        data:
          obterDataPublicacao(
            elemento,
            $
          ),
      });
    }
  );

  // ==================================================
  // TENTAR META TAGS / JSON-LD
  // ==================================================

  $(
    'script[type="application/ld+json"]'
  ).each(
    (_, elemento) => {
      try {
        const texto =
          $(
            elemento
          )
            .contents()
            .text();

        const json =
          JSON.parse(
            texto
          );

        const lista =
          Array.isArray(
            json
          )
            ? json
            : [json];

        for (
          const item of lista
        ) {
          if (!item) continue;

          const url =
            tornarUrlAbsoluta(
              item.url,
              "https://www.fortnite.com"
            );

          if (
            !url ||
            !ehFortnite(
              url
            )
          ) {
            continue;
          }

          if (
            urls.has(
              normalizarUrl(
                url
              )
            )
          ) {
            continue;
          }

          const titulo =
            limparTexto(
              item.headline ||
                item.name ||
                ""
            );

          if (!titulo)
            continue;

          urls.add(
            normalizarUrl(
              url
            )
          );

          noticias.push({
            titulo,
            url:
              normalizarUrl(
                url
              ),
            data:
              item.datePublished
                ? new Date(
                    item.datePublished
                  )
                : null,
          });
        }
      } catch {}
    }
  );

  return noticias;
}

async function buscarFortnite() {
  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

  console.log(
    "🔎 Fortnite: buscando na fonte oficial."
  );

  let resposta =
    await getComRetry(
      FORTNITE_NEWS_ALL,
      2
    );

  if (
    !resposta?.data
  ) {
    console.log(
      "⚠️ Fortnite: página all-news falhou. Tentando página principal."
    );

    resposta =
      await getComRetry(
        FORTNITE_NEWS,
        2
      );
  }

  if (
    !resposta?.data
  ) {
    console.log(
      "⚠️ Fortnite: site oficial não respondeu."
    );

    return 0;
  }

  const noticias =
    extrairNoticiasFortnite(
      resposta.data
    );

  console.log(
    `🔎 Fortnite: ${noticias.length} candidatos encontrados.`
  );

  if (!noticias.length) {
    console.log(
      "⚠️ Fortnite: o site respondeu, mas não entregou os artigos no HTML."
    );

    return 0;
  }

  let publicadas = 0;

  for (
    const noticia of noticias.slice(
      0,
      MAX_CANDIDATOS
    )
  ) {
    if (
      publicadas >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    if (
      !ehFortnite(
        noticia.url
      )
    ) {
      continue;
    }

    if (
      await jaFoiPublicadaPorId(
        ID_FORTNITE,
        noticia.url
      )
    ) {
      console.log(
        `⏭️ Fortnite: já publicada: ${noticia.titulo}`
      );

      continue;
    }

    const metadados =
      await buscarMetadados(
        noticia.url,
        "fortnite"
      );

    const titulo =
      metadados.titulo ||
      noticia.titulo;

    const descricao =
      metadados.descricao ||
      "Confira a novidade oficial do Fortnite.";

    const publicou =
      await publicarNoticia({
        canalId:
          ID_FORTNITE,
        tipo:
          "fortnite",
        titulo,
        descricao,
        imagem:
          metadados.imagem,
        url:
          noticia.url,
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 Fortnite: ${publicadas} notícia(s) nova(s) publicada(s).`
  );

  return publicadas;
}

// ======================================================
// LIBERTYCITY
// ======================================================

function extrairNoticiasLibertyCity(
  html
) {
  const $ =
    cheerio.load(
      html
    );

  const noticias = [];
  const urls = new Set();

  $("a[href]").each(
    (_, elemento) => {
      const href =
        $(elemento).attr(
          "href"
        );

      const texto =
        limparTexto(
          $(elemento).text()
        );

      if (
        !href ||
        !texto
      ) {
        return;
      }

      const url =
        tornarUrlAbsoluta(
          href,
          LIBERTYCITY_NEWS
        );

      if (
        !url ||
        !ehLibertyCity(
          url
        )
      ) {
        return;
      }

      if (
        /\/page\/\d+/i.test(
          url
        )
      ) {
        return;
      }

      if (
        /próxima página|página anterior|anterior|próxima/i.test(
          texto
        )
      ) {
        return;
      }

      if (
        urls.has(
          url
        )
      ) {
        return;
      }

      urls.add(
        url
      );

      noticias.push({
        titulo:
          texto,
        url:
          normalizarUrl(
            url
          ),
      });
    }
  );

  return noticias;
}

async function buscarLibertyCity() {
  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  console.log(
    "🔎 LibertyCity: buscando notícias."
  );

  const resposta =
    await getComRetry(
      LIBERTYCITY_NEWS,
      2
    );

  if (
    !resposta?.data
  ) {
    console.log(
      "⚠️ LibertyCity: não foi possível acessar."
    );

    return 0;
  }

  const noticias =
    extrairNoticiasLibertyCity(
      resposta.data
    );

  console.log(
    `🔎 LibertyCity: ${noticias.length} notícias encontradas.`
  );

  let publicadas = 0;

  for (
    const noticia of noticias
  ) {
    if (
      publicadas >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    if (
      await jaFoiPublicadaPorId(
        ID_GTA,
        noticia.url
      )
    ) {
      console.log(
        `⏭️ GTA: já publicada: ${noticia.titulo}`
      );

      continue;
    }

    const metadados =
      await buscarMetadados(
        noticia.url,
        "gta"
      );

    const titulo =
      metadados.titulo ||
      noticia.titulo;

    const descricao =
      metadados.descricao ||
      "Confira todos os detalhes dessa notícia.";

    const publicou =
      await publicarNoticia({
        canalId:
          ID_GTA,
        tipo:
          "gta",
        titulo,
        descricao,
        imagem:
          metadados.imagem,
        url:
          noticia.url,
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 GTA: ${publicadas} notícia(s) nova(s) publicada(s).`
  );

  return publicadas;
}

// ======================================================
// ROCKSTAR — LEITOR OFICIAL
// ======================================================

function extrairNoticiasRockstar(
  html
) {
  const $ =
    cheerio.load(
      html
    );

  const noticias = [];
  const urls = new Set();

  // ----------------------------------------------------
  // LINKS NORMALMENTE EXISTENTES
  // ----------------------------------------------------

  $("a[href]").each(
    (_, elemento) => {
      const href =
        $(elemento).attr(
          "href"
        );

      if (!href)
        return;

      const url =
        tornarUrlAbsoluta(
          href,
          "https://www.rockstargames.com"
        );

      if (
        !url ||
        !ehRockstar(
          url
        )
      ) {
        return;
      }

      const titulo =
        limparTexto(
          $(elemento).text()
        );

      if (
        !titulo ||
        titulo.length < 5
      ) {
        return;
      }

      const urlFinal =
        normalizarUrl(
          url
        );

      if (
        urls.has(
          urlFinal
        )
      ) {
        return;
      }

      urls.add(
        urlFinal
      );

      noticias.push({
        titulo,
        url:
          urlFinal,
      });
    }
  );

  // ----------------------------------------------------
  // PROCURAR URLS DENTRO DO HTML/JS
  // ----------------------------------------------------

  const htmlBruto =
    html || "";

  const regex =
    /https?:\/\/(?:www\.)?rockstargames\.com\/(?:br\/)?newswire\/article\/[A-Za-z0-9_\-\/]+/gi;

  const encontrados =
    htmlBruto.match(
      regex
    ) || [];

  for (
    let url of encontrados
  ) {
    url =
      normalizarUrl(
        url
      );

    if (
      !url ||
      !ehRockstar(
        url
      )
    ) {
      continue;
    }

    if (
      urls.has(
        url
      )
    ) {
      continue;
    }

    urls.add(
      url
    );

    noticias.push({
      titulo:
        "",
      url,
    });
  }

  return noticias;
}

// ======================================================
// ROCKSTAR — EXTRAIR DADOS DO NEXT/JSON
// ======================================================

function procurarDadosRockstar(
  html
) {
  const $ =
    cheerio.load(
      html
    );

  const resultados = [];

  $(
    'script[type="application/ld+json"]'
  ).each(
    (_, elemento) => {
      try {
        const texto =
          $(
            elemento
          )
            .contents()
            .text();

        const json =
          JSON.parse(
            texto
          );

        const lista =
          Array.isArray(
            json
          )
            ? json
            : [json];

        for (
          const item of lista
        ) {
          if (!item)
            continue;

          const url =
            tornarUrlAbsoluta(
              item.url,
              "https://www.rockstargames.com"
            );

          if (
            !url ||
            !ehRockstar(
              url
            )
          ) {
            continue;
          }

          resultados.push({
            url:
              normalizarUrl(
                url
              ),
            titulo:
              limparTexto(
                item.headline ||
                  item.name ||
                  ""
              ),
            descricao:
              limparTexto(
                item.description ||
                  ""
              ),
            imagem:
              typeof item.image ===
              "string"
                ? item.image
                : item.image?.url ||
                  null,
          });
        }
      } catch {}
    }
  );

  return resultados;
}

async function buscarRockstar() {
  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  console.log(
    "🔎 Rockstar: buscando no Newswire oficial."
  );

  const resposta =
    await getComRetry(
      ROCKSTAR_NEWSWIRE,
      2
    );

  if (
    !resposta?.data
  ) {
    console.log(
      "⚠️ Rockstar: Newswire não respondeu."
    );

    return 0;
  }

  const noticias =
    extrairNoticiasRockstar(
      resposta.data
    );

  const dadosJSON =
    procurarDadosRockstar(
      resposta.data
    );

  // Mesclar dados encontrados
  for (
    const dado of dadosJSON
  ) {
    const existente =
      noticias.find(
        (n) =>
          normalizarUrl(
            n.url
          ) ===
          normalizarUrl(
            dado.url
          )
      );

    if (
      existente
    ) {
      if (
        !existente.titulo
      ) {
        existente.titulo =
          dado.titulo;
      }

      existente.descricao =
        dado.descricao;

      existente.imagem =
        dado.imagem;
    } else {
      noticias.push(
        dado
      );
    }
  }

  console.log(
    `🔎 Rockstar: ${noticias.length} candidatos oficiais encontrados.`
  );

  if (
    !noticias.length
  ) {
    console.log(
      "⚠️ Rockstar: o HTML inicial não entregou os artigos."
    );

    console.log(
      "ℹ️ Isso significa que o Newswire está sendo carregado dinamicamente."
    );

    return 0;
  }

  let publicadas = 0;

  for (
    const noticia of noticias.slice(
      0,
      MAX_CANDIDATOS
    )
  ) {
    if (
      publicadas >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }

    if (
      !ehRockstar(
        noticia.url
      )
    ) {
      continue;
    }

    if (
      await jaFoiPublicadaPorId(
        ID_GTA,
        noticia.url
      )
    ) {
      console.log(
        `⏭️ GTA: já publicada: ${noticia.titulo || noticia.url}`
      );

      continue;
    }

    let metadados =
      {
        titulo:
          noticia.titulo ||
          "",
        descricao:
          noticia.descricao ||
          "",
        imagem:
          noticia.imagem ||
          null,
      };

    // Se não temos imagem/prévia,
    // abrimos a notícia oficial.
    if (
      !metadados.imagem ||
      !metadados.descricao ||
      !metadados.titulo
    ) {
      const dados =
        await buscarMetadados(
          noticia.url,
          "gta"
        );

      metadados = {
        titulo:
          dados.titulo ||
          metadados.titulo,

        descricao:
          dados.descricao ||
          metadados.descricao,

        imagem:
          dados.imagem ||
          metadados.imagem,
      };
    }

    let titulo =
      metadados.titulo;

    if (!titulo) {
      titulo =
        "Nova notícia da Rockstar Games";
    }

    const descricao =
      metadados.descricao ||
      "Confira todos os detalhes diretamente no Newswire da Rockstar Games.";

    const publicou =
      await publicarNoticia({
        canalId:
          ID_GTA,
        tipo:
          "gta",
        titulo,
        descricao,
        imagem:
          metadados.imagem,
        url:
          noticia.url,
      });

    if (publicou) {
      publicadas++;
    }
  }

  console.log(
    `📊 Rockstar: ${publicadas} notícia(s) nova(s) publicada(s).`
  );

  return publicadas;
}

// ======================================================
// LOJA
// ======================================================

async function lojaPostadaHoje() {
  try {
    const canal =
      await client.channels.fetch(
        ID_LOJA
      );

    const mensagens =
      await canal.messages.fetch(
        {
          limit: 50,
        }
      );

    const hoje =
      new Date().toLocaleDateString(
        "pt-BR",
        {
          timeZone:
            "America/Sao_Paulo",
        }
      );

    for (
      const mensagem of mensagens.values()
    ) {
      if (
        !mensagem.embeds?.length
      ) {
        continue;
      }

      for (
        const embed of mensagem.embeds
      ) {
        if (
          embed.url !==
          LOJA_FORTNITE
        ) {
          continue;
        }

        const dataMensagem =
          mensagem.createdAt.toLocaleDateString(
            "pt-BR",
            {
              timeZone:
                "America/Sao_Paulo",
            }
          );

        if (
          dataMensagem ===
          hoje
        ) {
          return true;
        }
      }
    }
  } catch {}

  return false;
}

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

      return;
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
        "@everyone 🛒 CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR! 🔥",

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
      "🛒 LOJA DO FORTNITE PUBLICADA!"
    );
  } catch (erro) {
    console.log(
      `❌ Erro publicando loja: ${erro.message}`
    );
  }
}

// ======================================================
// HORÁRIO DA LOJA
// ======================================================

async function verificarHorarioLoja() {
  try {
    const agora =
      new Date();

    const brasil =
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
            false,
        }
      ).formatToParts(
        agora
      );

    const hora =
      Number(
        brasil.find(
          (x) =>
            x.type ===
            "hour"
        )?.value
      );

    const minuto =
      Number(
        brasil.find(
          (x) =>
            x.type ===
            "minute"
        )?.value
      );

    if (
      hora === 21 &&
      minuto <= 5
    ) {
      const jaPostou =
        await lojaPostadaHoje();

      if (
        !jaPostou
      ) {
        await publicarLoja();
      }
    }
  } catch (erro) {
    console.log(
      `⚠️ Erro verificando loja: ${erro.message}`
    );
  }
}

// ======================================================
// CICLO
// ======================================================

let cicloEmAndamento =
  false;

async function cicloNoticias() {
  if (
    cicloEmAndamento
  ) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando. Ignorando."
    );

    return;
  }

  cicloEmAndamento =
    true;

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

  try {
    await buscarFortnite();

    await buscarLibertyCity();

    await buscarRockstar();
  } catch (erro) {
    console.log(
      `❌ Erro geral no ciclo: ${erro.message}`
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

  cicloEmAndamento =
    false;
}

// ======================================================
// PIADAS
// ======================================================

const PIADAS = [
  "😂 O cara falou que ia jogar só uma partida... 4 horas depois ainda está no lobby.",
  "🎮 Meu PC não trava. Ele só tira um cochilo estratégico.",
  "🚔 No GTA eu respeito todas as leis... menos as de trânsito.",
  "🔥 Fortnite atualizou a loja. Minha carteira pediu demissão.",
  "😂 Se FPS desse dinheiro, eu já estava rico.",
  "🎮 O problema não é o ping. É o inimigo estar muito perto.",
  "💀 Entrei para jogar uma partida e saí com 17 traumas.",
];

function piadaAleatoria() {
  return PIADAS[
    Math.floor(
      Math.random() *
        PIADAS.length
    )
  ];
}

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

    const texto =
      message.content
        .trim()
        .toLowerCase();

    // ------------------------------
    // PIADA
    // ------------------------------

    if (
      texto ===
      "!piada"
    ) {
      await message.reply(
        piadaAleatoria()
      );

      return;
    }

    // ------------------------------
    // AJUDA
    // ------------------------------

    if (
      texto ===
      "!ajuda"
    ) {
      await message.reply(
        "🤖 **MURILITO NEWS — COMANDOS**\n\n" +
        "`!teste` — testa tudo\n" +
        "`!teste fortnite` — testa Fortnite\n" +
        "`!teste liberty` — testa LibertyCity\n" +
        "`!teste rockstar` — testa Rockstar\n" +
        "`!teste loja` — testa a Loja do Fortnite\n" +
        "`!piada` — manda uma piada 😂"
      );

      return;
    }

    // ------------------------------
    // TESTE FORTNITE
    // ------------------------------

    if (
      texto ===
      "!teste fortnite"
    ) {
      await message.reply(
        "🎮 Buscando notícias oficiais do Fortnite..."
      );

      await buscarFortnite();

      return;
    }

    // ------------------------------
    // TESTE LIBERTYCITY
    // ------------------------------

    if (
      texto ===
      "!teste liberty"
    ) {
      await message.reply(
        "🚔 Buscando notícias da LibertyCity..."
      );

      await buscarLibertyCity();

      return;
    }

    // ------------------------------
    // TESTE ROCKSTAR
    // ------------------------------

    if (
      texto ===
      "!teste rockstar"
    ) {
      await message.reply(
        "🚨 Buscando notícias oficiais da Rockstar..."
      );

      await buscarRockstar();

      return;
    }

    // ------------------------------
    // TESTE LOJA
    // ------------------------------

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

    // ------------------------------
    // TESTE COMPLETO
    // ------------------------------

    if (
      texto ===
      "!teste"
    ) {
      await message.reply(
        "🧪 Iniciando teste completo do Murilito NEWS..."
      );

      await buscarFortnite();

      await buscarLibertyCity();

      await buscarRockstar();

      return;
    }
  }
);

// ======================================================
// BOT ONLINE
// ======================================================

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

    // Ciclo imediato
    await cicloNoticias();

    // Notícias a cada 10 minutos
    setInterval(
      cicloNoticias,
      INTERVALO_NOTICIAS
    );

    // Loja
    setInterval(
      verificarHorarioLoja,
      INTERVALO_LOJA
    );
  }
);

// ======================================================
// LOGIN
// ======================================================

client.login(
  TOKEN
);
