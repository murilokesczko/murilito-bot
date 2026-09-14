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

  // Pega o canal certo
  const canal = client.channels.cache.get("1520508956978712576");

  // Mensagem de teste
  if (canal) {
    canal.send("✅ Teste: Murilito está funcionando e pronto pra postar notícias!");
  } else {
    console.error("❌ Canal não encontrado. Verifique o ID.");
  }

  // Função para postar notícias do LibertyCity
  async function postarLibertyCity() {
    try {
      const feed = await parser.parseURL('https://pt.libertycity.net/news/rss');
      const noticia = feed.items[0];
      canal.send(`📰 **Nova notícia de GTA (LibertyCity):**\n${noticia.title}\n${noticia.link}`);
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
      canal.send(`📰 **Nova notícia de GTA (Rockstar Newswire):**\n${noticia.title}\n${noticia.link}`);
      console.log(`Rockstar postada: ${noticia.title}`);
    } catch (err) {
      console.error('Erro ao buscar Rockstar:', err);
    }
  }

  // Checar ambos a cada 10 minutos
  setInterval(postarLibertyCity, 600000);
  setInterval(postarRockstar, 600000);
});

client.login(process.env.TOKEN);
