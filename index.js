require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const Parser = require('rss-parser');
const parser = new Parser();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Frases divertidas
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

client.once('ready', () => {
  console.log(`✅ Murilito NEWS conectado como ${client.user.tag}`);

  // IDs dos canais
  const canalFortnite = client.channels.cache.get("1517339263216390164");
  const canalGTA = client.channels.cache.get("1520508956978712576");
  const canalPromo = client.channels.cache.get("1517333302032470191");

  // Mensagem de teste ao reiniciar
  canalFortnite?.send("🤖 Murilito reiniciou! Teste de postagem no canal Fortnite.");
  canalGTA?.send("🤖 Murilito reiniciou! Teste de postagem no canal GTA.");
  canalPromo?.send("🤖 Murilito reiniciou! Teste de postagem no canal Promoções.");

  // Funções de postagem de notícias
  async function postarFortnite() {
    try {
      const feed = await parser.parseURL('https://fortnite.gg/news/rss');
      const noticia = feed.items[0];
      if (!noticia) return;
      const frase = frasesFortnite[Math.floor(Math.random() * frasesFortnite.length)];
      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `📰 Use o CÓDIGO: **TIOKHREBIS**\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0x1abc9c,
        image: { url: noticia.enclosure?.url }
      };
      canalFortnite?.send({ content: "@everyone " + frase, embeds: [embed] });
    } catch (err) { console.error('Erro ao buscar Fortnite:', err); }
  }

  async function postarLibertyCity() {
    try {
      const feed = await parser.parseURL('https://pt.libertycity.net/news/rss');
      const noticia = feed.items[0];
      if (!noticia) return;
      const frase = frasesGTA[Math.floor(Math.random() * frasesGTA.length)];
      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `🚗 Nova notícia de GTA (LibertyCity)\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0xe74c3c,
        image: { url: noticia.enclosure?.url }
      };
      canalGTA?.send({ content: "@everyone " + frase, embeds: [embed] });
    } catch (err) { console.error('Erro ao buscar LibertyCity:', err); }
  }

  async function postarRockstar() {
    try {
      const feed = await parser.parseURL('https://www.rockstargames.com/br/newswire/rss');
      const noticia = feed.items[0];
      if (!noticia) return;
      const frase = frasesGTA[Math.floor(Math.random() * frasesGTA.length)];
      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `🚗 Nova notícia de GTA (Rockstar Newswire)\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0xf1c40f,
        image: { url: noticia.enclosure?.url }
      };
      canalGTA?.send({ content: "@everyone " + frase, embeds: [embed] });
    } catch (err) { console.error('Erro ao buscar Rockstar:', err); }
  }

  // Função para postar loja (link direto)
  async function postarLojaFortnite() {
    if (canalPromo) {
      const embed = {
        title: "🛍️ Loja Fortnite Atualizada!",
        description: "Clique no link abaixo para ver todas as skins da loja de hoje:\n\n👉 [Ver Loja no Fortnite.gg](https://fortnite.gg/shop)\n\n🛒 Não esqueça de usar o código **TIOKHREBIS** na loja!",
        color: 0x2ecc71,
        image: { url: "https://fortnite.gg/img/shop.jpg" }
      };
      canalPromo.send({ content: "@everyone Loja Fortnite disponível!", embeds: [embed] });
    }
  }

  // Agendamentos
  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 20 && agora.getMinutes() === 30) {
      const embed = {
        title: "🎯 Apoie com o código TIOKHREBIS 🎯",
        description: "🛒 **Quando for comprar algo na loja do Fortnite, use o código: TIOKHREBIS**\n\nApoie o Tio Khrebis e fortaleça a comunidade!",
        color: 0x3498db
      };
      canalPromo.send({ content: "@everyone Murilito lembra: apoiar nunca sai de moda 😎", embeds: [embed] });
    }
  }, 60000);

  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 21 && agora.getMinutes() === 0) postarLojaFortnite();
  }, 60000);

  setInterval(postarFortnite, 600000);
  setInterval(postarLibertyCity, 600000);
  setInterval(postarRockstar, 600000);
});

// Interatividade
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Comando de teste
  if (message.content.toLowerCase() === '!teste') {
    await message.channel.send("🔎 Testando Murilito... Últimas notícias:");
    await message.channel.send("➡️ Fortnite:");
    await postarFortnite();
    await message.channel.send("➡️ LibertyCity:");
    await postarLibertyCity();
    await message.channel.send("➡️ Rockstar:");
    await postarRockstar();
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
