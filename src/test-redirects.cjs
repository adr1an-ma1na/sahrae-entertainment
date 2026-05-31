const https = require('https');

async function test(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve(res.headers.location);
    });
  });
}

async function run() {
  console.log('xyz:', await test('https://vidsrc.xyz/embed/movie/278'));
  console.log('net:', await test('https://vidsrc.net/embed/movie?tmdb=278'));
  console.log('moviesapi:', await test('https://moviesapi.club/movie/278'));
  console.log('embed.smashy:', await test('https://embed.smashystream.com/playere.php?tmdb=278'));
}
run();
