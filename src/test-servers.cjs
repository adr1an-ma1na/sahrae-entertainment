const https = require('https');

const urls = [
  'https://vidsrc.me/embed/movie?tmdb=278',
  'https://vidsrc.in/embed/movie?tmdb=278', 
  'https://vidsrc.pm/embed/movie?tmdb=278',
  'https://vidsrc.net/embed/movie?tmdb=278',
  'https://vidsrc.xyz/embed/movie?tmdb=278',
  'https://player.smashy.stream/movie?tmdb=278',
  'https://2embed.cc/embed/278',
  'https://autoembed.to/movie/tmdb/278',
  'https://player.autoembed.cc/embed/movie/278',
  'https://vidsrc.top/embed/movie?tmdb=278',
  'https://multiembed.mov/?video_id=278&tmdb=1',
  'https://moviesapi.club/movie/278',
  'https://vidsrc.su/embed/movie/278',
  'https://embed.su/embed/movie/278',
  'https://movieapi.net/embed/movie/278',
  'https://vidlink.pro/movie/278',
  'https://vidsrc.icu/embed/movie/278',
  'https://vidsrc.to/embed/movie/278',
  'https://vidsrc.pro/embed/movie/278',
  'https://vidsrc.cc/v2/embed/movie/278',
  'https://smashystream.com/playere.php?tmdb=278',
  'https://embed.smashystream.com/playere.php?tmdb=278'

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
