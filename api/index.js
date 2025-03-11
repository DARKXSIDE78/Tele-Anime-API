// api/index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const NodeCache = require('node-cache');

dotenv.config();
const app = express();
app.use(cors());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const ANILIST_API = 'https://graphql.anilist.co';

// Cache for 5 minutes
const cache = new NodeCache({ stdTTL: 300 });

// Fetch anime from Telegram channel
async function fetchTelegramAnime() {
  try {
    const response = await axios.post(`${TELEGRAM_API}/getUpdates`, {
      offset: -100,
      limit: 100,
      timeout: 10,
    });

    return response.data.result
      .filter((msg) => msg.channel_post?.document?.file_name?.endsWith('.mkv'))
      .map((msg) => ({
        file_id: msg.channel_post.document.file_id,
        title: msg.channel_post.document.file_name.replace('.mkv', ''),
        size: msg.channel_post.document.file_size,
        date: msg.channel_post.date,
      }));
  } catch (error) {
    console.error('Error fetching Telegram anime:', error);
    return [];
  }
}

// Fetch anime info from AniList
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

// Get direct streaming URL from Telegram
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

// Endpoint: Get all anime with AniList info
app.get('/anime', async (req, res) => {
  try {
    const cachedAnime = cache.get('anime');
    if (cachedAnime) {
      return res.json(cachedAnime);
    }

    const animeFiles = await fetchTelegramAnime();
    const animeWithInfo = await Promise.all(
      animeFiles.map(async (anime) => {
        const info = await fetchAniListInfo(anime.title);
        return { ...anime, info };
      })
    );

    cache.set('anime', animeWithInfo);
    res.json(animeWithInfo);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint: Get recently added anime
app.get('/recent', async (req, res) => {
  try {
    const cachedRecent = cache.get('recent');
    if (cachedRecent) {
      return res.json(cachedRecent);
    }

    const animeFiles = await fetchTelegramAnime();
    const recentAnime = animeFiles
      .sort((a, b) => b.date - a.date)
      .slice(0, 10);

    const recentWithInfo = await Promise.all(
      recentAnime.map(async (anime) => {
        const info = await fetchAniListInfo(anime.title);
        return { ...anime, info };
      })
    );

    cache.set('recent', recentWithInfo);
    res.json(recentWithInfo);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint: Stream anime by file ID
app.get('/stream/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const streamUrl = await getStreamUrl(fileId);

    if (streamUrl) {
      res.redirect(streamUrl);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint: Search anime by title
app.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const cachedAnime = cache.get('anime') || [];
    const filteredAnime = cachedAnime.filter((anime) =>
      anime.title.toLowerCase().includes(query.toLowerCase())
    );

    res.json(filteredAnime);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;
