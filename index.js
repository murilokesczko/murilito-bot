require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  Events
} = require('discord.js');

const axios = require('axios');
const Parser = require('rss-parser');
const cheerio = require('cheerio');

// ============================================================
// MURILITO NEWS
// Versão robusta - Discord + Notícias + Fortnite + GTA
// ============================================================

// ------------------------------------------------------------
// CONFIGURAÇÕES
// ------------------------------------------------------------

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error('❌ ERRO: variável TOKEN não encontrada no Railway.');
  process.exit(1);
}

// IDs dos canais
const ID_LOJA = '1517333302032470191';
const ID_FORTNITE = '1517339263216390164';
const ID_GTA = '1520508956978712576';

// Configurações
const CONFIG = {
  intervaloNoticias: 10 * 60 * 1000, // 10 minutos

  // Horário da loja diária
  horaLoja: 21,
  minutoLoja: 0,

  // Timezone do Brasil
  timezone: 'America/Sao_Paulo',

  // Quantidade de mensagens analisadas para evitar duplicatas
  mensagensParaVerificar: 50,

  // Timeout das páginas
  timeout: 15000,

  // Tentativas
  tentativas: 3
};

// ------------------------------------------------------------
// CLIENT DISCORD
// ------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

const parser = new Parser({
  timeout: CONFIG.timeout,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
  }
});

// ------------------------------------------------------------
// PIADAS
// ------------------------------------------------------------

const piadas = [
  'Por que o carro do GTA nunca quebra? Porque é blindado contra bugs 😂',
  'Fortnite sem construção é tipo pizza sem queijo 🍕',
  'Murilito entrou na loja... e saiu sem V-Bucks 😭',
  'CJ disse: "Ah, lá vamos nós de novo..." 🎮',
  'Essa skin parece que saiu de um churrasco de domingo 😂',
  'Breaking News: Murilito ainda não ganhou na loteria 🎰',
  'O Peely escorregou na própria casca 🍌',
  'Rockstar demora tanto pra lançar GTA 6 que até o CJ já ficou velho 👴',
  'Skin rara? Mais rara é ver o Murilito ganhar uma partida 😂',
  'Fortnite é tipo namoro: se não construir, desmorona 💔',
  'O Murilito abriu o GTA só para dirigir até a loja de armas 🚗😂',
  'GTA 6 chega em novembro. O boleto chega todo mês. 😭',
  'Se FPS desse dinheiro, o Murilito já estava rico 😂',
  'A melhor estratégia no Fortnite é culpar o lag 🎮',
  'Murilito: "Só mais uma partida." 3 horas depois... 💀',
  'Rockstar: preparando GTA 6. Murilito: esperando a notícia. 👀',
  'Meu PC roda GTA. Minha paciência com os bugs não roda. 😂',
  'Fortnite atualizou. O armazenamento do PC chorou. 💀',
  'A skin é bonita. A carteira discorda. 💸',
  'Murilito NEWS: onde a fofoca gamer vira notícia 😂'
];

// ------------------------------------------------------------
// FRASES
// ------------------------------------------------------------

const frasesGTA = [
  '🚗 Essa notícia é mais quente que o motor do CJ!',
  '🔥 Rockstar soltando novidade, segura o hype!',
  '👀 Murilito NEWS detectou novidade no universo GTA!',
  '🎮 Tem cheiro de GTA 6 no ar!',
  '🚨 Atenção, fãs de GTA! Temos novidade!'
];

const frasesFortnite = [
  '🛒 Essa notícia merece aparecer na loja!',
  '🔥 Murilito encontrou novidade no Fortnite!',
  '🎮 Atenção, jogadores de Fortnite!',
  '💸 Será que essa novidade vai custar V-Bucks?',
  '👀 O Murilito NEWS está de olho!'
];

// ------------------------------------------------------------
// UTILIDADES
// ------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function limparTexto(texto) {
  if (!texto) return '';

  return texto
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function limitarTexto(texto, limite = 3900) {
  texto = limparTexto(texto);

  if (texto.length <= limite) {
    return texto;
  }

  return texto.slice(0, limite - 3) + '...';
}

function normalizarUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Remove parâmetros de tracking
    parsed.searchParams.delete('utm_source');
    parsed.searchParams.delete('utm_medium');
    parsed.searchParams.delete('utm_campaign');
    parsed.searchParams.delete('utm_content');
    parsed.searchParams.delete('utm_term');

    return parsed.toString();
  } catch {
    return url;
  }
}

function escolher(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function obterHoraBrasil() {
  const agora = new Date();

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CONFIG.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(agora);
}

function obterDataBrasil() {
  const agora = new Date();

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CONFIG.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(agora);
}

// ------------------------------------------------------------
// HTTP ROBUSTO
// ------------------------------------------------------------

async function baixarPagina(url, tentativa = 1) {
  try {
    const response = await axios.get(url, {
      timeout: CONFIG.timeout,

      maxRedirects: 5,

      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },

      validateStatus: status => status >= 200 && status < 400
    });

    return response.data;
  } catch (error) {
    console.error(
      `⚠️ Falha HTTP ${tentativa}/${CONFIG.tentativas} em ${url}:`,
      error.message
    );

    if (tentativa < CONFIG.tentativas) {
      await sleep(1500 * tentativa);
      return baixarPagina(url, tentativa + 1);
    }

    throw error;
  }
}

// ------------------------------------------------------------
// VALIDAR CANAL
// ------------------------------------------------------------

function validarCanal(channel, nome) {
  if (!channel) {
    console.error(`❌ Canal ${nome} não encontrado.`);
    return false;
  }

  if (!channel.isTextBased()) {
    console.error(`❌ Canal ${nome} não é um canal de texto.`);
    return false;
  }

  return true;
}

// ------------------------------------------------------------
// VERIFICAR SE NOTÍCIA JÁ FOI PUBLICADA
// ------------------------------------------------------------

async function noticiaJaPublicada(channel, noticia) {
  try {
    const mensagens = await channel.messages.fetch({
      limit: CONFIG.mensagensParaVerificar
    });

    const url = normalizarUrl(noticia.url);

    for (const [, mensagem] of mensagens) {
      if (!mensagem.embeds || mensagem.embeds.length === 0) {
        continue;
      }

      for (const embed of mensagem.embeds) {
        if (!embed.url) continue;

        if (normalizarUrl(embed.url) === url) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error(
      `⚠️ Não consegui verificar duplicata em #${channel.name}:`,
      error.message
    );

    // Se não conseguir verificar, não bloqueia a postagem.
    return false;
  }
}

// ------------------------------------------------------------
// PUBLICAR EMBED
// ------------------------------------------------------------

async function publicarNoticia(channel, noticia) {
  if (!validarCanal(channel, noticia.fonte)) {
    return false;
  }

  if (!noticia || !noticia.url || !noticia.title) {
    console.error(`❌ Notícia inválida recebida de ${noticia?.fonte}`);
    return false;
  }

  // Evita duplicatas
  const duplicada = await noticiaJaPublicada(channel, noticia);

  if (duplicada) {
    console.log(
      `⏭️ ${noticia.fonte}: notícia já publicada, ignorando.`
    );

    return false;
  }

  let embed = new EmbedBuilder()
    .setTitle(limitarTexto(noticia.title, 256))
    .setURL(noticia.url)
    .setDescription(
      limitarTexto(
        `${noticia.frase || ''}\n\n${noticia.description || 'Clique no título para ler a notícia completa.'}`,
        4000
      )
    )
    .setColor(noticia.color || 0x3498db)
    .setFooter({
      text: `Murilito NEWS • ${noticia.fonte}`
    })
    .setTimestamp();

  if (noticia.image) {
    embed.setImage(noticia.image);
  }

  try {
    await channel.send({
      content: noticia.mencao || undefined,
      embeds: [embed]
    });

    console.log(
      `✅ ${noticia.fonte}: "${noticia.title}"`
    );

    return true;
  } catch (error) {
    console.error(
      `❌ Erro ao enviar notícia ${noticia.fonte}:`,
      error
    );

    return false;
  }
}

// ============================================================
// FORTNITE
// ============================================================

async function buscarFortnite() {
  const rssUrl = 'https://fortnite.gg/news/rss';

  try {
    const xml = await baixarPagina(rssUrl);

    const feed = await parser.parseString(xml);

    if (!feed.items || feed.items.length === 0) {
      throw new Error('RSS do Fortnite não retornou notícias.');
    }

    const item = feed.items[0];

    const url = normalizarUrl(item.link);

    if (!url) {
      throw new Error('Notícia Fortnite sem URL.');
    }

    let description = limparTexto(
      item.contentSnippet ||
      item.content ||
      item.summary ||
      ''
    );

    let image = null;

    // Tenta descobrir imagem na notícia
    try {
      const html = await baixarPagina(url);
      const $ = cheerio.load(html);

      image =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        null;

      const textoPagina = $('article p')
        .map((i, el) => $(el).text())
        .get()
        .join('\n');

      if (textoPagina.trim()) {
        description = limparTexto(textoPagina);
      }
    } catch (error) {
      console.log(
        '⚠️ Não consegui carregar detalhes do Fortnite. Usando RSS.'
      );
    }

    return {
      fonte: 'Fortnite.gg',
      title: item.title || 'Notícia Fortnite',
      url,
      description: limitarTexto(description, 3300),
      image,
      frase: escolher(frasesFortnite),
      color: 0x1abc9c,
      mencao: '@everyone 📰 **Nova notícia Fortnite!**'
    };
  } catch (error) {
    console.error('❌ Fortnite:', error.message);
    return null;
  }
}

async function postarFortnite(channel) {
  const noticia = await buscarFortnite();

  if (!noticia) {
    console.log('⚠️ Fortnite: nenhuma notícia disponível.');
    return false;
  }

  return publicarNoticia(channel, noticia);
}

// ============================================================
// LIBERTYCITY
// ============================================================

async function buscarLibertyCity() {
  const urlBase = 'https://pt.libertycity.net/news/';

  try {
    const html = await baixarPagina(urlBase);
    const $ = cheerio.load(html);

    const noticias = [];

    // Procura links que apontem para matérias
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');

      if (!href) return;

      const link = new URL(href, urlBase).href;

      // Ignora links que não são notícias
      if (
        !link.includes('pt.libertycity.net/news/') ||
        link === urlBase ||
        link.includes('/news/page/')
      ) {
        return;
      }

      const titulo = limparTexto($(el).text());

      if (!titulo) return;

      // Ignora navegação
      const ignorar = [
        'Leia mais',
        'Notícias',
        'Próxima página',
        'Voltar',
        'GTA 6',
        'GTA 5',
        'GTA 4',
        'GTA San Andreas'
      ];

      if (
        ignorar.some(
          palavra => titulo.toLowerCase() === palavra.toLowerCase()
        )
      ) {
        return;
      }

      // Só aceita títulos razoavelmente grandes
      if (titulo.length < 15) return;

      noticias.push({
        title: titulo,
        url: normalizarUrl(link),
        element: el
      });
    });

    // Remove duplicados
    const unicas = [];

    const urlsVistas = new Set();

    for (const noticia of noticias) {
      if (urlsVistas.has(noticia.url)) continue;

      urlsVistas.add(noticia.url);
      unicas.push(noticia);
    }

    if (unicas.length === 0) {
      throw new Error(
        'Não encontrei nenhuma notícia na página do LibertyCity.'
      );
    }

    const primeira = unicas[0];

    // Procura imagem e resumo próximo do link
    let image = null;
    let description = '';

    const parent = $(primeira.element).parent();

    image =
      parent.find('img').first().attr('src') ||
      parent.find('img').first().attr('data-src') ||
      null;

    if (image) {
      image = new URL(image, urlBase).href;
    }

    description = limparTexto(
      parent.text()
    );

    // Se não encontrou uma descrição boa, tenta meta tags da notícia
    if (description.length < 80) {
      try {
        const noticiaHtml = await baixarPagina(primeira.url);
        const noticia$ = cheerio.load(noticiaHtml);

        description =
          noticia$('meta[property="og:description"]').attr('content') ||
          noticia$('meta[name="description"]').attr('content') ||
          limparTexto(
            noticia$('article p')
              .map((i, el) => $(el).text())
              .get()
              .join('\n')
          );

        image =
          noticia$('meta[property="og:image"]').attr('content') ||
          image;
      } catch (error) {
        console.log(
          '⚠️ LibertyCity: não consegui abrir a matéria individual.'
        );
      }
    }

    return {
      fonte: 'LibertyCity',
      title: primeira.title,
      url: primeira.url,
      description: limitarTexto(
        description || 'Nova notícia publicada no LibertyCity.',
        3300
      ),
      image,
      frase: escolher(frasesGTA),
      color: 0xe74c3c,
      mencao: '@everyone 🚗 **Nova notícia GTA / LibertyCity!**'
    };
  } catch (error) {
    console.error(
      '❌ LibertyCity:',
      error.message
    );

    return null;
  }
}

async function postarLibertyCity(channel) {
  const noticia = await buscarLibertyCity();

  if (!noticia) {
    console.log('⚠️ LibertyCity: nenhuma notícia disponível.');
    return false;
  }

  return publicarNoticia(channel, noticia);
}

// ============================================================
// ROCKSTAR NEWSWIRE
// ============================================================

async function buscarRockstar() {
  const urlBase =
    'https://www.rockstargames.com/br/newswire';

  try {
    const html = await baixarPagina(urlBase);
    const $ = cheerio.load(html);

    const noticias = [];

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');

      if (!href) return;

      const link = new URL(href, urlBase).href;

      // Rockstar Newswire usa URLs contendo /newswire/
      if (!link.includes('rockstargames.com')) return;
      if (!link.includes('/newswire/')) return;

      const titulo = limparTexto($(el).text());

      if (!titulo || titulo.length < 10) return;

      const ignorar = [
        'Mais notícias',
        'Boletim',
        'Vídeos',
        'Downloads',
        'Suporte',
        'Loja',
        'Obter Launcher'
      ];

      if (
        ignorar.some(
          palavra =>
            titulo.toLowerCase() === palavra.toLowerCase()
        )
      ) {
        return;
      }

      noticias.push({
        title: titulo,
        url: normalizarUrl(link),
        element: el
      });
    });

    // Remove duplicados
    const unicas = [];
    const urls = new Set();

    for (const noticia of noticias) {
      if (urls.has(noticia.url)) continue;

      urls.add(noticia.url);
      unicas.push(noticia);
    }

    if (unicas.length === 0) {
      throw new Error(
        'Rockstar não retornou links de notícias no HTML.'
      );
    }

    const primeira = unicas[0];

    let image = null;
    let description = '';

    // Tenta pegar imagem do card
    const parent = $(primeira.element).parent();

    image =
      parent.find('img').first().attr('src') ||
      parent.find('img').first().attr('data-src') ||
      null;

    if (image) {
      image = new URL(image, urlBase).href;
    }

    description = limparTexto(parent.text());

    // Tenta abrir a notícia individual
    try {
      const noticiaHtml = await baixarPagina(primeira.url);
      const noticia$ = cheerio.load(noticiaHtml);

      description =
        noticia$('meta[property="og:description"]').attr('content') ||
        noticia$('meta[name="description"]').attr('content') ||
        limparTexto(
          noticia$('article p')
            .map((i, el) => $(el).text())
            .get()
            .join('\n')
        ) ||
        description;

      image =
        noticia$('meta[property="og:image"]').attr('content') ||
        noticia$('meta[name="twitter:image"]').attr('content') ||
        image;
    } catch (error) {
      console.log(
        '⚠️ Rockstar: não consegui abrir a notícia individual.'
      );
    }

    return {
      fonte: 'Rockstar Games',
      title: primeira.title,
      url: primeira.url,
      description: limitarTexto(
        description || 'Nova publicação no Rockstar Newswire.',
        3300
      ),
      image,
      frase: escolher(frasesGTA),
      color: 0xf1c40f,
      mencao: '@everyone 🚨 **Nova notícia da Rockstar Games!**'
    };
  } catch (error) {
    console.error(
      '❌ Rockstar:',
      error.message
    );

    return null;
  }
}

async function postarRockstar(channel) {
  const noticia = await buscarRockstar();

  if (!noticia) {
    console.log('⚠️ Rockstar: nenhuma notícia disponível.');
    return false;
  }

  return publicarNoticia(channel, noticia);
}

// ============================================================
// LOJA FORTNITE
// ============================================================

async function postarLojaFortnite(channel) {
  if (!validarCanal(channel, 'Loja Fortnite')) {
    return false;
  }

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Loja Fortnite Atualizada!')
    .setURL('https://fortnite.gg/shop')
    .setDescription(
      'Clique no link abaixo para ver todas as skins da loja de hoje:\n\n' +
      '👉 [Ver Loja no Fortnite.gg](https://fortnite.gg/shop)\n\n' +
      '🛒 Não esqueça de usar o código **TIOKHREBIS** na loja!'
    )
    .setColor(0x2ecc71)
    .setImage('https://fortnite.gg/img/shop.jpg')
    .setFooter({
      text: 'Murilito NEWS • Loja Fortnite'
    })
    .setTimestamp();

  try {
    await channel.send({
      content: '@everyone 🛍️ **Loja Fortnite disponível!**',
      embeds: [embed]
    });

    console.log('✅ Loja Fortnite publicada.');

    return true;
  } catch (error) {
    console.error(
      '❌ Erro ao publicar Loja Fortnite:',
      error
    );

    return false;
  }
}

// ============================================================
// CICLO DE NOTÍCIAS
// ============================================================

let cicloExecutando = false;

async function executarNoticias() {
  if (cicloExecutando) {
    console.log(
      '⏳ O ciclo anterior ainda está executando. Ignorando este ciclo.'
    );

    return;
  }

  cicloExecutando = true;

  try {
    console.log('');
    console.log('========================================');
    console.log('📰 INICIANDO CICLO DE NOTÍCIAS');
    console.log(`🇧🇷 ${obterDataBrasil()} ${obterHoraBrasil()}`);
    console.log('========================================');

    const canalFortnite =
      client.channels.cache.get(ID_FORTNITE);

    const canalGTA =
      client.channels.cache.get(ID_GTA);

    // Fortnite
    if (canalFortnite) {
      await postarFortnite(canalFortnite);
    }

    // Pequeno intervalo entre sites
    await sleep(2000);

    // LibertyCity
    if (canalGTA) {
      await postarLibertyCity(canalGTA);
    }

    await sleep(2000);

    // Rockstar
    if (canalGTA) {
      await postarRockstar(canalGTA);
    }

    console.log('========================================');
    console.log('✅ CICLO FINALIZADO');
    console.log('========================================');
    console.log('');
  } catch (error) {
    console.error(
      '❌ Erro inesperado no ciclo:',
      error
    );
  } finally {
    cicloExecutando = false;
  }
}

// ============================================================
// HORÁRIO DA LOJA
// ============================================================

let ultimaLoja = null;

function verificarLoja() {
  const hora = obterHoraBrasil();

  const [horaAtual, minutoAtual] = hora
    .split(':')
    .map(Number);

  const data = obterDataBrasil();

  if (
    horaAtual === CONFIG.horaLoja &&
    minutoAtual === CONFIG.minutoLoja
  ) {
    if (ultimaLoja === data) {
      return;
    }

    ultimaLoja = data;

    const canalLoja =
      client.channels.cache.get(ID_LOJA);

    if (canalLoja) {
      postarLojaFortnite(canalLoja);
    }
  }
}

// ============================================================
// TESTES
// ============================================================

async function testarTudo(channel) {
  await channel.send(
    '🔎 **Murilito NEWS — teste completo iniciado!**\n\n' +
    'Vou testar as fontes uma por uma. Aguarde...'
  );

  const canalFortnite =
    client.channels.cache.get(ID_FORTNITE);

  const canalGTA =
    client.channels.cache.get(ID_GTA);

  const canalLoja =
    client.channels.cache.get(ID_LOJA);

  if (canalFortnite) {
    await postarFortnite(canalFortnite);
  }

  await sleep(2000);

  if (canalGTA) {
    await postarLibertyCity(canalGTA);
  }

  await sleep(2000);

  if (canalGTA) {
    await postarRockstar(canalGTA);
  }

  await sleep(2000);

  if (canalLoja) {
    await postarLojaFortnite(canalLoja);
  }

  await channel.send(
    '✅ **Teste do Murilito NEWS finalizado!**'
  );
}

// ============================================================
// READY
// ============================================================

client.once(Events.ClientReady, async readyClient => {
  console.log('');
  console.log('========================================');
  console.log('🤖 MURILITO NEWS ONLINE');
  console.log('========================================');
  console.log(`👤 Login: ${readyClient.user.tag}`);
  console.log(`🆔 ID: ${readyClient.user.id}`);
  console.log(`🇧🇷 Horário: ${obterHoraBrasil()}`);
  console.log('========================================');
  console.log('');

  // Verifica canais
  const canais = [
    ['LOJA', ID_LOJA],
    ['FORTNITE', ID_FORTNITE],
    ['GTA', ID_GTA]
  ];

  for (const [nome, id] of canais) {
    const canal = client.channels.cache.get(id);

    if (canal) {
      console.log(`✅ Canal ${nome}: ${canal.name}`);
    } else {
      console.error(
        `❌ Canal ${nome} NÃO encontrado: ${id}`
      );
    }
  }

  console.log('');

  // Testa notícias imediatamente ao iniciar
  await executarNoticias();

  // Notícias a cada 10 minutos
  setInterval(
    executarNoticias,
    CONFIG.intervaloNoticias
  );

  // Verificação do horário da loja
  setInterval(
    verificarLoja,
    30000
  );

  console.log(
    `⏰ Notícias configuradas para verificar a cada ${CONFIG.intervaloNoticias / 60000} minutos.`
  );

  console.log(
    `🛍️ Loja diária configurada para ${String(CONFIG.horaLoja).padStart(2, '0')}:${String(CONFIG.minutoLoja).padStart(2, '0')} (Brasil).`
  );
});

// ============================================================
// MENSAGENS / COMANDOS
// ============================================================

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;

    const comando = message.content
      .trim()
      .toLowerCase();

    // ------------------------------------------
    // PIADA
    // ------------------------------------------

    if (comando === '!piada') {
      await message.channel.send(
        `😂 **Murilito NEWS:**\n\n${escolher(piadas)}`
      );

      return;
    }

    // ------------------------------------------
    // TESTE COMPLETO
    // ------------------------------------------

    if (comando === '!teste') {
      await testarTudo(message.channel);
      return;
    }

    // ------------------------------------------
    // TESTE INDIVIDUAL FORTNITE
    // ------------------------------------------

    if (comando === '!teste fortnite') {
      const canal =
        client.channels.cache.get(ID_FORTNITE);

      if (!canal) {
        await message.channel.send(
          '❌ Canal Fortnite não encontrado.'
        );
        return;
      }

      await postarFortnite(canal);

      await message.channel.send(
        '✅ Teste Fortnite executado.'
      );

      return;
    }

    // ------------------------------------------
    // TESTE INDIVIDUAL LIBERTYCITY
    // ------------------------------------------

    if (
      comando === '!teste liberty' ||
      comando === '!teste libertycity'
    ) {
      const canal =
        client.channels.cache.get(ID_GTA);

      if (!canal) {
        await message.channel.send(
          '❌ Canal GTA não encontrado.'
        );
        return;
      }

      await postarLibertyCity(canal);

      await message.channel.send(
        '✅ Teste LibertyCity executado.'
      );

      return;
    }

    // ------------------------------------------
    // TESTE INDIVIDUAL ROCKSTAR
    // ------------------------------------------

    if (comando === '!teste rockstar') {
      const canal =
        client.channels.cache.get(ID_GTA);

      if (!canal) {
        await message.channel.send(
          '❌ Canal GTA não encontrado.'
        );
        return;
      }

      await postarRockstar(canal);

      await message.channel.send(
        '✅ Teste Rockstar executado.'
      );

      return;
    }

    // ------------------------------------------
    // TESTE LOJA
    // ------------------------------------------

    if (comando === '!teste loja') {
      const canal =
        client.channels.cache.get(ID_LOJA);

      if (!canal) {
        await message.channel.send(
          '❌ Canal Loja não encontrado.'
        );
        return;
      }

      await postarLojaFortnite(canal);

      await message.channel.send(
        '✅ Teste da Loja executado.'
      );

      return;
    }

    // ------------------------------------------
    // AJUDA
    // ------------------------------------------

    if (comando === '!ajuda' || comando === '!help') {
      const embed = new EmbedBuilder()
        .setTitle('🤖 Murilito NEWS — Comandos')
        .setDescription(
          '**Comandos disponíveis:**\n\n' +
          '😂 `!piada` — manda uma piada\n' +
          '🧪 `!teste` — testa todas as fontes\n' +
          '🎮 `!teste fortnite` — testa Fortnite\n' +
          '🚗 `!teste liberty` — testa LibertyCity\n' +
          '🚨 `!teste rockstar` — testa Rockstar\n' +
          '🛍️ `!teste loja` — testa a Loja Fortnite\n' +
          '❓ `!ajuda` — mostra esta mensagem'
        )
        .setColor(0x3498db)
        .setFooter({
          text: 'Murilito NEWS'
        });

      await message.channel.send({
        embeds: [embed]
      });

      return;
    }

    // ------------------------------------------
    // REAÇÕES
    // ------------------------------------------

    if (
      comando.includes('fortnite') &&
      !comando.startsWith('!')
    ) {
      try {
        await message.react('🛒');
      } catch {}
    }

    if (
      comando.includes('gta') &&
      !comando.startsWith('!')
    ) {
      try {
        await message.react('🚗');
      } catch {}
    }
  } catch (error) {
    console.error(
      '❌ Erro no processamento da mensagem:',
      error
    );
  }
});

// ============================================================
// ERROS DO DISCORD
// ============================================================

client.on(Events.Error, error => {
  console.error('❌ Discord Client Error:', error);
});

client.on(Events.Warn, warning => {
  console.warn('⚠️ Discord Warning:', warning);
});

process.on('unhandledRejection', error => {
  console.error(
    '❌ Unhandled Promise Rejection:',
    error
  );
});

process.on('uncaughtException', error => {
  console.error(
    '❌ Uncaught Exception:',
    error
  );
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
