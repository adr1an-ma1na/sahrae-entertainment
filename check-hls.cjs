const https = require('https');
https.get('https://live-hls-web-aje.getaj.net/AJE/index.m3u8', (res) => {
  console.log(res.statusCode);
});
