// api/index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

// Telegram API configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_USERNAME = '@batchbotlog';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Cache for storing file information
let animeCache = [];
let lastUpdate = 0;

async function fetchChannelFiles() {
  try {
    const response = await axios.post(`${TELEGRAM_API}/getUpdates`, {
      offset: -100,
      limit: 100,
      timeout: 10
    });

    const messages = response.data.result.filter(msg => 
      msg.channel_post && 
      msg.channel_post.chat.username === CHANNEL_USERNAME.replace('@', '') &&
      msg.channel_post.document
    );

    animeCache = messages.map(post => ({
      message_id: post.channel_post.message_id,
      title: post.channel_post.document.file_name,
      file_id: post.channel_post.document.file_id,
      size: post.channel_post.document.file_size,
      mime_type: post.channel_post.document.mime_type,
      date: post.channel_post.date
    }));

    lastUpdate = Date.now();
  } catch (error) {
    console.error('Error fetching channel files:', error);
  }
}

// Endpoint to get all anime entries
app.get('/anime', async (req, res) => {
  // Refresh cache every 5 minutes
  if (Date.now() - lastUpdate > 300000) {
    await fetchChannelFiles();
  }
  
  res.json(animeCache);
});

// Endpoint to get direct file URL
app.get('/stream/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const fileInfo = await axios.get(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    
    if (fileInfo.data.ok) {
      const filePath = fileInfo.data.result.file_path;
      const directUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
      res.redirect(directUrl);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = app;
