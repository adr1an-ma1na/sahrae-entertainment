const https = require('https');
https.get('https://www.youtube.com/feeds/videos.xml?channel_id=UCfiwzLy-8yKzIbsmZTzxDgw', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log(data));
})
