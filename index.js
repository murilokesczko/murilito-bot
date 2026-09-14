require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const parser = new Parser();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// IDs fixos dos canais
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// Lista de piadas/frases (adicione até 100+)
const piadas = [
  "Por que o carro do GTA nunca quebra? Porque é blindado contra bugs 😂",
  "Fortnite sem construção é tipo pizza sem queijo 🍕",
  "Murilito entrou na loja... e saiu sem V-Bucks 😭",
  "CJ disse: 'Ah, lá vamos nós de novo...' 🎮",
  "Essa skin parece que saiu de um churrasco de domingo 😂",
  "Breaking News: Murilito ainda não ganhou na loteria 🎰",
  "O Peely escorregou na própria casca 🍌",
  "Rockstar demora tanto pra lançar GTA 6 que até o CJ já ficou velho 👴",
  "Skin rara? Mais rara é ver o Murilito ganhar uma partida 😂",
  "Fortnite é tipo namoro: se não construir, desmorona 💔",
  // ... continue até 100+
];

const frasesGTA = [
  "🚗 Essa notícia é mais quente que o motor do CJ!",
  "🔥 Rockstar soltando novidade, segura o hype!",
  "Murilito analisou: essa atualização merece 5 estrelas ⭐⭐⭐⭐⭐"
];

const frasesFortnite = [
  "🛒 Essa skin parece que saiu de um churrasco de domingo 😂",
  "💸 Promoção imperdível: risadas grátis junto com a skin!",
  "Murilito recomenda: compre duas skins e ganhe uma piada!"
];
// Funções de postagem com scraping e seletores específicos
async function postarFortnite(channel) {
  try {
    const feed = await parser.parseURL('https://fortnite.gg/news/rss');
    const noticia = feed.items[0];
    if (!noticia) {
      channel.send("❌ Não consegui buscar notícia de Fortnite. Veja direto em https://fortnite.gg/news");
      return;
    }

    const response = await axios.get(noticia.link);
    const $ = cheerio.load(response.data);
    const textoCompleto = $('.post-content, .content').text().trim().slice(0, 1000);

    const embed = {
      title: noticia.title || "Notícia Fortnite",
      url: noticia.link || "https://fortnite.gg/news",
      description: `📰 Use o CÓDIGO: **TIOKHREBIS**\n\n${textoCompleto || noticia.contentSnippet || "Clique no link para ver mais!"}`,
      color: 0x1abc9c
    };
    channel.send({ content: "@everyone Última notícia Fortnite:", embeds: [embed] });
  } catch (err) {
    console.error('Erro ao buscar Fortnite:', err);
    channel.send("❌ Erro ao buscar notícia de Fortnite. Veja direto em https://fortnite.gg/news");
  }
}

async function postarLibertyCity(channel) {
  try {
    const feed = await parser.parseURL('https://pt.libertycity.net/news/rss');
    const noticia = feed.items[0];
    if (!noticia) {
      channel.send("❌ Não consegui buscar notícia de LibertyCity. Veja direto em https://pt.libertycity.net/news");
      return;
    }

    const response = await axios.get(noticia.link);
    const $ = cheerio.load(response.data);
    const textoCompleto = $('.news-text, .content').text().trim().slice(0, 1000);

    const embed = {
      title: noticia.title || "Notícia LibertyCity",
      url: noticia.link || "https://pt.libertycity.net/news",
      description: `🚗 Nova notícia de GTA (LibertyCity)\n\n${textoCompleto || noticia.contentSnippet || "Clique no link para ver mais!"}`,
      color: 0xe74c3c
    };
    channel.send({ content: "@everyone Última notícia LibertyCity:", embeds: [embed] });
  } catch (err) {
    console.error('Erro ao buscar LibertyCity:', err);
    channel.send("❌ Erro ao buscar notícia de LibertyCity. Veja direto em https://pt.libertycity.net/news");
  }
}

async function postarRockstar(channel) {
  try {
    const feed = await parser.parseURL('https://www.rockstargames.com/br/newswire/rss');
    const noticia = feed.items[0];
    if (!noticia) {
      channel.send("❌ Não consegui buscar notícia da Rockstar. Veja direto em https://www.rockstargames.com/br/newswire");
      return;
    }

    const response = await axios.get(noticia.link);
    const $ = cheerio.load(response.data);
    const textoCompleto = $('.article-body .content, .content').text().trim().slice(0, 1000);

    const embed = {
      title: noticia.title || "Notícia Rockstar",
      url: noticia.link || "https://www.rockstargames.com/br/newswire",
      description: `🚗 Nova notícia de GTA (Rockstar Newswire)\n\n${textoCompleto || noticia.contentSnippet || "Clique no link para ver mais!"}`,
      color: 0xf1c40f
    };
    channel.send({ content: "@everyone Última notícia Rockstar:", embeds: [embed] });
  } catch (err) {
    console.error('Erro ao buscar Rockstar:', err);
    channel.send("❌ Erro ao buscar notícia da Rockstar. Veja direto em https://www.rockstargames.com/br/newswire");
  }
}

async function postarLojaFortnite(channel) {
  const embed = {
    title: "🛍️ Loja Fortnite Atualizada!",
    description: "Clique no link abaixo para ver todas as skins da loja de hoje:\n\n👉 [Ver Loja no Fortnite.gg](https://fortnite.gg/shop)\n\n🛒 Não esqueça de usar o código **TIOKHREBIS** na loja!",
    color: 0x2ecc71,
    image: { url: "https://fortnite.gg/img/shop.jpg" }
  };
  channel.send({ content: "@everyone Loja Fortnite disponível!", embeds: [embed] });
}

client.once('ready', () => {
  console.log(`✅ Murilito NEWS conectado como ${client.user.tag}`);

  const canalFortnite = client.channels.cache.get(ID_FORTNITE);
  const canalGTA = client.channels.cache.get(ID_GTA);
  const canalLoja = client.channels.cache.get(ID_LOJA);

  // Agendamentos
  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 20 && agora.getMinutes() === 30) {
      const embed = {
        title: "🎯 Apoie com o código TIOKHREBIS 🎯",
        description: "🛒 **Quando for comprar algo na loja do Fortnite, use o código: TIOKHREBIS**\n\nApoie o Tio Khrebis e fortaleça a comunidade!",
        color: 0x3498db
      };
      canalLoja.send({ content: "@everyone Murilito lembra: apoiar nunca sai de moda 😎", embeds: [embed] });
    }
  }, 60000);

  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 21 && agora.getMinutes() === 0) postarLojaFortnite(canalLoja);
  }, 60000);

  setInterval(() => postarFortnite(canalFortnite), 600000);
  setInterval(() => postarLibertyCity(canalGTA), 600000);
  setInterval(() => postarRockstar(canalGTA), 600000);
});

// Interatividade
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Comando de teste
  if (message.content.toLowerCase() === '!teste') {
    await message.channel.send("🔎 Testando Murilito... Últimas postagens reais:");

    await postarFortnite(client.channels.cache.get(ID_FORTNITE));
    await postarLibertyCity(client.channels.cache.get(ID_GTA));
    await postarRockstar(client.channels.cache.get(ID_GTA));
    await postarLojaFortnite(client.channels.cache.get(ID_LOJA));
  }

  // Comando de piada
  if (message.content.toLowerCase() === '!piada') {
    const piada = piadas[Math.floor(Math.random() * piadas.length)];
    message.channel.send(piada);
  }

  // Reações automáticas
  if (message.content.toLowerCase().includes('fortnite')) {
    message.react('🛒');
  }
  if (message.content.toLowerCase().includes('gta')) {
    message.react('🚗');
  }
});

client.login(process.env.TOKEN);
