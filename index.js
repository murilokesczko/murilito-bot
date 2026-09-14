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

  // IDs dos canais
  const canalFortnite = client.channels.cache.get("1517339263216390164");
  const canalGTA = client.channels.cache.get("1520508956978712576");
  const canalPromo = client.channels.cache.get("1517333302032470191");

  // Mensagens de teste ao iniciar
  if (canalFortnite) {
    canalFortnite.send("@everyone ✅ Teste: Murilo NEWS está funcionando e pronto pra postar notícias de Fortnite!");
  }
  if (canalGTA) {
    canalGTA.send("@everyone ✅ Teste: Murilo NEWS está funcionando e pronto pra postar notícias de GTA!");
  }
  if (canalPromo) {
    canalPromo.send("@everyone ✅ Teste: Mensagem diária configurada!");
  }

  // Função para postar notícias do Fortnite
  async function postarFortnite() {
    try {
      const feed = await parser.parseURL('https://fortnite.gg/news/rss');
      const noticia = feed.items[0];

      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `📰 Use o CÓDIGO: **TIOKHREBIS**\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0x1abc9c,
        image: { url: noticia.enclosure?.url }
      };

      canalFortnite.send({ content: "@everyone", embeds: [embed] });
      console.log(`Fortnite postada: ${noticia.title}`);
    } catch (err) {
      console.error('Erro ao buscar Fortnite:', err);
    }
  }

  // Função para postar notícias do LibertyCity (GTA)
  async function postarLibertyCity() {
    try {
      const feed = await parser.parseURL('https://pt.libertycity.net/news/rss');
      const noticia = feed.items[0];

      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `🚗 Nova notícia de GTA (LibertyCity)\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0xe74c3c,
        image: { url: noticia.enclosure?.url }
      };

      canalGTA.send({ content: "@everyone", embeds: [embed] });
      console.log(`LibertyCity postada: ${noticia.title}`);
    } catch (err) {
      console.error('Erro ao buscar LibertyCity:', err);
    }
  }

  // Função para postar notícias do Rockstar Newswire (GTA)
  async function postarRockstar() {
    try {
      const feed = await parser.parseURL('https://www.rockstargames.com/br/newswire/rss');
      const noticia = feed.items[0];

      const embed = {
        title: noticia.title,
        url: noticia.link,
        description: `🚗 Nova notícia de GTA (Rockstar Newswire)\n\n${noticia.contentSnippet || "Clique no link para ver mais!"}`,
        color: 0xf1c40f,
        image: { url: noticia.enclosure?.url }
      };

      canalGTA.send({ content: "@everyone", embeds: [embed] });
      console.log(`Rockstar postada: ${noticia.title}`);
    } catch (err) {
      console.error('Erro ao buscar Rockstar:', err);
    }
  }

  // Função para postar mensagem fixa às 20:30
  function postarMensagemDiaria() {
    if (canalPromo) {
      const embed = {
        title: "🎯 Apoie com o código TIOKHREBIS 🎯",
        description: "🛒 **Quando for comprar algo na loja do Fortnite, use o código: TIOKHREBIS**\n\nApoie o Murilo NEWS e fortaleça a comunidade!",
        color: 0x3498db,
        image: { 
          url: "https://cdn.discordapp.com/attachments/1517333302032470191/1548861867429208105/Copilot_20260913_220355.png?ex=6aa89985&is=6aa74805&hm=0d44f5d41193443ea3ed485fc515e014d09ebe7ae6a94005493fcb8e0a8c817c&"
        }
      };
      canalPromo.send({ content: "@everyone", embeds: [embed] });
      console.log("Mensagem diária enviada!");
    }
  }

  // Agendar para 20:30 todos os dias
  function agendarMensagemDiaria() {
    setInterval(() => {
      const agora = new Date();
      const horas = agora.getHours();
      const minutos = agora.getMinutes();

      if (horas === 20 && minutos === 30) {
        postarMensagemDiaria();
      }
    }, 60000); // checa a cada minuto
  }

  agendarMensagemDiaria();

  // Checar todos os sites a cada 10 minutos
  setInterval(postarFortnite, 600000);
  setInterval(postarLibertyCity, 600000);
  setInterval(postarRockstar, 600000);
});

client.login(process.env.TOKEN);
