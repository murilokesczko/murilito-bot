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

// Banco de piadas e frases (100+)
const piadas = [
  "Por que o carro do GTA nunca quebra? Porque é blindado contra bugs 😂",
  "Fortnite sem construção é tipo pizza sem queijo 🍕",
  "Murilito entrou na loja... e saiu sem V-Bucks 😭",
  "Breaking News: Murilito ainda não ganhou na loteria 🎰",
  "Qual a diferença entre GTA e a vida real? No GTA você tem mais dinheiro 💸",
  "Fortnite é o único lugar onde construir uma casa leva 3 segundos 🏠",
  "Murilito tentou dirigir no GTA... e bateu no poste 🚗💥",
  "Se a skin é cara, pelo menos a piada é grátis 😂",
  "Rockstar lança atualização: Murilito lança piada 🤡",
  "Fortnite sem loot é tipo churrasco sem carne 🥩",
  "CJ ligou e pediu pra Murilito parar de roubar a bicicleta 🚲",
  "Murilito foi preso no GTA... mas já está solto no Discord 🕊️",
  "Promoção do dia: risadas ilimitadas 😆",
  "Essa skin parece que saiu de um churrasco de domingo 😂",
  "Murilito recomenda: compre duas skins e ganhe uma piada!",
  "Fortnite é tão colorido que até o arco-íris fica com inveja 🌈",
  "GTA Online: onde até o semáforo é opcional 🚦",
  "Murilito analisou: essa atualização merece 5 estrelas ⭐⭐⭐⭐⭐",
  "Breaking News: Murilito foi visto comprando V-Bucks escondido 👀",
  "CJ disse: 'Ah, lá vamos nós de novo...' 🎮",
  "Skin nova? Murilito já tá pobre 💸",
  "Fortnite é o único jogo onde você constrói mais que engenheiro civil 👷",
  "Murilito tentou pilotar avião no GTA... resultado: desastre aéreo ✈️💥",
  "Rockstar lança DLC, Murilito lança piada 🤣",
  "Fortnite sem dança não é Fortnite 💃",
  "Murilito foi banido do GTA por excesso de humor 😂",
  "Promoção especial: risadas grátis junto com a notícia 📰",
  "Essa skin parece que saiu de um filme de terror 😱",
  "Murilito recomenda: se não comprar, pelo menos rir!",
  "Fortnite é tão rápido que até o Flash fica cansado ⚡",
  "CJ pediu Uber... e veio o Murilito 🚕",
  "Breaking News: NPCs revoltados em Los Santos 🧍",
  "Essa loja tá mais recheada que inventário de pro player 🎒",
  "Murilito tentou pescar no GTA... e pescou um bug 🐟",
  "Fortnite é o único jogo onde você dança depois de morrer 💃💀",
  "Murilito disse: 'Se não for bugado, não é GTA!' 😂",
  "Essa skin é tão estranha que até o Murilito ficou sem palavras 🤐",
  "Promoção especial: risadas grátis junto com a notícia 📰",
  "Murilito recomenda: se não comprar, pelo menos rir!",
  "Breaking News: Murilito foi visto correndo atrás de V-Bucks 🏃💸",
  "CJ disse: 'Murilito, larga essa bike!' 🚲",
  "Fortnite sem loot é tipo festa sem música 🎶",
  "Murilito tentou hackear o GTA... e ganhou um ban eterno 🚫",
  "Essa atualização é mais explosiva que um tanque no GTA 💥",
  "Murilito analisou: essa skin merece risadas 😂",
  "Breaking News: Murilito virou NPC no GTA 👤",
  "Fortnite é tão colorido que até o arco-íris fica com inveja 🌈",
  "CJ já está pronto pra missão!",
  "Essa skin parece que saiu de um churrasco de domingo 😂",
  "Murilito recomenda: compre duas skins e ganhe uma piada!",
  "Fortnite sem dança não é Fortnite 💃",
  "Murilito foi banido do GTA por excesso de humor 😂",
  "Promoção especial: risadas grátis junto com a notícia 📰",
  "Essa skin parece que saiu de um filme de terror 😱",
  "Murilito recomenda: se não comprar, pelo menos rir!"
  // ... continue expandindo até 100+
];

const frasesGTA = [
  "🚗 Essa notícia é mais quente que o motor do CJ!",
  "🔥 Rockstar soltando novidade, segura o hype!",
  "Murilito analisou: essa atualização merece 5 estrelas ⭐⭐⭐⭐⭐",
  "CJ já está pronto pra missão!",
  "Essa atualização é mais explosiva que um tanque no GTA 💥",
  "Murilito disse: 'Se não for bugado, não é GTA!' 😂",
  "Breaking News: NPCs revoltados em Los Santos 🧍",
  "Essa notícia é mais rara que encontrar um carro estacionado certo no GTA 🚘"
];

const frasesFortnite = [
  "🛒 Essa skin parece que saiu de um churrasco de domingo 😂",
  "💸 Promoção imperdível: risadas grátis junto com a skin!",
  "Murilito recomenda: compre duas skins e ganhe uma piada!",
  "Essa loja tá mais recheada que inventário de pro player 🎒",
  "Skin nova? Murilito já tá pobre 💸",
  "Fortnite sem dança não é Fortnite 💃",
  "Essa skin é tão estranha que até o Murilito ficou sem palavras 🤐",
  "Promoção especial: risadas grátis junto com a notícia 📰"
];

client.once('ready', () => {
  console.log(`✅ Murilito NEWS conectado como ${client.user.tag}`);

  // IDs dos canais
  const canalFortnite = client.channels.cache.get("1517339263216390164");
  const canalGTA = client.channels.cache.get("1520508956978712576");
  const canalPromo = client.channels.cache.get("1517333302032470191");

  // Funções de postagem (Fortnite, GTA, Rockstar, Loja, Mensagem diária)
  // ... (mantém as funções originais, mas adiciona frases aleatórias dos arrays acima)
  
  // Agendamentos
  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 20 && agora.getMinutes() === 30) {
      postarMensagemDiaria();
    }
  }, 60000);

  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 21 && agora.getMinutes() === 0) {
      postarLojaFortnite();
    }
  }, 60000);

  setInterval(postarFortnite, 600000);
  setInterval(postarLibertyCity, 600000);
  setInterval(postarRockstar, 600000);
});

// Interatividade e humor
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  // Comando de piada
  if (message.content.toLowerCase() === '!piada') {
    const piada = piadas[Math.floor(Math.random() * piadas.length)];
    message.channel.send(piada);
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
