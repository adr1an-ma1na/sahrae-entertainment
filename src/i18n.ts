/**
 * Interface language: English or Kiswahili.
 *
 * Keyed by the English text itself, so a string with no translation yet
 * simply stays in English rather than showing a key. Coverage starts with
 * what every viewer sees: navigation, the home screen, the player's
 * controls, Matchday, the remote and watch parties. Titles, synopses and
 * artist names come from their sources and are not translated.
 *
 * The Kiswahili here should be reviewed by a native speaker before it is
 * relied on; it is written plainly, in standard Kiswahili, avoiding Sheng.
 */

export type Lang = 'en' | 'sw';
const KEY = 'sahrae.lang.v1';

const SW: Record<string, string> = {
  // Navigation
  'Home': 'Nyumbani',
  'Search': 'Tafuta',
  'Movies': 'Filamu',
  'Series': 'Tamthilia',
  'Live TV': 'TV Mubashara',
  'Live Sports': 'Michezo Mubashara',
  'Flow Channels': 'Chaneli za Flow',
  'Music': 'Muziki',
  'Podcasts': 'Podikasti',
  'Radio': 'Redio',
  'Listen': 'Sikiliza',
  'Connect': 'Unganisha',
  'My List': 'Orodha Yangu',
  'Continue Watching': 'Endelea Kutazama',
  'Downloads': 'Vipakuliwa',
  // Home rows
  'Trending Now': 'Zinazovuma Sasa',
  'Popular Movies': 'Filamu Maarufu',
  'Popular Series': 'Tamthilia Maarufu',
  'Binge-Worthy Shows': 'Tamthilia za Kutazama Mfululizo',
  'Award-Winning Dramas': 'Drama Zilizoshinda Tuzo',
  'Sci-Fi Masterpieces': 'Kazi Bora za Sayansi ya Kubuni',
  'Top 10 Series Today': 'Tamthilia 10 Bora Leo',
  'Top 10 Trending Today': 'Kumi Bora Zinazovuma Leo',
  'Jump back in': 'Endelea ulipoachia',
  'Made in Kenya': 'Imetengenezwa Kenya',
  'African stories': 'Hadithi za Kiafrika',
  // Quick pick
  'What fits right now?': 'Nini kinatosha sasa hivi?',
  'Time you have': 'Muda ulio nao',
  'In the mood for': 'Unajisikia',
  'Light & funny': 'Ya kuchekesha',
  'Thrilling': 'Ya kusisimua',
  'Feel-good': 'Ya kufurahisha',
  'Mind-bending': 'Ya kufikirisha',
  'Scary': 'Ya kutisha',
  'Romantic': 'Ya mapenzi',
  'Family': 'Ya familia',
  'All night': 'Usiku mzima',
  // Taste
  'Your taste': 'Ladha yako',
  'Watch': 'Tazama',
  // Player
  'Play': 'Cheza',
  'Trailer': 'Kionjo',
  'Back': 'Rudi',
  'Hide': 'Ficha',
  'Not working?': 'Haifanyi kazi?',
  'Together': 'Pamoja',
  'Play now': 'Cheza sasa',
  'Cancel': 'Ghairi',
  'Choose your server': 'Chagua seva yako',
  // Matchday
  'Matchday': 'Siku ya Mechi',
  'Live Events': 'Matukio Mubashara',
  'Channels': 'Chaneli',
  'All': 'Zote',
  'Today': 'Leo',
  'Tomorrow': 'Kesho',
  'Live now': 'Mubashara sasa',
  'Watch live': 'Tazama mubashara',
  'Stream': 'Tazama',
  'Remind me': 'Nikumbushe',
  'Reminder set': 'Ukumbusho umewekwa',
  'Full prediction': 'Utabiri kamili',
  'Full time': 'Mwisho wa mchezo',
  'Draw': 'Sare',
  // Remote and parties
  'Use your phone as the remote': 'Tumia simu yako kama rimoti',
  'Control a TV': 'Dhibiti TV',
  'Connect to a different TV': 'Unganisha na TV nyingine',
  'Search on the TV': 'Tafuta kwenye TV',
  'Watch together': 'Tazama pamoja',
  'Invite': 'Alika',
  'Start together': 'Anzeni pamoja',
  'Say something': 'Sema kitu',
  'Leave the party': 'Ondoka kwenye kikundi',
  // Data Saver
  'Data Saver on': 'Kiokoa Data kimewashwa',
  'Data Saver off': 'Kiokoa Data kimezimwa',
  'Done': 'Imekamilika',
};

let lang: Lang = 'en';
try { const v = localStorage.getItem(KEY); if (v === 'sw' || v === 'en') lang = v; } catch { /* storage blocked: English */ }
try { if (typeof document !== 'undefined') document.documentElement.lang = lang; } catch { /* no document */ }

export const currentLang = () => lang;

/** The interface text in the viewer's language; English when there is no translation. */
export function t(english: string): string {
  return lang === 'sw' ? SW[english] ?? english : english;
}

/** Switch language. The app reloads, so every screen redraws in it at once. */
export function setLang(next: Lang) {
  try { localStorage.setItem(KEY, next); } catch { /* the reload still applies it for this visit */ }
  window.location.reload();
}

/** For tests: how many strings have a translation. */
export const swCoverage = () => Object.keys(SW).length;
