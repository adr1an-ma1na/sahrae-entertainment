import fs from 'fs';

const channels = [
  { name: 'Al Jazeera', handle: '@aljazeeraenglish' },
  { name: 'Sky News', handle: '@SkyNews' },
  { name: 'DW News', handle: '@dwnews' },
  { name: 'France 24', handle: '@France24_en' },
  { name: 'NBC News', handle: '@NBCNews' },
  { name: 'CBS News', handle: '@CBSNews' },
  { name: 'ABC News', handle: '@NewsOnABC' },
  { name: 'Reuters', handle: '@Reuters' },
  { name: 'EuroNews', handle: '@euronews' },
  { name: 'WION', handle: '@WION' },
  { name: 'CNA', handle: '@channelnewsasia' },
  { name: 'Arirang TV', handle: '@arirangtv' },
  { name: 'Bloomberg', handle: '@bloomberg' },
  { name: 'NASA TV', handle: '@NASA' },
  { name: 'LiveNOW FOX', handle: '@livenowfox' },
  { name: 'KTN News', handle: '@ktnnews' },
  { name: 'Citizen TV', handle: '@citizentvkenya' },
  { name: 'NTV Kenya', handle: '@ntvkenya' },
  { name: 'K24 TV', handle: '@K24TV' },
  { name: 'TRT World', handle: '@trtworld' },
  { name: 'NDTV', handle: '@NDTV' },
  { name: 'AfricaNews', handle: '@africanews' },
  { name: 'SABC News', handle: '@sabcnews' },
  { name: 'Channels TV', handle: '@channelsweb' },
  { name: 'Global News', handle: '@globalnews' },
  { name: 'GB News', handle: '@GBNewsOnline' },
  { name: 'Firstpost', handle: '@Firstpost' },
  { name: 'The Sun', handle: '@thesun' },
  { name: 'Telegraph', handle: '@telegraph' },
  { name: 'Lofi Girl', handle: '@LofiGirl' }
];

async function getChannelIds() {
  const results = [];
  for (const ch of channels) {
    try {
      const res = await fetch(`https://www.youtube.com/${ch.handle}`);
      const text = await res.text();
      const match = text.match(/"channelId":"(UC[^"]+)"/);
      if (match) {
        results.push({ ...ch, channelId: match[1] });
        console.log(`Found ${ch.name}: ${match[1]}`);
      } else {
        console.log(`Not found for ${ch.name}`);
      }
    } catch (e) {
      console.log(`Error for ${ch.name}`);
    }
  }
  fs.writeFileSync('channel_ids.json', JSON.stringify(results, null, 2));
}

getChannelIds();
