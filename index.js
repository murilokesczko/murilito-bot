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

// IDs fixos dos canais
const ID_LOJA = "1517333302032470191";
const ID_FORTNITE = "1517339263216390164";
const ID_GTA = "1520508956978712576";

// Lista de 100+ piadas/frases
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
  "O Trevor do GTA é mais maluco que o Murilito sem café ☕",
  "Epic Games lança skin nova, mas cadê meus V-Bucks? 💸",
  "CJ corre mais que internet ruim 🏃",
  "Murilito tentou construir no Fortnite... e fez uma cabana torta 🏚️",
  "Rockstar anuncia DLC e o Murilito já vendeu o carro pra comprar 💰",
  "Skin do Peely é a única que nunca amadurece 🍌",
  "Fortnite sem loot é igual churrasco sem carne 🥩",
  "CJ nunca paga ônibus, só rouba 🚍",
  "Murilito NEWS: GTA 6 confirmado em 2099 📅",
  "Epic Games: 'Skin exclusiva'... Murilito: 'Cadê meu cartão?' 💳",
  "CJ pula muro melhor que atleta olímpico 🏅",
  "Fortnite é o único lugar que você constrói uma mansão em 10 segundos 🏠",
  "Murilito comprou skin rara... e perdeu a conta 😂",
  "Rockstar demora tanto que até o Peely já virou purê 🍌",
  "CJ nunca dorme, só corre atrás de missão 🌙",
  "Fortnite sem dança não é Fortnite 💃",
  "Murilito NEWS: GTA 6 vai ter CJ aposentado 👴",
  "Epic Games lança skin nova todo dia, mas nunca lança desconto 😭",
  "CJ sempre diz: 'Ah, lá vamos nós de novo...' 🔄",
  "Fortnite é tipo escola: se não estudar, perde a partida 📚",
  "Murilito tentou pilotar avião no GTA... e caiu na primeira curva ✈️",
  "Skin rara é igual nota de 200 reais: ninguém nunca viu 💵",
  "CJ corre mais que o Sonic 🦔",
  "Fortnite sem amigos é só sofrimento 😢",
  "Murilito comprou skin e esqueceu de comer 🍔",
  "Rockstar anuncia GTA 6... mas só em 2050 ⏳",
  "CJ nunca usa GPS, só segue o mapa 🗺️",
  "Fortnite é tipo festa: todo mundo dança, mas só um ganha 🎉",
  "Murilito NEWS: Peely eleito presidente do Fortnite 🏛️",
  "Epic Games lança skin de banana... e o Murilito já comprou 🍌",
  "CJ nunca paga pedágio 🚧",
  "Fortnite sem loot é igual geladeira vazia 🥶",
  "Murilito comprou skin rara... e esqueceu de pagar a luz 💡",
  "Rockstar demora tanto que até o Trevor já ficou calmo 😇",
  "CJ nunca anda de bicicleta, só rouba 🚲",
  "Fortnite é tipo novela: todo dia tem drama 📺",
  "Murilito NEWS: GTA 6 vai ter skin do Peely 🍌",
  "Epic Games lança skin nova... e o Murilito já tá sem dinheiro 💸",
  "CJ nunca usa Uber 🚕",
  "Fortnite sem construção é igual Lego sem peças 🧱",
  "Murilito comprou skin rara... e esqueceu de pagar o aluguel 🏠",
  "Rockstar anuncia GTA 6... mas só em Marte 🚀",
  "CJ nunca usa celular 📱",
  "Fortnite é tipo carnaval: todo mundo fantasiado 🎭",
  "Murilito NEWS: Peely abre churrascaria 🍌🥩",
  "Epic Games lança skin nova... e o Murilito já tá chorando 😭",
  "CJ nunca usa banco, só rouba 💰",
  "Fortnite sem loot é igual festa sem comida 🎂",
  "Murilito comprou skin rara... e esqueceu de pagar internet 🌐",
  "Rockstar demora tanto que até o CJ já virou avô 👴",
  "CJ nunca usa carro alugado 🚗",
  "Fortnite é tipo balada: todo mundo dança 💃",
  "Murilito NEWS: GTA 6 vai ter skin do Murilito 😂",
  "Epic Games lança skin nova... e o Murilito já tá vendendo rim 🩺",
  "CJ nunca usa ônibus escolar 🚌",
  "Fortnite sem loot é igual jogo sem graça 😒",
  "Murilito comprou skin rara... e esqueceu de pagar água 🚰",
  "Rockstar anuncia GTA 6... mas só em 3000 🕰️",
  "CJ nunca usa moto emprestada 🏍️",
  "Fortnite é tipo circo: todo mundo faz palhaçada 🤡",
  "Murilito NEWS: Peely abre academia 🍌💪",
  "Epic Games lança skin nova... e o Murilito já tá sem almoço 🍽️",
  "CJ nunca usa táxi 🚖",
  "Fortnite sem loot é igual casa sem teto 🏚️",
  "Murilito comprou skin rara... e esqueceu de pagar telefone 📞",
  "Rockstar demora tanto que até o Peely já virou suco 🍹",
  "CJ nunca usa trem 🚆",
  "Fortnite é tipo show: todo mundo dança 🎤",
  "Murilito NEWS: GTA 6 vai ter skin do CJ 👊",
  "Epic Games lança skin nova... e o Murilito já tá sem jantar 🍲",
  "CJ nunca usa avião ✈️",
  "Fortnite sem loot é igual festa sem música 🎶",
  "Murilito comprou skin rara... e esqueceu de pagar gás 🔥",
  "Rockstar anuncia GTA 6... mas só em 4000 📅",
  "CJ nunca usa barco 🚤",
  "Fortnite é tipo jogo de tabuleiro: todo mundo joga 🎲",
  "Murilito NEWS: Peely abre pizzaria 🍌🍕",
  "Epic Games lança skin nova... e o Murilito já tá sem café ☕",
  "CJ nunca usa helicóptero 🚁",
  "Fortnite sem loot é igual escola sem professor 👨‍🏫",
  "Murilito comprou skin rara... e esqueceu de pagar condomínio 🏢",
  "Rockstar demora tanto que até o Trevor já virou santo 🙏",
  "CJ nunca usa cavalo 🐴",
  "Fortnite é tipo reality show: todo mundo assiste 📺",
  "Murilito NEWS: GTA 6 vai ter skin do Trevor 🔥",
  "Epic Games lança skin nova... e o Murilito já tá sem energia ⚡",
  "CJ nunca usa patinete 🛴",
  "Fortnite sem loot é igual festa sem convidados 🎉",
  "Murilito comprou skin rara... e esqueceu de pagar Netflix 📽️",
  "Rockstar anuncia GTA 6... mas só em 5000 🕰️",
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

// Funções de postagem
async function postarFortnite(channel) {
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
    channel.send({ content: "@everyone " + frase, embeds: [embed] });
  } catch (err) { console.error('Erro ao buscar Fortnite:', err); }
}

async function postarLibertyCity(channel) {
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
    channel.send({ content: "@everyone " + frase, embeds: [embed] });
  } catch (err) { console.error('Erro ao buscar LibertyCity:', err); }
}

async function postarRockstar(channel) {
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
    channel.send({ content: "@everyone " + frase, embeds: [embed] });
  } catch (err) { console.error('Erro ao buscar Rockstar:', err); }
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
