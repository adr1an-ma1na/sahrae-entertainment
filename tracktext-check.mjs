/**
 * Track text cleaning tests.
 *
 * The first block are the literal strings visible on the Music home before this
 * fix. The later blocks are the cases where cleaning must NOT happen — a wrong
 * split puts a song title in the artist slot, which is worse than leaving a long
 * title alone.
 *
 * Run: node --experimental-strip-types tracktext-check.mjs
 */
const { decodeEntities, cleanArtist, cleanTrackText } = await import('./src/services/trackText.ts');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const t = (title, artist) => cleanTrackText(title, artist);

console.log('\nstrings seen on the Music home');
eq('escaped apostrophe', t('T.I. - LET &#39;EM KNOW (Official Video)', 'TIVEVO'), { title: "LET 'EM KNOW", artist: 'T.I.' });
eq('VEVO channel + label', t('Rema - TEA (Official Music Video)', 'RemaVEVO'), { title: 'TEA', artist: 'Rema' });
eq('featured artists kept in the artist line', t('Diamond Platnumz ft Jux - JOY (Ikweji) Official Music Video', 'Diamond Platnumz'), { title: 'JOY (Ikweji)', artist: 'Diamond Platnumz ft Jux' });
eq('multiple artists on the left', t('Davido, Mayorkun, FOLA - B4 B4 (Official Video)', 'DavidoVEVO'), { title: 'B4 B4', artist: 'Davido, Mayorkun, FOLA' });
eq('square-bracket label', t('Burna Boy - Change Your Mind (feat. Shaboozey) [Official Video]', 'Burna Boy'), { title: 'Change Your Mind (feat. Shaboozey)', artist: 'Burna Boy' });

console.log('\nentities');
eq('&amp;', decodeEntities('Simon &amp; Garfunkel'), 'Simon & Garfunkel');
eq('&quot;', decodeEntities('&quot;Hello&quot;'), '"Hello"');
eq('hex entity', decodeEntities('It&#x27;s'), "It's");
eq('unknown entity left alone', decodeEntities('a &madeup; b'), 'a &madeup; b');

console.log('\nartists');
eq('- Topic', cleanArtist('Burna Boy - Topic'), 'Burna Boy');
eq('VEVO suffix', cleanArtist('DavidoVEVO'), 'Davido');
eq('empty', cleanArtist(''), 'Unknown Artist');
eq('"Official" glued to the name', cleanArtist('LISAOfficial'), 'LISA');
eq('  which then allows the split', t('LISA - SaWaDiKa', 'LISAOfficial'), { title: 'SaWaDiKa', artist: 'LISA' });

console.log('\npromotional tails');
// Artist comes back in the channel's casing, not the title's shouting caps.
eq('Skiza ringback code', t('ROSE MUHANDO - FUNGA MKANDA(Official Video). SMS SKIZA 69815', 'Rose Muhando Official'), { title: 'FUNGA MKANDA', artist: 'Rose Muhando' });
eq('Skiza with "tune" and a dial code', t('Kapitani - Mimi (Official Visualizer) Skiza Tune *811*123#', 'Kapitani'), { title: 'Mimi', artist: 'Kapitani' });
eq('SEO pipe padding', t('My Game - Ravinder Grewal | New Punjabi Songs 2026 | Latest Punjabi Songs 2026', 'Ravinder Grewal'), { title: 'My Game - Ravinder Grewal', artist: 'Ravinder Grewal' });
eq('a real "Song | Artist" title is kept', t('Pardon | Burna Boy & Stromae', 'Burna Boy'), { title: 'Pardon | Burna Boy & Stromae', artist: 'Burna Boy' });
eq('"Skiza" as a real song title is untouched', t('Skiza', 'Nyashinski'), { title: 'Skiza', artist: 'Nyashinski' });

console.log('\nlabels mixed with real information');
eq('label and featured artist in one bracket', t('UKINING’INIA ( Official video ft Fanta )', 'Mbosso'), { title: 'UKINING’INIA (ft Fanta)', artist: 'Mbosso' });
eq('trailing label with a production tag', t('AICT Tumaini Choir - Bwana Wangu Official Video MM7', 'AICT Tumaini Choir'), { title: 'Bwana Wangu', artist: 'AICT Tumaini Choir' });
eq('a real last word after a label is kept', t('Calm Down (Official Video) Remix', 'Rema'), { title: 'Calm Down Remix', artist: 'Rema' });
eq('bracket with no label is untouched', t('JOY (Ikweji)', 'Diamond Platnumz'), { title: 'JOY (Ikweji)', artist: 'Diamond Platnumz' });

console.log('\nmeaningful parentheticals survive');
eq('(Remix)', t('Calm Down (Remix) (Official Video)', 'Rema'), { title: 'Calm Down (Remix)', artist: 'Rema' });
eq('(Live)', t('Essence (Live)', 'Wizkid'), { title: 'Essence (Live)', artist: 'Wizkid' });
eq('(Acoustic)', t('Ye (Acoustic)', 'Burna Boy'), { title: 'Ye (Acoustic)', artist: 'Burna Boy' });
eq('stacked labels', t('Water (Official Video) [4K]', 'Tyla'), { title: 'Water', artist: 'Tyla' });

console.log('\nno split when the left side is not the artist');
eq('label channel, not the artist', t('Twenty One Pilots - Stressed Out', 'Fueled By Ramen'), { title: 'Twenty One Pilots - Stressed Out', artist: 'Fueled By Ramen' });
eq('hyphen inside a real title', t('Not Afraid - Part 2', 'Eminem'), { title: 'Not Afraid - Part 2', artist: 'Eminem' });
eq('podcast episode numbering', t('Episode 212 - The Future of Money', 'The Daily Show'), { title: 'Episode 212 - The Future of Money', artist: 'The Daily Show' });

console.log('\ntitles that are nothing but labels are not emptied');
eq('bare label title keeps something', t('Official Video', 'Some Artist').title.length > 0, true);
eq('whitespace normalised', t('  Essence   (Official  Audio) ', 'Wizkid'), { title: 'Essence', artist: 'Wizkid' });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
