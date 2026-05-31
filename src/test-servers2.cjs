const https = require('https');

const urls = [
  'https://vidsrc.pm/embed/movie?tmdb=278',
  'https://vidsrc.pm/embed/tv?tmdb=1399&season=1&episode=1',
  'https://vidsrc.to/embed/movie/278',
  'https://vidsrc.to/embed/tv/1399/1/1',
  'https://vidsrc.xyz/embed/movie/278',
  'https://vidsrc.xyz/embed/tv/1399/1/1',
  'https://vidsrc.icu/embed/movie/278',
  'https://vidsrc.icu/embed/tv/1399/1/1',
  'https://vidsrc.me/embed/movie?tmdb=278',
  'https://vidsrc.me/embed/tv?tmdb=1399&season=1&episode=1',
  'https://multiembed.mov/direct/movie.php?video_id=278&tmdb=1',
  'https://moviesapi.club/movie/278'
];

async function checkUrl(urlStr) {
  return new Promise((resolve) => {
    const req = https.get(urlStr, { timeout: 3000 }, (res) => {
      resolve({ url: urlStr, status: res.statusCode });
      res.on('data', () => {});
      res.on('end', () => {});
    });
    
    req.on('error', (err) => resolve({ url: urlStr, status: 'Error: ' + err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url: urlStr, status: 'Timeout' });
    });
  });
}

async function run() {
  const results = await Promise.all(urls.map(checkUrl));
  console.log(JSON.stringify(results, null, 2));
}

run();
