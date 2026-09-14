require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const Parser = require("rss-parser");

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado nas variáveis do Railway.");
  process.exit(1);
}

// ============================================================
// CANAIS
// ============================================================

const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// ============================================================
// LINKS
// ============================================================

const LOJA_FORTNITE =
  "https://www.fortnite.com/item-shop?lang=pt-BR";

// ============================================================
// INTERVALOS
// ============================================================

const INTERVALO_NOTICIAS = 10 * 60 * 1000;
const INTERVALO_VERIFICACAO_LOJA = 30 * 1000;

const MAX_IDADE_NOTICIA_DIAS = 14;
const MAX_NOTICIAS_POR_FONTE = 3;

// ============================================================
// CLIENTE
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  },
});

let ultimoDiaLoja = null;
let cicloEmAndamento = false;

// ============================================================
// UTILIDADES
// ============================================================

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limparTexto(texto = "") {
  return String(texto)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function limitarTexto(texto, limite = 850) {
  texto = limparTexto(texto);

  if (!texto) return "";

  if (texto.length <= limite) {
    return texto;
  }

  return texto.slice(0, limite - 3).trim() + "...";
}

function urlValida(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function obterDiaBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function obterDataBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

function noticiaRecente(data) {
  if (!data) return true;

  const dataNoticia = new Date(data);

  if (Number.isNaN(dataNoticia.getTime())) {
    return true;
  }

  const limite =
    Date.now() -
    MAX_IDADE_NOTICIA_DIAS *
      24 *
      60 *
      60 *
      1000;

  return dataNoticia.getTime() >= limite;
}

// ============================================================
// FRASES DAS NOTÍCIAS
// ============================================================

const FRASES = {
  Fortnite: [
    "🔥 Tem novidade chegando quente no Fortnite!",
    "👀 Fica ligado porque essa novidade merece atenção!",
    "🚨 Novidade fresquinha do Fortnite para vocês!",
    "🎮 O Fortnite não para! Olha essa novidade!",
    "🔥 Mais uma novidade saindo do forno!",
    "👀 Essa aqui vale a pena conferir!",
    "🚨 Atenção, jogadores! Tem novidade importante!",
    "🎯 O mundo do Fortnite acaba de ganhar mais uma novidade!",
    "💥 Eita! Essa novidade promete movimentar o Fortnite!",
    "📰 Murilito NEWS trazendo mais uma novidade do Fortnite!",
  ],

  GTA: [
    "🚨 Tem novidade quente no universo GTA!",
    "👀 Olha essa novidade que acabou de sair!",
    "🔥 GTA não para! Confira essa novidade!",
    "🚔 Mais uma notícia importante para os fãs de GTA!",
    "💥 Essa novidade promete dar o que falar!",
    "🎮 O universo GTA acaba de ganhar mais uma novidade!",
    "👀 Fica ligado nessa porque vale a leitura!",
    "🚨 Novidade fresquinha para os fãs da Rockstar!",
    "🔥 Murilito NEWS trazendo mais uma do universo GTA!",
    "📰 Acabou de sair! Confira essa novidade!",
  ],
};

function escolherFrase(categoria) {
  const lista =
    FRASES[categoria] ||
    FRASES.GTA;

  return lista[
    Math.floor(
      Math.random() * lista.length
    )
  ];
}

// ============================================================
// HTTP
// ============================================================

async function getComRetry(
  url,
  tentativas = 3,
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

      const resposta = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,

        validateStatus: (status) =>
          status >= 200 && status < 400,

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          "Accept-Language":
            "pt-BR,pt;q=0.9,en;q=0.8",

          Referer:
            "https://www.google.com/",

          ...configExtra.headers,
        },

        ...configExtra,
      });

      console.log(
        `✅ HTTP ${resposta.status} | ${url}`
      );

      return resposta;
    } catch (erro) {
      console.log(
        `⚠️ Falha HTTP: ${url}`
      );

      console.log(
        `   ${erro.response?.status || "sem resposta"}`
      );

      if (tentativa < tentativas) {
        await esperar(
          1500 * tentativa
        );
      }
    }
  }

  throw new Error(
    `Falha ao acessar ${url}`
  );
}

// ============================================================
// METADADOS DA MATÉRIA
// ============================================================

async function buscarDadosMateria(
  url,
  fonte
) {
  const dados = {
    titulo: null,
    resumo: null,
    imagem: null,
  };

  try {
    console.log(
      `📝 ${fonte}: buscando imagem e prévia...`
    );

    const resposta =
      await getComRetry(
        url,
        2
      );

    const $ =
      cheerio.load(
        resposta.data
      );

    // ========================================================
    // TÍTULO
    // ========================================================

    dados.titulo =
      limparTexto(
        $('meta[property="og:title"]').attr(
          "content"
        ) ||
          $('meta[name="twitter:title"]').attr(
            "content"
          ) ||
          $("h1").first().text()
      );

    // ========================================================
    // RESUMO
    // ========================================================

    dados.resumo =
      limitarTexto(
        $(
          'meta[property="og:description"]'
        ).attr("content") ||
          $(
            'meta[name="description"]'
          ).attr("content") ||
          $(
            'meta[name="twitter:description"]'
          ).attr("content") ||
          "",
        850
      );

    // ========================================================
    // IMAGEM
    // ========================================================

    let imagem =
      $(
        'meta[property="og:image"]'
      ).attr("content") ||
      $(
        'meta[property="og:image:url"]'
      ).attr("content") ||
      $(
        'meta[name="twitter:image"]'
      ).attr("content") ||
      $(
        'meta[name="twitter:image:src"]'
      ).attr("content");

    if (imagem) {
      try {
        imagem = new URL(
          imagem,
          url
        ).toString();

        if (urlValida(imagem)) {
          dados.imagem =
            imagem;
        }
      } catch {}
    }

    // ========================================================
    // FALLBACK DE RESUMO
    // ========================================================

    if (
      !dados.resumo ||
      dados.resumo.length < 40
    ) {
      const candidatos = [
        $("article p").first().text(),
        $("main p").first().text(),
        $(".article-content p").first().text(),
        $(".news-content p").first().text(),
        $(".post-content p").first().text(),
        $(".content p").first().text(),
      ];

      for (
        const candidato of candidatos
      ) {
        const texto =
          limitarTexto(
            candidato,
            850
          );

        if (
          texto &&
          texto.length >= 40
        ) {
          dados.resumo =
            texto;

          break;
        }
      }
    }

    if (!dados.resumo) {
      dados.resumo =
        "Confira todos os detalhes da notícia clicando no título acima.";
    }

    console.log(
      `🖼️ ${fonte}: imagem ${
        dados.imagem
          ? "encontrada"
          : "não encontrada"
      }`
    );

    return dados;
  } catch (erro) {
    console.log(
      `⚠️ ${fonte}: não foi possível obter os metadados.`
    );

    dados.resumo =
      "Confira todos os detalhes da notícia clicando no título acima.";

    return dados;
  }
}

// ============================================================
// DUPLICIDADE
// ============================================================

async function noticiaJaPublicada(
  canal,
  url
) {
  try {
    const mensagens =
      await canal.messages.fetch({
        limit: 100,
      });

    const urlBase =
      url.split("?")[0];

    for (
      const [, mensagem] of mensagens
    ) {
      for (
        const embed of mensagem.embeds
      ) {
        if (!embed.url) continue;

        const embedUrl =
          embed.url.split("?")[0];

        if (
          embedUrl ===
          urlBase
        ) {
          return true;
        }
      }
    }

    return false;
  } catch (erro) {
    console.log(
      `⚠️ Erro verificando duplicidade: ${erro.message}`
    );

    return false;
  }
}

// ============================================================
// PUBLICAR NOTÍCIA
// ============================================================

async function publicarNoticia({
  canal,
  categoria,
  titulo,
  url,
  resumo,
  imagem,
}) {
  if (!canal) {
    console.log(
      `❌ ${categoria}: canal não encontrado.`
    );

    return false;
  }

  if (!urlValida(url)) {
    console.log(
      `❌ ${categoria}: URL inválida.`
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
      `⏭️ ${categoria}: já publicada: ${titulo}`
    );

    return false;
  }

  const config =
    categoria === "Fortnite"
      ? {
          icone: "🎮",
          nome: "Fortnite",
        }
      : {
          icone: "🚔",
          nome: "GTA",
        };

  const frase =
    escolherFrase(
      categoria
    );

  const embed =
    new EmbedBuilder()
      .setTitle(
        `${config.icone} ${limitarTexto(
          titulo,
          250
        )}`
      )
      .setURL(url)
      .setDescription(
        `${frase}\n\n` +
          `📰 ${limitarTexto(
            resumo,
            800
          )}\n\n` +
          `👇 **Clique no título acima para ler a matéria completa.**`
      )
      .setFooter({
        text:
          `Murilito NEWS • ${config.nome}`,
      })
      .setTimestamp();

  if (
    imagem &&
    urlValida(imagem)
  ) {
    embed.setImage(
      imagem
    );
  }

  try {
    await canal.send({
      content:
        "@everyone",

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
      `📢 ${categoria}: notícia publicada.`
    );

    console.log(
      `   ${titulo}`
    );

    console.log(
      `   Frase: ${frase}`
    );

    return true;
  } catch (erro) {
    console.error(
      `❌ ${categoria}: erro ao publicar`
    );

    console.error(
      erro.message
    );

    return false;
  }
}

// ============================================================
// FORTNITE
// ============================================================

// Primeiro tenta fontes que podem ser acessadas pelo Railway.
// O fortnite.com está retornando 403 no seu Railway,
// então ele NÃO será a única fonte.

async function buscarFortniteGoogleNews() {
  const encontrados = [];
  const urls = new Set();

  const consultas = [
    "Fortnite notícias site:fortnite.com/news",
    "Fortnite news site:fortnite.com/news",
  ];

  for (
    const consulta of consultas
  ) {
    try {
      const rssUrl =
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent(
          consulta
        ) +
        "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

      const resposta =
        await getComRetry(
          rssUrl,
          2
        );

      const feed =
        await rssParser.parseString(
          resposta.data
        );

      console.log(
        `📰 Fortnite Google News: ${feed.items.length} itens.`
      );

      for (
        const item of feed.items
      ) {
        if (
          encontrados.length >=
          MAX_NOTICIAS_POR_FONTE
        ) {
          break;
        }

        let link =
          item.link;

        if (!link) continue;

        // Alguns resultados já trazem URL oficial
        if (
          link.includes(
            "fortnite.com/news/"
          )
        ) {
          if (
            !urls.has(link)
          ) {
            urls.add(link);

            encontrados.push({
              titulo:
                limparTexto(
                  item.title
                ),
              url: link,
              data:
                item.pubDate ||
                null,
            });
          }

          continue;
        }

        // Caso Google News esconda a URL,
        // tenta extrair do HTML.
        try {
          const pagina =
            await getComRetry(
              link,
              1
            );

          const $ =
            cheerio.load(
              pagina.data
            );

          const links =
            $("a[href]");

          let oficial =
            null;

          links.each(
            (_, a) => {
              const href =
                $(a).attr(
                  "href"
                );

              if (
                href &&
                href.includes(
                  "fortnite.com/news/"
                )
              ) {
                oficial =
                  href;
              }
            }
          );

          if (
            oficial &&
            !urls.has(
              oficial
            )
          ) {
            urls.add(
              oficial
            );

            encontrados.push({
              titulo:
                limparTexto(
                  item.title
                ),
              url: oficial,
              data:
                item.pubDate ||
                null,
            });
          }
        } catch {}
      }
    } catch (erro) {
      console.log(
        `⚠️ Fortnite Google News: ${erro.message}`
      );
    }

    if (
      encontrados.length >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }
  }

  return encontrados;
}

async function buscarNoticiasFortnite() {
  console.log(
    "━━━━━━━━ Fortnite ━━━━━━━━"
  );

  console.log(
    "🔎 Fortnite: tentando Google News para contornar bloqueio 403."
  );

  let noticias =
    await buscarFortniteGoogleNews();

  // Se Google não encontrar, tenta diretamente.
  if (
    noticias.length === 0
  ) {
    console.log(
      "⚠️ Fortnite: Google News não encontrou. Tentando site oficial."
    );

    const paginas = [
      "https://www.fortnite.com/news?lang=pt-BR",
      "https://www.fortnite.com/news/tag/all-news?lang=pt-BR",
    ];

    for (
      const pagina of paginas
    ) {
      try {
        const resposta =
          await getComRetry(
            pagina,
            1
          );

        const $ =
          cheerio.load(
            resposta.data
          );

        $("a[href]").each(
          (_, elemento) => {
            if (
              noticias.length >=
              MAX_NOTICIAS_POR_FONTE
            ) {
              return;
            }

            const href =
              $(elemento).attr(
                "href"
              );

            const titulo =
              limparTexto(
                $(elemento).text()
              );

            if (
              !href ||
              !titulo
            ) {
              return;
            }

            if (
              !href.includes(
                "/news/"
              )
            ) {
              return;
            }

            let link;

            try {
              link =
                new URL(
                  href,
                  "https://www.fortnite.com"
                ).toString();
            } catch {
              return;
            }

            if (
              link.endsWith(
                "/news/"
              )
            ) {
              return;
            }

            noticias.push({
              titulo,
              url: link,
              data: null,
            });
          }
        );
      } catch {}
    }
  }

  // Remove duplicados
  const unicas = [];
  const urls = new Set();

  for (
    const noticia of noticias
  ) {
    if (
      !urls.has(
        noticia.url
      )
    ) {
      urls.add(
        noticia.url
      );

      unicas.push(
        noticia
      );
    }
  }

  console.log(
    `📰 Fortnite: ${unicas.length} notícias encontradas.`
  );

  return unicas.slice(
    0,
    MAX_NOTICIAS_POR_FONTE
  );
}

// ============================================================
// LIBERTYCITY
// ============================================================

async function buscarNoticiasLibertyCity() {
  console.log(
    "━━━━━━━━ LibertyCity ━━━━━━━━"
  );

  const paginas = [
    "https://pt.libertycity.net/news/",
    "https://pt.libertycity.net/news/page/2/",
  ];

  const encontrados = [];
  const urlsVistas = new Set();

  for (
    const pagina of paginas
  ) {
    try {
      const resposta =
        await getComRetry(
          pagina,
          3
        );

      const $ =
        cheerio.load(
          resposta.data
        );

      let contador = 0;

      $("a[href]").each(
        (_, elemento) => {
          const href =
            $(elemento).attr(
              "href"
            );

          const titulo =
            limparTexto(
              $(elemento).text()
            );

          if (
            !href ||
            !titulo
          ) {
            return;
          }

          if (
            !href.includes(
              "/news/"
            )
          ) {
            return;
          }

          if (
            !/\/news\/[^/]+\/\d+-[^/]+\.html/i.test(
              href
            )
          ) {
            return;
          }

          if (
            titulo.length < 15
          ) {
            return;
          }

          if (
            titulo
              .toLowerCase()
              .includes(
                "próxima página"
              )
          ) {
            return;
          }

          let link;

          try {
            link =
              new URL(
                href,
                "https://pt.libertycity.net"
              ).toString();
          } catch {
            return;
          }

          if (
            urlsVistas.has(
              link
            )
          ) {
            return;
          }

          urlsVistas.add(
            link
          );

          encontrados.push({
            titulo,
            url: link,
            data: null,
          });

          contador++;
        }
      );

      console.log(
        `🔎 LibertyCity: ${contador} possíveis notícias em ${pagina}`
      );
    } catch {
      console.log(
        `⚠️ LibertyCity: erro em ${pagina}`
      );
    }

    if (
      encontrados.length >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }
  }

  console.log(
    `📰 LibertyCity: ${encontrados.length} notícias recebidas.`
  );

  return encontrados.slice(
    0,
    MAX_NOTICIAS_POR_FONTE
  );
}

// ============================================================
// ROCKSTAR
// ============================================================

function limparUrlRockstar(url) {
  if (!url) return null;

  try {
    url = url
      .replace(
        /&amp;/gi,
        "&"
      )
      .replace(
        /&#38;/gi,
        "&"
      )
      .replace(
        /&quot;/gi,
        '"'
      );

    const parsed =
      new URL(url);

    if (
      !parsed.hostname
        .toLowerCase()
        .includes(
          "rockstargames.com"
        )
    ) {
      return null;
    }

    parsed.search = "";
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

async function decodificarGoogleNews(
  urlGoogle
) {
  try {
    if (!urlGoogle) {
      return null;
    }

    if (
      urlGoogle.includes(
        "rockstargames.com"
      )
    ) {
      return limparUrlRockstar(
        urlGoogle
      );
    }

    const resposta =
      await getComRetry(
        urlGoogle,
        1
      );

    const html =
      String(
        resposta.data
      );

    const matches =
      html.match(
        /https?:\/\/[^"'\\\s<>]+/gi
      ) || [];

    for (
      const encontrada of matches
    ) {
      let limpa =
        encontrada
          .replace(
            /\\u003d/g,
            "="
          )
          .replace(
            /\\u0026/g,
            "&"
          )
          .replace(
            /&amp;/g,
            "&"
          );

      if (
        limpa.includes(
          "rockstargames.com/newswire"
        )
      ) {
        const final =
          limparUrlRockstar(
            limpa
          );

        if (final) {
          return final;
        }
      }
    }

    const escapadas =
      html.match(
        /https?:\\\/\\\/(?:www\.)?rockstargames\.com[^"'\\\s<>]+/gi
      );

    if (escapadas) {
      for (
        let url of escapadas
      ) {
        url =
          url
            .replace(
              /\\\//g,
              "/"
            )
            .replace(
              /\\u003d/g,
              "="
            )
            .replace(
              /\\u0026/g,
              "&"
            );

        const final =
          limparUrlRockstar(
            url
          );

        if (final) {
          return final;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function buscarNoticiasRockstar() {
  console.log(
    "━━━━━━━━ Rockstar ━━━━━━━━"
  );

  console.log(
    "🔎 Rockstar: iniciando busca de notícias."
  );

  const dataBusca =
    new Date(
      Date.now() -
        MAX_IDADE_NOTICIA_DIAS *
          24 *
          60 *
          60 *
          1000
    )
      .toISOString()
      .slice(0, 10);

  const consultas = [
    `site:rockstargames.com/br/newswire/article after:${dataBusca}`,
    `site:rockstargames.com/newswire/article after:${dataBusca}`,
  ];

  const encontrados = [];
  const urlsVistas = new Set();

  for (
    const consulta of consultas
  ) {
    try {
      const rssUrl =
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent(
          consulta
        ) +
        "&hl=pt-BR&gl=BR&ceid=BR:pt-419";

      const resposta =
        await getComRetry(
          rssUrl,
          2
        );

      const feed =
        await rssParser.parseString(
          resposta.data
        );

      console.log(
        `📰 Rockstar RSS: ${feed.items.length} itens encontrados.`
      );

      for (
        const item of feed.items
      ) {
        if (
          encontrados.length >=
          MAX_NOTICIAS_POR_FONTE
        ) {
          break;
        }

        let urlOriginal =
          await decodificarGoogleNews(
            item.link
          );

        if (!urlOriginal) {
          continue;
        }

        urlOriginal =
          limparUrlRockstar(
            urlOriginal
          );

        if (!urlOriginal) {
          continue;
        }

        if (
          !urlOriginal.includes(
            "/newswire/article/"
          )
        ) {
          continue;
        }

        if (
          urlsVistas.has(
            urlOriginal
          )
        ) {
          continue;
        }

        urlsVistas.add(
          urlOriginal
        );

        encontrados.push({
          titulo:
            limparTexto(
              item.title
            ),
          url: urlOriginal,
          data:
            item.pubDate ||
            null,
        });
      }
    } catch (erro) {
      console.log(
        `⚠️ Rockstar RSS: ${erro.message}`
      );
    }

    if (
      encontrados.length >=
      MAX_NOTICIAS_POR_FONTE
    ) {
      break;
    }
  }

  console.log(
    `📰 Rockstar: ${encontrados.length} notícias oficiais encontradas.`
  );

  return encontrados;
}

// ============================================================
// PROCESSAR NOTÍCIAS
// ============================================================

async function processarNoticias(
  noticias,
  categoria,
  canal
) {
  if (
    !noticias ||
    noticias.length === 0
  ) {
    console.log(
      `⚠️ ${categoria}: nenhuma notícia encontrada.`
    );

    return;
  }

  let publicadas = 0;

  for (
    const noticia of noticias
  ) {
    if (
      !noticiaRecente(
        noticia.data
      )
    ) {
      continue;
    }

    if (
      await noticiaJaPublicada(
        canal,
        noticia.url
      )
    ) {
      console.log(
        `⏭️ ${categoria}: já publicada: ${noticia.titulo}`
      );

      continue;
    }

    const dados =
      await buscarDadosMateria(
        noticia.url,
        categoria
      );

    const tituloFinal =
      dados.titulo ||
      noticia.titulo;

    const publicou =
      await publicarNoticia({
        canal,
        categoria,
        titulo:
          tituloFinal,
        url:
          noticia.url,
        resumo:
          dados.resumo,
        imagem:
          dados.imagem,
      });

    if (publicou) {
      publicadas++;

      await esperar(
        1500
      );
    }
  }

  console.log(
    `📊 ${categoria}: ${publicadas} notícia(s) nova(s) publicada(s).`
  );
}

// ============================================================
// CICLO DE NOTÍCIAS
// ============================================================

async function executarCicloNoticias() {
  if (cicloEmAndamento) {
    console.log(
      "⏳ Ciclo anterior ainda está rodando."
    );

    return;
  }

  cicloEmAndamento = true;

  console.log(
    "========================================"
  );

  console.log(
    "📰 INICIANDO CICLO DE NOTÍCIAS"
  );

  console.log(
    `🇧🇷 ${obterDataBrasil()}`
  );

  console.log(
    "========================================"
  );

  try {
    const canalFortnite =
      await client.channels.fetch(
        ID_FORTNITE
      );

    const canalGTA =
      await client.channels.fetch(
        ID_GTA
      );

    // Fortnite
    try {
      const noticias =
        await buscarNoticiasFortnite();

      await processarNoticias(
        noticias,
        "Fortnite",
        canalFortnite
      );
    } catch (erro) {
      console.error(
        `❌ Fortnite: ${erro.message}`
      );
    }

    // LibertyCity
    try {
      const noticias =
        await buscarNoticiasLibertyCity();

      await processarNoticias(
        noticias,
        "GTA",
        canalGTA
      );
    } catch (erro) {
      console.error(
        `❌ LibertyCity: ${erro.message}`
      );
    }

    // Rockstar
    try {
      const noticias =
        await buscarNoticiasRockstar();

      await processarNoticias(
        noticias,
        "GTA",
        canalGTA
      );
    } catch (erro) {
      console.error(
        `❌ Rockstar: ${erro.message}`
      );
    }
  } catch (erro) {
    console.error(
      `❌ Erro geral: ${erro.message}`
    );
  } finally {
    cicloEmAndamento =
      false;

    console.log(
      "========================================"
    );

    console.log(
      "🏁 CICLO FINALIZADO"
    );

    console.log(
      "========================================"
    );
  }
}

// ============================================================
// IMAGEM DA LOJA
// ============================================================

async function buscarImagemLoja() {
  const imagens = [
    "https://fortnite.gg/img/og-shop.jpg",
    "https://fortnite.gg/img/og-shop.png",
  ];

  for (
    const imagem of imagens
  ) {
    try {
      const resposta =
        await axios.head(
          imagem,
          {
            timeout: 8000,
            validateStatus: (status) =>
              status >= 200 &&
              status < 400,
          }
        );

      if (
        resposta.status >= 200 &&
        resposta.status < 400
      ) {
        return imagem;
      }
    } catch {}
  }

  return "https://fortnite.gg/img/og-shop.jpg";
}

// ============================================================
// FRASES DA LOJA
// ============================================================

const FRASES_LOJA = [
  "🔥 A loja acabou de virar!",
  "👀 Bora conferir o que chegou hoje?",
  "💸 Preparados para gastar os V-Bucks?",
  "🛒 Tem item novo esperando por vocês!",
  "🔥 Corre porque a loja já atualizou!",
  "👀 Será que hoje veio aquela skin que você queria?",
  "💰 Hora de conferir as novidades da loja!",
  "🎮 A loja de hoje já está disponível!",
];

function escolherFraseLoja() {
  return FRASES_LOJA[
    Math.floor(
      Math.random() *
        FRASES_LOJA.length
    )
  ];
}

// ============================================================
// LOJA
// ============================================================

async function postarLojaFortnite(
  forcar = false
) {
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

    const hoje =
      obterDiaBrasil();

    if (
      !forcar &&
      ultimoDiaLoja === hoje
    ) {
      console.log(
        "⏭️ Loja já publicada hoje."
      );

      return;
    }

    if (!forcar) {
      const mensagens =
        await canal.messages.fetch({
          limit: 30,
        });

      for (
        const [, mensagem] of mensagens
      ) {
        const existe =
          mensagem.embeds.some(
            (embed) =>
              embed.url ===
              LOJA_FORTNITE
          );

        if (existe) {
          ultimoDiaLoja =
            hoje;

          console.log(
            "⏭️ Loja de hoje já está no canal."
          );

          return;
        }
      }
    }

    console.log(
      "🖼️ Buscando imagem da loja..."
    );

    const imagemLoja =
      await buscarImagemLoja();

    const frase =
      escolherFraseLoja();

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🛒 LOJA DO FORTNITE ATUALIZADA!"
        )
        .setURL(
          LOJA_FORTNITE
        )
        .setDescription(
          `${frase}\n\n` +
            "🔥 **A Loja de Itens do Fortnite acabou de atualizar!**\n\n" +
            "👀 Confira todas as skins, picaretas, gestos, mochilas e outros itens disponíveis hoje.\n\n" +
            "👇 **Clique no título acima para abrir a loja oficial.**"
        )
        .setImage(
          imagemLoja
        )
        .setFooter({
          text:
            "Murilito NEWS • Loja Fortnite",
        })
        .setTimestamp();

    await canal.send({
      content:
        "@everyone\n🛒 **CORRE! A LOJA DO FORTNITE ACABOU DE ATUALIZAR!** 🔥",

      embeds: [
        embed,
      ],

      allowedMentions: {
        parse: [
          "everyone",
        ],
      },
    });

    ultimoDiaLoja =
      hoje;

    console.log(
      "🛒 Loja publicada."
    );

    console.log(
      `💬 Frase: ${frase}`
    );
  } catch (erro) {
    console.error(
      `❌ Erro na loja: ${erro.message}`
    );
  }
}

// ============================================================
// AGENDAMENTO 21H
// ============================================================

function agendarLoja21h() {
  const agora =
    new Date();

  const brasil =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Sao_Paulo",

        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",

        hour12: false,
      }
    ).formatToParts(
      agora
    );

  const partes = {};

  for (
    const parte of brasil
  ) {
    partes[
      parte.type
    ] = parte.value;
  }

  const hora =
    Number(
      partes.hour
    );

  const minuto =
    Number(
      partes.minute
    );

  const segundo =
    Number(
      partes.second
    );

  let segundos =
    21 * 60 * 60 -
    (
      hora * 3600 +
      minuto * 60 +
      segundo
    );

  if (
    segundos <= 0
  ) {
    segundos +=
      24 * 60 * 60;
  }

  console.log(
    `⏰ Próxima loja em aproximadamente ${segundos} segundos.`
  );

  setTimeout(
    async () => {
      await postarLojaFortnite(
        false
      );

      agendarLoja21h();
    },
    segundos * 1000
  );
}

// ============================================================
// COMANDOS
// ============================================================

client.on(
  "messageCreate",
  async (message) => {
    if (
      message.author.bot
    ) {
      return;
    }

    const comando =
      message.content
        .trim()
        .toLowerCase();

    try {
      // ======================================================
      // TESTE COMPLETO
      // ======================================================

      if (
        comando === "!teste"
      ) {
        await message.reply(
          "🧪 **Iniciando teste completo do Murilito NEWS...**"
        );

        await postarLojaFortnite(
          true
        );

        await executarCicloNoticias();

        return;
      }

      // ======================================================
      // FORTNITE
      // ======================================================

      if (
        comando ===
        "!teste fortnite"
      ) {
        await message.reply(
          "🎮 **Testando notícias do Fortnite...**"
        );

        const canal =
          await client.channels.fetch(
            ID_FORTNITE
          );

        const noticias =
          await buscarNoticiasFortnite();

        await processarNoticias(
          noticias,
          "Fortnite",
          canal
        );

        return;
      }

      // ======================================================
      // LIBERTYCITY
      // ======================================================

      if (
        comando ===
        "!teste liberty"
      ) {
        await message.reply(
          "🚔 **Testando LibertyCity...**"
        );

        const canal =
          await client.channels.fetch(
            ID_GTA
          );

        const noticias =
          await buscarNoticiasLibertyCity();

        await processarNoticias(
          noticias,
          "GTA",
          canal
        );

        return;
      }

      // ======================================================
      // ROCKSTAR
      // ======================================================

      if (
        comando ===
        "!teste rockstar"
      ) {
        await message.reply(
          "🚨 **Testando Rockstar Newswire...**"
        );

        const canal =
          await client.channels.fetch(
            ID_GTA
          );

        const noticias =
          await buscarNoticiasRockstar();

        await processarNoticias(
          noticias,
          "GTA",
          canal
        );

        return;
      }

      // ======================================================
      // LOJA
      // ======================================================

      if (
        comando ===
        "!teste loja"
      ) {
        await message.reply(
          "🛒 **Testando Loja Fortnite...**"
        );

        await postarLojaFortnite(
          true
        );

        return;
      }

      // ======================================================
      // PIADA
      // ======================================================

      if (
        comando === "!piada"
      ) {
        const piadas = [
          "Por que o jogador levou o Fortnite para o médico? Porque estava com falta de skin. 😂",

          "GTA Online é igual boleto: quando você acha que acabou, aparece outro. 😂",

          "Meu PC não trava no GTA... ele só precisa pensar um pouco. 😂",

          "Eu ia economizar dinheiro, mas a Loja do Fortnite atualizou. 💸😂",

          "Meu personagem no GTA tem mais carro que eu na vida real. 😂",
        ];

        const piada =
          piadas[
            Math.floor(
              Math.random() *
                piadas.length
            )
          ];

        await message.reply(
          `😂 ${piada}`
        );

        return;
      }

      // ======================================================
      // AJUDA
      // ======================================================

      if (
        comando === "!ajuda"
      ) {
        const embed =
          new EmbedBuilder()
            .setTitle(
              "🤖 Murilito NEWS — Comandos"
            )
            .setDescription(
              [
                "🧪 **Testes**",

                "`!teste` — testa tudo",

                "`!teste fortnite` — testa Fortnite",

                "`!teste liberty` — testa LibertyCity",

                "`!teste rockstar` — testa Rockstar",

                "`!teste loja` — testa a Loja Fortnite",

                "",

                "😂 **Diversão**",

                "`!piada` — manda uma piada",

                "",

                "📰 **Automático**",

                "🎮 Fortnite e GTA são verificados a cada 10 minutos.",

                "🛒 A Loja do Fortnite é verificada diariamente às 21:00.",

                "",

                "🔥 Todas as notícias recebem uma chamada/frase automática.",
              ].join("\n")
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
    } catch (erro) {
      console.error(
        `❌ Erro no comando: ${erro.message}`
      );

      try {
        await message.reply(
          "❌ Ocorreu um erro ao executar esse comando."
        );
      } catch {}
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

    await executarCicloNoticias();

    await postarLojaFortnite(
      false
    );

    // Notícias a cada 10 minutos
    setInterval(
      executarCicloNoticias,
      INTERVALO_NOTICIAS
    );

    // Watchdog da loja
    setInterval(
      () => {
        const hora =
          new Intl.DateTimeFormat(
            "en-US",
            {
              timeZone:
                "America/Sao_Paulo",

              hour: "2-digit",
              minute: "2-digit",

              hour12: false,
            }
          ).format(
            new Date()
          );

        if (
          hora === "21:00"
        ) {
          postarLojaFortnite(
            false
          );
        }
      },
      INTERVALO_VERIFICACAO_LOJA
    );

    agendarLoja21h();
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
  TOKEN
);
