import fs from 'fs';

const channels = [
  { name: 'Al Jazeera', url: 'https://www.youtube.com/embed/live_stream?channel=UCfiwzLy-8yKzIbsmZTzxDgw' },
  { name: 'Sky News', url: 'https://www.youtube.com/embed/live_stream?channel=UCkFclpi8U9VJjfxLYoms7Aw' },
  { name: 'DW News', url: 'https://www.youtube.com/embed/live_stream?channel=UCbbS1GE942k3UVqpLklyhIA' },
  { name: 'France 24', url: 'https://www.youtube.com/embed/live_stream?channel=UCCCPCZNChQdGa9EkATeye4g' },
  { name: 'NBC News', url: 'https://www.youtube.com/embed/live_stream?channel=UChDKyKQ59fYz3JO2fl0Z6sg' },
  { name: 'CBS News', url: 'https://www.youtube.com/embed/live_stream?channel=UC-SJ6nODDmufqBzPBwCvYvQ' },
  { name: 'Reuters', url: 'https://www.youtube.com/embed/live_stream?channel=UChqUTb7kYRX8-EiaN3XFrSQ' },
  { name: 'EuroNews', url: 'https://www.youtube.com/embed/live_stream?channel=UCSrZ3UV4jOidv8ppoVuvW9Q' },
  { name: 'WION', url: 'https://www.youtube.com/embed/live_stream?channel=UC_gUM8rL-Lrg6O3adPW9K1g' },
  { name: 'CNA', url: 'https://www.youtube.com/embed/live_stream?channel=UC83jt4dlz1Gjl58fzQrrKZg' },
  { name: 'Arirang TV', url: 'https://www.youtube.com/embed/live_stream?channel=UCCW7Z4RTTQoFix1dvn0D3LA' },
  { name: 'NASA TV', url: 'https://www.youtube.com/embed/live_stream?channel=UC9SM7V7J1pAhPabOUST01fw' },
  { name: 'LiveNOW FOX', url: 'https://www.youtube.com/embed/live_stream?channel=UCDiPds0v60wueil5B8w3fPQ' },
  { name: 'KTN News', url: 'https://www.youtube.com/embed/live_stream?channel=UCYViuO63Wp4IlwKWv6uNKig' },
  { name: 'Citizen TV', url: 'https://www.youtube.com/embed/live_stream?channel=UChBQgieUidXV1CmDxSdRm3g' },
  { name: 'K24 TV', url: 'https://www.youtube.com/embed/live_stream?channel=UCt3SE-Mvs3WwP7UW-PiFdqQ' },
  { name: 'TRT World', url: 'https://www.youtube.com/embed/live_stream?channel=UCnyCrv8b7bu0oWFXGyHaPzg' },
  { name: 'NDTV', url: 'https://www.youtube.com/embed/live_stream?channel=UCXBD5iG5cr4ZYZ99K-fmDHg' },
  { name: 'AfricaNews', url: 'https://www.youtube.com/embed/live_stream?channel=UC25EuGAePOPvPrUA5cmu3dQ' },
  { name: 'Global News', url: 'https://www.youtube.com/embed/live_stream?channel=UChLtXXpo4Ge1ReTEboVvTDg' },
  { name: 'GB News', url: 'https://www.youtube.com/embed/live_stream?channel=UC0vn8ISa4LKMunLbzaXLnOQ' },
  { name: 'Firstpost', url: 'https://www.youtube.com/embed/live_stream?channel=UCef1-8eOpJgud7szVPlZQAQ' },
  { name: 'The Sun', url: 'https://www.youtube.com/embed/live_stream?channel=UCxVoBlRQHWr-GKiAH0zMSCg' },
  { name: 'Telegraph', url: 'https://www.youtube.com/embed/live_stream?channel=UCZwQE6syN6bBft33STSo0uw' },
  { name: 'Lofi Girl', url: 'https://www.youtube.com/embed/live_stream?channel=UCc5afI6TobiZjRke2sYBDPA' }
];

async function getVideoIds() {
  const results = [];
  for (const ch of channels) {
    try {
      const res = await fetch(ch.url);
      const text = await res.text();
      // Look for the canonical URL which contains the video ID
      const match = text.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)">/);
      if (match) {
        console.log(`Found ${ch.name}: ${match[1]}`);
        results.push({ name: ch.name, videoId: match[1] });
      } else {
        console.log(`Not found for ${ch.name}`);
      }
    } catch (e) {
      console.log(`Error for ${ch.name}`);
    }
  }
  fs.writeFileSync('video_ids.json', JSON.stringify(results, null, 2));
}

getVideoIds();
