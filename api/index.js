const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(cors());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const ANILIST_API = 'https://graphql.anilist.co';


let animeCache = [];
let lastUpdate = 0;


async function fetchTelegramAnime() {
  try {
    const response = await axios.post(`${TELEGRAM_API}/getUpdates`, {
      offset: -100,
      limit: 100,
      timeout: 10,
    });

    const animeFiles = response.data.result
      .filter((msg) => msg.channel_post?.document?.file_name?.endsWith('.mkv'))
      .map((msg) => ({
        file_id: msg.channel_post.document.file_id,
        title: msg.channel_post.document.file_name.replace('.mkv', ''),
        size: msg.channel_post.document.file_size,
        date: msg.channel_post.date,
      }));

    animeCache = animeFiles;
    lastUpdate = Date.now();
  } catch (error) {
    console.error('Error fetching Telegram anime:', error);
  }
}


async function fetchAniListInfo(title) {
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          title {
            romaji
            english
            native
          }
          description
          coverImage {
            large
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_API, {
      query,
      variables: { search: title },
    });

    return response.data.data.Media;
  } catch (error) {
    console.error('Error fetching AniList info:', error);
    return null;
  }
}


async function getStreamUrl(fileId) {
  try {
    const fileInfo = await axios.get(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    if (fileInfo.data.ok) {
      return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.data.result.file_path}`;
    }
    return null;
  } catch (error) {
    console.error('Error getting stream URL:', error);
    return null;
  }
}


app.get('/anime', async (req, res) => {
  if (Date.now() - lastUpdate > 300000) {
    await fetchTelegramAnime();
  }

  const animeWithInfo = await Promise.all(
    animeCache.map(async (anime) => {
      const info = await fetchAniListInfo(anime.title);
      return { ...anime, info };
    })
  );

  res.json(animeWithInfo);
});


app.get('/recent', async (req, res) => {
  if (Date.now() - lastUpdate > 300000) {
    await fetchTelegramAnime();
  }

  const recentAnime = animeCache
    .sort((a, b) => b.date - a.date)
    .slice(0, 10);

  const recentWithInfo = await Promise.all(
    recentAnime.map(async (anime) => {
      const info = await fetchAniListInfo(anime.title);
      return { ...anime, info };
    })
  );

  res.json(recentWithInfo);
});


app.get('/stream/:fileId', async (req, res) => {
  const fileId = req.params.fileId;
  const streamUrl = await getStreamUrl(fileId);

  if (streamUrl) {
    res.redirect(streamUrl);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});


app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  if (Date.now() - lastUpdate > 300000) {
    await fetchTelegramAnime();
  }

  const filteredAnime = animeCache.filter((anime) =>
    anime.title.toLowerCase().includes(query.toLowerCase())
  );

  const animeWithInfo = await Promise.all(
    filteredAnime.map(async (anime) => {
      const info = await fetchAniListInfo(anime.title);
      return { ...anime, info };
    })
  );

  res.json(animeWithInfo);
});

module.exports = app;
