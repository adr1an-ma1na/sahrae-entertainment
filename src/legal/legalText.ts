/**
 * Sahrae's legal pages: Terms of Use, Privacy Policy, Cookies & storage, and
 * Copyright. Shown in the Legal centre (components/LegalCenter.tsx).
 *
 * Written from what the app actually does (checked against the code on
 * 2026-11-01): what is stored, where it goes, what is optional. When the app
 * starts collecting or sharing something new, this file changes with it, and
 * LEGAL_UPDATED moves on so the cookie banner asks again (services/consent.ts).
 */

export const LEGAL_UPDATED = '1 November 2026';
export const LEGAL_VERSION = 1;
export const LEGAL_EMAIL = 'sahrae@gmail.com';

export interface LegalSection { h: string; p: string[] }
export interface LegalDoc { id: LegalId; title: string; intro: string; sections: LegalSection[] }
export type LegalId = 'terms' | 'privacy' | 'cookies' | 'copyright';

const terms: LegalDoc = {
  id: 'terms',
  title: 'Terms of Use',
  intro: 'These terms are the agreement between you and Sahrae for using the Sahrae website and apps (phone, tablet and TV). Please read them; by creating an account or using Sahrae you accept them.',
  sections: [
    { h: '1. Who we are', p: [
      `Sahrae ("Sahrae", "we", "us") is an entertainment app run by an individual, not a company. You can reach us at ${LEGAL_EMAIL}.`,
    ] },
    { h: '2. Who can use Sahrae', p: [
      'You must be at least 13 years old, or older where the law of your country sets a higher age for using online services without a parent\'s consent. If you are under 18, use Sahrae with the permission of a parent or guardian.',
      'Some titles, channels and events are meant for adults. Their age ratings are shown where the source provides one; choosing what is suitable for children in your home is up to you.',
    ] },
    { h: '3. What Sahrae is, and what it is not', p: [
      'Sahrae organises entertainment that other services make available on the internet: information and artwork about films and series, music and music videos, podcasts, radio, live TV and live sport. It gives you a way to find these and play them in one place.',
      'Sahrae does not upload, host or store films, episodes, songs, broadcasts or matches on its own servers. When you press play, the picture and sound come from a third-party service, often shown inside Sahrae through that service\'s own player. Sahrae does not own, control or check that content, and is not responsible for it.',
      'Whether a particular stream may lawfully be watched or listened to depends on the rights its provider holds and on the law where you are. You are responsible for making sure that what you choose to watch or listen to is lawful for you.',
    ] },
    { h: '4. Third-party services', p: [
      'Players, channels, stations and catalogues in Sahrae belong to third parties (for example YouTube, The Movie Database, Deezer, Apple Podcasts, radio stations and streaming sites). Their own terms and privacy policies apply when you use them, they may show their own advertising, and they may change or stop at any time.',
      'Sahrae tries to keep you away from unwanted pop-ups and adverts from these players (the apps block them at the network level; the website offers the Ad Shield), but cannot promise that every one is caught.',
    ] },
    { h: '5. Your account', p: [
      'Some features need an account. Give accurate details, keep your password to yourself, and tell us if you think someone else has used your account. You are responsible for what happens under your account.',
      'You can delete your account at any time from Profile, Privacy & data.',
    ] },
    { h: '6. Using Sahrae fairly', p: [
      'Do not: use Sahrae to break the law; try to get into parts of Sahrae, its servers or other people\'s accounts that you are not allowed into; overload, scrape or copy Sahrae or its catalogue by automated means; copy, resell or redistribute streams; or use Watch together or any other feature to send content that is unlawful, abusive, hateful, sexual involving minors, or harassing.',
      'We may suspend or close an account that breaks these terms, and we will tell you why unless the law or someone\'s safety prevents it.',
    ] },
    { h: '7. Copyright and takedown', p: [
      'Sahrae respects the rights of creators. If you hold the rights to something you can reach through Sahrae and you do not want it there, tell us and we will remove it from Sahrae. How to do that is set out under Copyright.',
      'We close the accounts of people who repeatedly break the law through Sahrae.',
    ] },
    { h: '8. The service, as it is', p: [
      'Sahrae is free and is provided "as is" and "as available". Because it relies on services we do not run, titles, servers, channels and matches come and go, and something that plays today may not tomorrow. We do not promise that Sahrae will always be available, error-free or suitable for a particular purpose.',
    ] },
    { h: '9. Our liability', p: [
      'To the extent the law allows, Sahrae is not liable for indirect or consequential loss, for loss of data, or for anything caused by third-party services, content or players. Nothing in these terms limits liability that cannot be limited by law, such as for death or personal injury caused by negligence, or for fraud.',
    ] },
    { h: '10. Changes', p: [
      'We may change Sahrae and these terms. When we change the terms in a way that matters, we will tell you in the app before the change takes effect. If you keep using Sahrae after that, the new terms apply; if you do not agree with them, stop using Sahrae and delete your account.',
    ] },
    { h: '11. Law and disputes', p: [
      'These terms are governed by the laws of Kenya. If you use Sahrae as a consumer, you also keep every protection the law of the country where you live gives you, and you may bring a claim in the courts of that country as well as in Kenya.',
      'If a court finds part of these terms unenforceable, the rest still applies. The English version of these terms is the one that counts.',
    ] },
    { h: '12. Contact', p: [`Questions about these terms: ${LEGAL_EMAIL}.`] },
  ],
};

const privacy: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  intro: 'This policy explains what personal information Sahrae uses, why, who else receives it, and the choices and rights you have. Sahrae does not sell personal information and does not use advertising or analytics trackers of its own.',
  sections: [
    { h: '1. Who is responsible', p: [
      `Sahrae, run by an individual, is responsible for the personal information described here. Contact: ${LEGAL_EMAIL}.`,
    ] },
    { h: '2. What we use, and why', p: [
      'Your account. Your email address, the password you choose (stored only as a protected hash by our account provider, never readable by us), your display name and the avatar you pick. Used to sign you in and keep your account safe. If you sign in with Google, we receive your name, email address and profile picture from Google.',
      'Your library and settings. Your lists, liked songs, playlists, followed podcasts, what you have watched and where you stopped, the artists and genres you choose, a record of which artists you play through or skip (used only to pick music for you), your theme, language and equaliser settings. Kept on your device and, when you are signed in, copied to your account so they follow you to your other devices.',
      'Watch together and the phone remote. While you use them, your display name, what is playing and any chat messages are passed between the devices in that session. They are not kept after the session ends.',
      'YouTube connection (optional). If you connect YouTube, Google gives Sahrae read-only access to your YouTube account so it can show your playlists, liked music and subscriptions. The access key stays on your device; Sahrae does not copy your YouTube data to its servers. You can disconnect at any time.',
      'Server reports (optional, your choice). If you allow it, when a film or episode starts or fails on a server, Sahrae records the title, the server and whether it played, without your name or account, so other viewers are sent to a server that works.',
      'Kick-off reminders (Android). A reminder you set is scheduled on your phone; nothing is sent to us.',
      'Problem reports (Android). If the app closes unexpectedly it keeps a short note on your device. It is only sent anywhere if you choose to share it.',
    ] },
    { h: '3. Our legal bases', p: [
      'We use your account, library and settings because they are needed to provide the service you asked for (performance of our agreement with you). We keep the service secure and working on the basis of our legitimate interest in doing so. Server reports and the YouTube connection are based on your consent, which you can withdraw at any time.',
    ] },
    { h: '4. Who else receives information', p: [
      'Supabase, which runs our accounts, stores your library and carries Watch together and the phone remote. Google (Firebase), for "Connect YouTube" sign-in. These providers act on our behalf and only as needed to run Sahrae.',
      'Services you use through Sahrae receive what any website receives when your device contacts it, including your IP address and device details: YouTube and Google, The Movie Database (film and series information), Deezer (music catalogue), lrclib (lyrics), Apple (podcast search), DiceBear (avatars), Piped (YouTube mirrors), GitHub and jsDelivr (app files and schedules), and the radio stations, TV channels, podcast hosts, streaming and sports sites whose players you open. Their own privacy policies apply.',
      'We may disclose information if the law requires it, or to protect the safety of people or of Sahrae.',
    ] },
    { h: '5. Where information is kept', p: [
      'Our providers may store information on servers outside your country. Where the law requires it, we rely on safeguards such as the provider\'s standard contractual terms for those transfers.',
    ] },
    { h: '6. How long we keep it', p: [
      'Account and library information: while your account exists. When you delete your account, it is erased from our account provider, normally straight away and at most within 30 days. Server reports carry no identity and are kept to keep the server rankings accurate. Information on your device stays until you clear it, uninstall the app or delete your account.',
    ] },
    { h: '7. Security', p: [
      'Connections are encrypted (HTTPS), passwords are never stored in readable form, and access to account data is limited to your own account. No system is perfectly secure; if a breach affects you, we will tell you and the authorities as the law requires.',
    ] },
    { h: '8. Your rights', p: [
      'Depending on where you live (for example under Kenya\'s Data Protection Act 2019, the EU and UK GDPR, or California\'s privacy laws) you may have the right to: see the information we hold about you; have it corrected; have it deleted; receive a copy to take elsewhere; object to or restrict its use; and withdraw consent at any time.',
      `In the app, Profile, Privacy & data lets you download your data, change your choices and delete your account. For anything else, write to ${LEGAL_EMAIL}; we reply within 30 days. You may also complain to your data protection authority (in Kenya, the Office of the Data Protection Commissioner).`,
    ] },
    { h: '9. Children', p: [
      'Sahrae is not meant for children under 13, and we do not knowingly collect information from them. If you believe a child has given us information, write to us and we will delete it.',
    ] },
    { h: '10. Changes', p: [
      'We will update this policy when what Sahrae does with information changes, and tell you in the app when a change matters.',
    ] },
  ],
};

const cookies: LegalDoc = {
  id: 'cookies',
  title: 'Cookies & storage',
  intro: 'Sahrae itself sets no advertising or analytics cookies. It keeps what it needs on your device, and asks you before sharing anything optional.',
  sections: [
    { h: 'Essential (always on)', p: [
      'Sahrae uses your device\'s storage (local storage and the app cache, which work like cookies) for things it cannot work without: keeping you signed in, your library and settings, remembering which servers work on your device, and keeping recent pages and pictures so the app opens quickly and uses less data.',
    ] },
    { h: 'Optional (your choice)', p: [
      'Server reports: anonymous notes of which server played which title, shared so other viewers start on a working server. Off unless you turn it on.',
    ] },
    { h: 'Third-party players', p: [
      'When you play something, the picture usually comes from another service\'s player shown inside Sahrae (YouTube, and the streaming, TV, radio and sports sites behind the servers and feeds). Those services can set their own cookies and show their own adverts under their own policies; Sahrae cannot switch them off and still play the video. Film and series trailers use YouTube\'s privacy-enhanced mode. The Android apps block pop-ups and known advertising hosts; on the website, the Ad Shield does what a browser allows.',
    ] },
    { h: 'Your choices', p: [
      'Change your choices any time in Profile, Privacy & data. You can also clear Sahrae\'s storage in your browser\'s site settings or by clearing the app\'s data on Android, which signs you out on that device.',
    ] },
  ],
};

const copyright: LegalDoc = {
  id: 'copyright',
  title: 'Copyright & takedown',
  intro: 'Sahrae does not host films, episodes, music, broadcasts or matches. If you own the rights to something you can reach through Sahrae and want it removed, tell us and we will remove it from Sahrae.',
  sections: [
    { h: 'How to send a notice', p: [
      `Email ${LEGAL_EMAIL} with the subject "Copyright notice" and include:`,
      '1. The work you own or represent (title, and the season and episode, match or channel where it applies).',
      '2. Where it appears in Sahrae: the title as it is shown, and the server or feed name if you know it.',
      '3. Your name, organisation if any, postal address, phone and email.',
      '4. A statement that you believe in good faith the use is not authorised by the owner, its agent or the law.',
      '5. A statement that the information is accurate and, under penalty of perjury, that you are the owner or authorised to act for the owner.',
      '6. Your physical or electronic signature.',
    ] },
    { h: 'What we do', p: [
      'We remove the title, server or feed from Sahrae promptly, normally within a few working days, and tell you when it is done. Removed titles stop being playable in every version of the app as soon as it next updates its lists. Notices may be shared with the provider of the stream concerned.',
    ] },
    { h: 'If you think something was removed by mistake', p: [
      'Write to us with the details and why you believe the removal was a mistake. We will look at it and may restore it if the rights holder does not pursue the matter.',
    ] },
    { h: 'Notices about the streams themselves', p: [
      'Because the streams are hosted by others, a notice to Sahrae removes them from Sahrae only. To have a stream taken down where it is hosted, contact the site or host that serves it.',
    ] },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [terms, privacy, cookies, copyright];
export const legalDoc = (id: LegalId) => LEGAL_DOCS.find((d) => d.id === id)!;
