import fs from 'fs';

const channels = [
  { name: 'Al Jazeera', handle: '@aljazeeraenglish' },
  { name: 'Sky News', handle: '@SkyNews' },
  { name: 'DW News', handle: '@dwnews' },
  { name: 'France 24', handle: '@France24_en' },
  { name: 'NBC News', handle: '@NBCNews' },
  { name: 'CBS News', handle: '@CBSNews' },
  { name: 'Reuters', handle: '@Reuters' },
  { name: 'EuroNews', handle: '@euronews' },
  { name: 'WION', handle: '@WION' },
  { name: 'CNA', handle: '@channelnewsasia' },
  { name: 'Arirang TV', handle: '@arirangtv' },
  { name: 'NASA TV', handle: '@NASA' },
  { name: 'LiveNOW FOX', handle: '@livenowfox' },
  { name: 'KTN News', handle: '@ktnnews' },
  { name: 'Citizen TV', handle: '@citizentvkenya' },
  { name: 'K24 TV', handle: '@K24TV' },
  { name: 'TRT World', handle: '@trtworld' },
  { name: 'NDTV', handle: '@NDTV' },
  { name: 'AfricaNews', handle: '@africanews' },
  { name: 'Global News', handle: '@globalnews' },
  { name: 'GB News', handle: '@GBNewsOnline' },
  { name: 'Firstpost', handle: '@Firstpost' },
  { name: 'The Sun', handle: '@thesun' },
  { name: 'Telegraph', handle: '@telegraph' },
  { name: 'Lofi Girl', handle: '@LofiGirl' }
];

async function getVideoIds() {
  const results = [];
  for (const ch of channels) {
    try {
      const res = await fetch(`https://www.youtube.com/${ch.handle}/live`);
      const text = await res.text();
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
  fs.writeFileSync('video_ids2.json', JSON.stringify(results, null, 2));
}

getVideoIds();
