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

client.once('ready', () => {
  console.log(`✅ Murilito NEWS conectado como ${client.user.tag}`);

  // IDs dos canais
  const canalFortnite = client.channels.cache.get("1517339263216390164");
  const canalGTA = client.channels.cache.get("1520508956978712576");
  const canalPromo = client.channels.cache.get("1517333302032470191");

  // Função para postar notícias do Fortnite
  async function postarFortnite() {
    try {
      const feed = await parser.parseURL('https://fortnite.gg/news/rss');
      const noticia = feed.items[0];
      if (!noticia) return;

      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `📰 Use o CÓDIGO: **TIOKHREBIS**\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0x1abc9c,
        image: { url: noticia.enclosure?.url }
      };

      canalFortnite?.send({ content: "@everyone", embeds: [embed] });
    } catch (err) {
      console.error('Erro ao buscar Fortnite:', err);
    }
  }

  // Função para postar notícias do LibertyCity (GTA)
  async function postarLibertyCity() {
    try {
      const feed = await parser.parseURL('https://pt.libertycity.net/news/rss');
      const noticia = feed.items[0];
      if (!noticia) return;

      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `🚗 Nova notícia de GTA (LibertyCity)\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0xe74c3c,
        image: { url: noticia.enclosure?.url }
      };

      canalGTA?.send({ content: "@everyone", embeds: [embed] });
    } catch (err) {
      console.error('Erro ao buscar LibertyCity:', err);
    }
  }

  // Função para postar notícias do Rockstar Newswire (GTA)
  async function postarRockstar() {
    try {
      const feed = await parser.parseURL('https://www.rockstargames.com/br/newswire/rss');
      const noticia = feed.items[0];
      if (!noticia) return;

      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `🚗 Nova notícia de GTA (Rockstar Newswire)\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0xf1c40f,
        image: { url: noticia.enclosure?.url }
      };

      canalGTA?.send({ content: "@everyone", embeds: [embed] });
    } catch (err) {
      console.error('Erro ao buscar Rockstar:', err);
    }
  }

  // Função para postar mensagem fixa às 20:30
  function postarMensagemDiaria() {
    if (canalPromo) {
      const embed = {
        title: "🎯 Apoie com o código TIOKHREBIS 🎯",
        description: "🛒 **Quando for comprar algo na loja do Fortnite, use o código: TIOKHREBIS**\n\nApoie o Tio Khrebis e fortaleça a comunidade!",
        color: 0x3498db,
        image: { 
          url: "https://cdn.discordapp.com/attachments/1517333302032470191/1548861867429208105/Copilot_20260913_220355.png?ex=6aa89985&is=6aa74805&hm=0d44f5d41193443ea3ed485fc515e014d09ebe7ae6a94005493fcb8e0a8c817c&"
        }
      };
      canalPromo.send({ content: "@everyone", embeds: [embed] });
    }
  }

  // Função para postar loja do Fortnite às 21:00
  async function postarLojaFortnite() {
    if (canalPromo) {
      try {
        const { data } = await axios.get('https://fortnite.gg/shop');
        const $ = cheerio.load(data);

        $('.shop-section .shop-item').each((i, el) => {
          const nome = $(el).find('.shop-item-name').text();
          const preco = $(el).find('.shop-item-price').text();
          const imagem = $(el).find('img').attr('src');

          if (!nome || !imagem) return;

          const embed = {
            title: nome,
            description: `💰 Preço: ${preco}\n🛒 Use o código **TIOKHREBIS** na loja!`,
            color: 0x2ecc71,
            image: { url: imagem }
          };

          canalPromo.send({ content: "@everyone 🛍️ **Loja Fortnite Atualizada!**", embeds: [embed] });
        });
      } catch (err) {
        console.error("Erro ao buscar loja Fortnite:", err);
      }
    }
  }

  // Agendamento para 20:30 (mensagem diária)
  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 20 && agora.getMinutes() === 30) {
      postarMensagemDiaria();
    }
  }, 60000);

  // Agendamento para 21:00 (loja Fortnite)
  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 21 && agora.getMinutes() === 0) {
      postarLojaFortnite();
    }
  }, 60000);

  // Checar notícias a cada 10 minutos
  setInterval(postarFortnite, 600000);
  setInterval(postarLibertyCity, 600000);
  setInterval(postarRockstar, 600000);
});

client.login(process.env.TOKEN);
