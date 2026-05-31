const https = require('https');

async function fetchContent(urlStr) {
  return new Promise((resolve) => {
    https.get(urlStr, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data.substring(0, 300))); // Just the top 300 chars
    });
  });
}

async function run() {
  console.log('vidsrc.to:', await fetchContent('https://vidsrc.to/embed/movie/278'));
  console.log('vidsrc.pm:', await fetchContent('https://vidsrc.pm/embed/movie?tmdb=278'));
  console.log('vidsrc.icu:', await fetchContent('https://vidsrc.icu/embed/movie/278'));
  console.log('vidsrc.su:', await fetchContent('https://vidsrc.su/embed/movie/278'));
}

run();
