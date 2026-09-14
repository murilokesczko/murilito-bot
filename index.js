require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const Parser = require('rss-parser');
const axios = require('axios');
const parser = new Parser();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Piadas e frases
const piadas = [
  "Por que o carro do GTA nunca quebra? Porque é blindado contra bugs 😂",
  "Fortnite sem construção é tipo pizza sem queijo 🍕",
  "Murilito entrou na loja... e saiu sem V-Bucks 😭",
  "Breaking News: Murilito ainda não ganhou na loteria 🎰",
  "CJ disse: 'Ah, lá vamos nós de novo...' 🎮",
  "Essa skin parece que saiu de um churrasco de domingo 😂",
  "Murilito recomenda: compre duas skins e ganhe uma piada!"
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

client.once('ready', () => {
  console.log(`✅ Murilito NEWS conectado como ${client.user.tag}`);

  // IDs dos canais
  const canalFortnite = client.channels.cache.get("1517339263216390164");
  const canalGTA = client.channels.cache.get("1520508956978712576");
  const canalPromo = client.channels.cache.get("1517333302032470191");
  const canalEnquete = client.channels.cache.get("732400317282517043");

  // Mensagem de teste ao reiniciar
  canalFortnite?.send("🤖 Murilito reiniciou! Teste de postagem no canal Fortnite.");
  canalGTA?.send("🤖 Murilito reiniciou! Teste de postagem no canal GTA.");
  canalPromo?.send("🤖 Murilito reiniciou! Teste de postagem no canal Promoções.");
  canalEnquete?.send("🤖 Murilito reiniciou! Teste de postagem no canal Enquetes.");

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

  function postarMensagemDiaria() {
    if (canalPromo) {
      const embed = {
        title: "🎯 Apoie com o código TIOKHREBIS 🎯",
        description: "🛒 **Quando for comprar algo na loja do Fortnite, use o código: TIOKHREBIS**\n\nApoie o Tio Khrebis e fortaleça a comunidade!",
        color: 0x3498db,
        image: { url: "https://cdn.discordapp.com/attachments/1517333302032470191/1548861867429208105/Copilot_20260913_220355.png" }
      };
      canalPromo.send({ content: "@everyone Murilito lembra: apoiar nunca sai de moda 😎", embeds: [embed] });
    }
  }
  // Função para postar loja do Fortnite usando API oficial
  async function postarLojaFortnite() {
    if (canalPromo) {
      try {
        const { data } = await axios.get('https://fortnite-api.com/v2/shop/br');
        const itens = data.data.entries;

        for (const item of itens.slice(0, 5)) { // posta até 5 itens
          const nome = item.items[0].name;
          const preco = item.finalPrice;
          const imagem = item.items[0].images.icon;

          const frase = frasesFortnite[Math.floor(Math.random() * frasesFortnite.length)];

          const embed = {
            title: nome,
            description: `💰 Preço: ${preco} V-Bucks\n🛒 Use o código **TIOKHREBIS** na loja!`,
            color: 0x2ecc71,
            image: { url: imagem }
          };

          canalPromo.send({ content: "@everyone 🛍️ **Loja Fortnite Atualizada!**\n" + frase, embeds: [embed] });
        }
      } catch (err) { console.error("Erro ao buscar loja Fortnite:", err); }
    }
  }

  // Função para postar enquete da loja (aleatória) usando API oficial
  async function postarEnqueteLoja() {
    if (canalEnquete) {
      try {
        const { data } = await axios.get('https://fortnite-api.com/v2/shop/br');
        const itens = data.data.entries;

        // Sorteia 3 skins aleatórias
        const selecionados = [];
        while (selecionados.length < 3 && itens.length > 0) {
          const index = Math.floor(Math.random() * itens.length);
          selecionados.push(itens[index]);
          itens.splice(index, 1);
        }

        canalEnquete.send("📊 **Enquete da Loja Fortnite**\nVote na skin que você mais gostou!");

        for (const item of selecionados) {
          const nome = item.items[0].name;
          const preco = item.finalPrice;
          const imagem = item.items[0].images.icon;

          const embed = {
            title: nome,
            description: `💰 Preço: ${preco} V-Bucks\n🛒 Use o código **TIOKHREBIS** na loja!`,
            color: 0x9b59b6,
            image: { url: imagem }
          };

          const msg = await canalEnquete.send({ embeds: [embed] });
          await msg.react("🔥");
          await msg.react("👍");
          await msg.react("😂");
        }
      } catch (err) { console.error("Erro ao criar enquete da loja:", err); }
    }
  }

  // Agendamentos
  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 20 && agora.getMinutes() === 30) postarMensagemDiaria();
  }, 60000);

  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 21 && agora.getMinutes() === 0) postarLojaFortnite();
  }, 60000);

  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 19 && agora.getMinutes() === 0) postarEnqueteLoja();
  }, 60000);

  setInterval(postarFortnite, 600000);
  setInterval(postarLibertyCity, 600000);
  setInterval(postarRockstar, 600000);
}); // fecha client.once('ready')


// Interatividade e humor
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Comando de piada (aleatório)
  if (message.content.toLowerCase() === '!piada') {
    const piada = piadas[Math.floor(Math.random() * piadas.length)];
    message.channel.send(piada);
  }

  // Comando de enquete manual
  if (message.content.toLowerCase() === '!enquete') {
    try {
      const { data } = await axios.get('https://fortnite-api.com/v2/shop/br');
      const itens = data.data.entries;

      // Sorteia 3 skins aleatórias
      const selecionados = [];
      while (selecionados.length < 3 && itens.length > 0) {
        const index = Math.floor(Math.random() * itens.length);
        selecionados.push(itens[index]);
        itens.splice(index, 1);
      }

      await message.channel.send("📊 **Enquete da Loja Fortnite**\nVote na skin que você mais gostou!");

      for (const item of selecionados) {
        const nome = item.items[0].name;
        const preco = item.finalPrice;
        const imagem = item.items[0].images.icon;

        const embed = {
          title: nome,
          description: `💰 Preço: ${preco} V-Bucks\n🛒 Use o código **TIOKHREBIS** na loja!`,
          color: 0x9b59b6,
          image: { url: imagem }
        };

        const msg = await message.channel.send({ embeds: [embed] });
        await msg.react("🔥");
        await msg.react("👍");
        await msg.react("😂");
      }
    } catch (err) {
      console.error("Erro ao criar enquete manual:", err);
      message.channel.send("❌ Ocorreu um erro ao tentar criar a enquete.");
    }
  }

  // Resposta ao nome Murilito
  if (message.content.toLowerCase().includes('murilito')) {
    message.reply("👀 Chamou? Eu estava dormindo, mas já acordei!");
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
