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

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);

  // Canal onde o Murilo NEWS vai postar
  const canal = client.channels.cache.get("1517339263216390164");

  // Mensagem de teste ao iniciar
  if (canal) {
    canal.send("@everyone ✅ Teste: Murilo NEWS está funcionando e pronto pra postar notícias!");
  } else {
    console.error("❌ Canal não encontrado. Verifique o ID.");
  }

  // Função para postar notícias do Fortnite
  async function postarFortnite() {
    try {
      const feed = await parser.parseURL('https://fortnite.gg/news/rss');
      const noticia = feed.items[0];
      canal.send(`@everyone 📰 **Nova notícia de Fortnite: E use o código na Loja: TIOKHREBIS**\n${noticia.title}\n${noticia.link}`);
      console.log(`Fortnite postada: ${noticia.title}`);
    } catch (err) {
      console.error('Erro ao buscar Fortnite:', err);
    }
  }

  // Função para postar notícias do LibertyCity
  async function postarLibertyCity() {
    try {
      const feed = await parser.parseURL('https://pt.libertycity.net/news/rss');
      const noticia = feed.items[0];
      canal.send(`@everyone 📰 **Nova notícia de GTA (LibertyCity):**\n${noticia.title}\n${noticia.link}`);
      console.log(`LibertyCity postada: ${noticia.title}`);
    } catch (err) {
      console.error('Erro ao buscar LibertyCity:', err);
    }
  }

  // Função para postar notícias do Rockstar Newswire
  async function postarRockstar() {
    try {
      const feed = await parser.parseURL('https://www.rockstargames.com/br/newswire/rss');
      const noticia = feed.items[0];
      canal.send(`@everyone 📰 **Nova notícia de GTA (Rockstar Newswire):**\n${noticia.title}\n${noticia.link}`);
      console.log(`Rockstar postada: ${noticia.title}`);
    } catch (err) {
      console.error('Erro ao buscar Rockstar:', err);
    }
  }

  // Checar todos os sites a cada 10 minutos
  setInterval(postarFortnite, 600000);
  setInterval(postarLibertyCity, 600000);
  setInterval(postarRockstar, 600000);
});

client.login(process.env.TOKEN);
