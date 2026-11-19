// node --experimental-strip-types podplayer-check.mjs
// The podcast Now Playing (components/PodcastPlayer.tsx): its show notes
// (services/showNotes.ts), finding an episode's video on the show's own
// YouTube channel (services/videoShows.ts channelForShow, episodeVideo.ts).
import { parseNotes, chapterAt } from './src/services/showNotes.ts';
import { channelForShow, MATCH_SHOWS, VIDEO_SHOWS } from './src/services/videoShows.ts';
import { matchEpisodeVideo, decodeEntities } from './src/services/episodeVideo.ts';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

console.log('\nshow notes: text, links and times, never HTML');
const notes = parseNotes('<p>Senator Bernie Sanders joins.</p><p>00:00 Intro<br>12:45 Big money<br>1:02:03 The future</p><ul><li>Book: <a href="https://example.com/book">It&#39;s OK</a></li><li>bad <a href="javascript:alert(1)">link</a></li></ul><script>alert(1)</script><img src=x onerror=alert(1)>', 4000);
eq('paragraphs, line by line', notes.length, 6);
eq('first paragraph is plain text', notes[0].parts, [{ text: 'Senator Bernie Sanders joins.' }]);
eq('times become seeks', notes.slice(1, 4).map((b) => b.parts[0]), [{ text: '00:00', seek: 0 }, { text: '12:45', seek: 765 }, { text: '1:02:03', seek: 3723 }]);
eq('a web link kept, its text decoded', notes[4], { parts: [{ text: 'Book: ' }, { text: "It's OK", href: 'https://example.com/book' }], bullet: true });
eq('a script link is only text', notes[5].parts.every((p) => !p.href) && notes[5].parts.map((p) => p.text).join(''), 'bad link');
eq('no script, no image, no handler anywhere', JSON.stringify(notes).match(/alert|onerror|<img|<script/), null);
eq('a time past the end stays text ("9:30" in a 5 minute episode)', parseNotes('Recorded at 9:30', 300)[0].parts, [{ text: 'Recorded at 9:30' }]);
eq('a bare address becomes a link', parseNotes('More at https://www.doac.com/ now')[0].parts, [{ text: 'More at ' }, { text: 'doac.com', href: 'https://www.doac.com/' }, { text: ' now' }]);
eq('entities decoded', decodeEntities('Wasn&#39;t &amp; &quot;OK&quot; &#x2014;'), 'Wasn\'t & "OK" —');
eq('empty notes: nothing', parseNotes(''), []);
eq('the chapter playing', [chapterAt([{ start: 0, title: 'a' }, { start: 60, title: 'b' }, { start: 300, title: 'c' }], 120), chapterAt([], 5), chapterAt([{ start: 30, title: 'a' }], 10)], [1, -1, -1]);

console.log('\nwhich shows post on YouTube');
eq('Diary of a CEO, as Apple names it', channelForShow('The Diary Of A CEO with Steven Bartlett'), 'UCGq-a57w-aPwyi3pW7XLiHw');
eq('Joe Rogan', channelForShow('The Joe Rogan Experience'), 'UCzQUP1qoWDoEbmsQxvdjxgQ');
eq('Theo Von, by show or host', [channelForShow('This Past Weekend w/ Theo Von'), channelForShow('Theo Von')], ['UC5AQEUAwCh1sGDvkQtkDWUQ', 'UC5AQEUAwCh1sGDvkQtkDWUQ']);
eq('Mel Robbins and Jay Shetty', [channelForShow('The Mel Robbins Podcast'), channelForShow('On Purpose with Jay Shetty')], ['UCk2U-Oqn7RXf-ydPqfSxG5g', 'UCbV60AGIHKz2xIGvbk0LLvg']);
eq('an unknown show: none (a free search instead)', channelForShow('The Daily'), null);
eq('a short name does not match a longer show by accident', channelForShow('Hot'), null);
const ids = [...MATCH_SHOWS.map((s) => s.channelId), ...VIDEO_SHOWS.map((s) => s.channelId)];
eq('every channel id is a real-looking one, none twice', ids.every((id) => /^UC[\w-]{22}$/.test(id)) && new Set(ids).size === ids.length, true);

console.log('\nthe show\'s own upload of the same episode');
const day = 86_400_000, now = Date.parse('2026-11-19T06:00:00Z');
const ep = { title: 'Senator Bernie Sanders: Iran Wasn&#39;t Trump&#39;s Idea. Someone Else Pushed Him Into It!', artist: 'The Diary Of A CEO with Steven Bartlett', duration: 5461, uploaded: now };
const v = (title, duration, uploaded, id = title.slice(0, 11)) => ({ id, title, artist: 'The Diary Of A CEO', duration, uploaded });
eq('same title and length: found', matchEpisodeVideo(ep, [v("Senator Bernie Sanders: Iran Wasn't Trump's Idea. Someone Else Pushed Him Into It!", 5520, now)])?.track.duration, 5520);
eq('a Short of it: not', matchEpisodeVideo(ep, [v('BERNIE ON IRAN', 58, now)]), null);
const retitled = v('Bernie Sanders: They Are Lying To You About Democracy!', 5440, now + 3 * 3_600_000);
eq('titled for YouTube: not by title alone', matchEpisodeVideo(ep, [retitled]), null);
eq('...but yes from the show\'s own channel, same length, same day', matchEpisodeVideo(ep, [retitled], { sameChannel: true })?.track.id, retitled.id);
const other = v('Katt Williams: They Tied Me To A Pole And Beat Me Bloody Every Week!', 5470, now - 2 * day, 'katt');
eq('...and of two that week at the same length, the one with this guest', matchEpisodeVideo(ep, [other, retitled], { sameChannel: true })?.track.id, retitled.id);
eq("...never the other guest's", matchEpisodeVideo(ep, [other], { sameChannel: true }), null);
eq('...not an older episode of the same length', matchEpisodeVideo(ep, [{ ...retitled, uploaded: now - 20 * day }], { sameChannel: true }), null);
eq('...not a compilation of another length', matchEpisodeVideo(ep, [{ ...retitled, duration: 4200 }], { sameChannel: true }), null);

console.log('\nthe player');
const pp = readFileSync('src/components/PodcastPlayer.tsx', 'utf8');
const mp = readFileSync('src/components/MusicPlayer.tsx', 'utf8');
eq('podcasts open their own player, music keeps its own', mp.includes('{expanded && isPodcast && <PodcastPlayer') && mp.includes('{expanded && !isPodcast && ('), true);
eq('no lyrics for an episode', [/Lyrics/.test(pp), mp.includes("if (isPodcast) { setLyricsState('none'); return; }")], [false, true]);
eq('notes are never set as HTML', /dangerouslySetInnerHTML/.test(pp), false);
eq('links leave safely', pp.includes('rel="noopener noreferrer nofollow"'), true);
eq('Watch starts the video at the same second, Listen goes back to the file', pp.includes('pending.current = { id: t.id, pos: position, tries: 0, at: Date.now() };') && pp.includes('if (!isPlaying || buffering || !(duration > 0)) return;') && pp.includes('audioEpisodeFor(ep.id)'), true);
const finder = readFileSync('src/services/episodeVideoFind.ts', 'utf8');
eq('the 100-unit official search is never spent finding a video', /ytmusic\.searchVideos\(|ytDataApi\.search\(/.test(finder), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
