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
  'Sports': 'Michezo',
  'Films, series, actors, genres': 'Filamu, tamthilia, waigizaji, aina',
  'Clear search': 'Futa utafutaji',
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
  // Sign in
  'Sign in': 'Ingia',
  'Create your account': 'Fungua akaunti yako',
  'Reset your password': 'Badilisha nenosiri lako',
  'Create account': 'Fungua akaunti',
  'Send reset link': 'Tuma kiungo',
  'Everything you watch.': 'Kila unachotazama.',
  'One app.': 'Programu moja.',
  'Films, series, live football and every big match, news channels, music and podcasts. On your phone, laptop and TV.': 'Filamu, tamthilia, kandanda mubashara na kila mechi kubwa, chaneli za habari, muziki na podikasti. Kwenye simu, kompyuta na TV yako.',
  'Movies and series': 'Filamu na tamthilia',
  'Live sport': 'Michezo mubashara',
  'Music and podcasts': 'Muziki na podikasti',
  'Welcome back. Sign in to keep watching.': 'Karibu tena. Ingia uendelee kutazama.',
  'It takes a minute. Your lists and progress follow you to every device.': 'Inachukua dakika moja. Orodha zako na ulipofikia vinakufuata kwenye kila kifaa.',
  'Enter your account email and we will send you a link.': 'Andika barua pepe ya akaunti yako tukutumie kiungo.',
  'Your name': 'Jina lako',
  'Email': 'Barua pepe',
  'Password': 'Nenosiri',
  'Password (6 or more characters)': 'Nenosiri (herufi 6 au zaidi)',
  'Show password': 'Onyesha nenosiri',
  'Hide password': 'Ficha nenosiri',
  'Forgot password?': 'Umesahau nenosiri?',
  'Please wait': 'Subiri kidogo',
  'New to Sahrae?': 'Mgeni kwenye Sahrae?',
  'Create an account': 'Fungua akaunti',
  'Already have an account?': 'Una akaunti tayari?',
  'Remembered it?': 'Umekumbuka?',
  'That email and password do not match. Check them, or reset your password.': 'Barua pepe na nenosiri havilingani. Viangalie, au badilisha nenosiri.',
  'There is already an account with this email. Sign in instead.': 'Kuna akaunti tayari yenye barua pepe hii. Ingia badala yake.',
  'Confirm your email first: open the link we sent you, then sign in.': 'Thibitisha barua pepe yako kwanza: fungua kiungo tulichokutumia, kisha ingia.',
  'Too many tries. Wait a minute, then try again.': 'Umejaribu mara nyingi. Subiri dakika moja, kisha ujaribu tena.',
  'Use a password of at least 6 characters.': 'Tumia nenosiri lenye herufi 6 au zaidi.',
  'That email address does not look right.': 'Barua pepe hiyo haionekani sawa.',
  'No connection. Check your internet and try again.': 'Hakuna mtandao. Angalia intaneti yako ujaribu tena.',
  'Account created. Open the link we emailed you, then sign in.': 'Akaunti imefunguliwa. Fungua kiungo tulichokutumia, kisha ingia.',
  'If there is an account for that email, a reset link is on its way. Check your inbox and spam folder.': 'Kama kuna akaunti ya barua pepe hiyo, kiungo kiko njiani. Angalia kikasha na barua taka.',
  'Choose a new password': 'Chagua nenosiri jipya',
  'You will use it to sign in on all your devices.': 'Utalitumia kuingia kwenye vifaa vyako vyote.',
  'New password': 'Nenosiri jipya',
  'New password (6 or more characters)': 'Nenosiri jipya (herufi 6 au zaidi)',
  'Save password': 'Hifadhi nenosiri',
  'This reset link has expired. Ask for a new one.': 'Kiungo hiki kimeisha muda. Omba kingine.',
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
