/**
 * Every genre Sauti offers, searchable, with where its music comes from.
 *
 * A genre's mix is built from ARTISTS (curate.ts): `seeds` are artists known
 * for it, widened through Deezer's related artists. Where no seeds are listed,
 * Deezer's own genre (`dz`) or its most complete playlists for `q` give the
 * artists. Never a YouTube search for the genre's name: that is how a Rumba &
 * Lingala mix filled with AI uploads.
 */
export interface Genre { id: string; name: string; group: string; seeds?: string[]; dz?: number; q?: string; tint: string }

const T = ['#E11D48', '#EA580C', '#D97706', '#16A34A', '#0D9488', '#0284C7', '#4F46E5', '#7C3AED', '#C026D3', '#DB2777', '#65A30D', '#0891B2'];
const g = (group: string, name: string, extra: Partial<Genre> = {}): Genre => {
  const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return { id, name, group, tint: T[h % T.length], ...extra };
};

export const GENRE_GROUPS = ['African', 'Hip-hop & R&B', 'Pop & Dance', 'Gospel & Worship', 'Caribbean & Latin', 'Rock & Alternative', 'Chill, Jazz & Classical', 'World'];

export const GENRES: Genre[] = [
  // African
  g('African', 'Rumba Congolaise', { seeds: ['Fally Ipupa', 'Koffi Olomide', 'Ferre Gola', 'Werrason', 'Papa Wemba', 'Franco & le T.P OK Jazz', 'Héritier Watanabe'] }),
  g('African', 'Lingala & Ndombolo', { seeds: ['Fally Ipupa', "Innoss'B", 'Gaz Mawete', 'Werrason', 'JB Mpiana', 'Awilo Longomba', 'Koffi Olomide'] }),
  g('African', 'Soukous', { seeds: ['Kanda Bongo Man', 'Diblo Dibala', 'Awilo Longomba', 'Pepe Kalle', 'Tabu Ley Rochereau', 'M\'bilia Bel'] }),
  g('African', 'Bongo Flava', { seeds: ['Diamond Platnumz', 'Harmonize', 'Rayvanny', 'Zuchu', 'Ali Kiba', 'Marioo', 'Jux', 'Nandy', 'Mbosso'] }),
  g('African', 'Gengetone', { seeds: ['Ethic Entertainment', 'Sailors Gang', 'Boondocks Gang', 'Mejja', 'Ssaru', 'Trio Mio', 'Exray'] }),
  g('African', 'Kenyan Pop', { seeds: ['Sauti Sol', 'Bien', 'Otile Brown', 'Nviiri the Storyteller', 'Bensoul', 'Nikita Kering', 'Okello Max', 'Bahati', 'Willy Paul'] }),
  g('African', 'Kenyan Hip-hop', { seeds: ['Khaligraph Jones', 'Wakadinali', 'Nyashinski', 'Octopizzo', 'Scar Mkadinali', 'Breeder LW', 'Kristoff'] }),
  g('African', 'Arbantone', { seeds: ['Kaskazini', 'Iyanii', 'Ssaru', 'Mejja'] }),
  g('African', 'Benga', { seeds: ['D.O. Misiani', 'Daniel Owino Misiani', 'Victoria Kings', 'Princess Jully', 'Okatch Biggy'] }),
  g('African', 'Ohangla', { seeds: ['Prince Indah', 'Emma Jalamo', 'Dola Kabarry', 'Odongo Swagg'] }),
  g('African', 'Mugithi', { seeds: ['Samidoh', 'Joseph Kamaru', 'Mike Rua', 'Salim Junior', 'Muigai wa Njoroge'] }),
  g('African', 'Taarab', { seeds: ['Zuhura Swaleh', 'Bi Kidude', 'Mzee Yusuf', 'Khadija Kopa'] }),
  g('African', 'Zilizopendwa', { seeds: ['Les Wanyika', 'Them Mushrooms', 'Fadhili William', 'Simba Wanyika', 'Daudi Kabaka', 'Orchestra Super Mazembe'] }),
  g('African', 'Afrobeats', { seeds: ['Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Asake', 'Ayra Starr', 'Tems', 'Omah Lay', 'Fireboy DML'] }),
  g('African', 'Afropop', { seeds: ['Tiwa Savage', 'Yemi Alade', 'CKay', 'Kizz Daniel', 'Joeboy', 'Tyla', 'Ayra Starr'] }),
  g('African', 'Afro-fusion', { seeds: ['Burna Boy', 'Black Sherif', 'Joshua Baraka', 'Bien', 'Tems'] }),
  g('African', 'Amapiano', { seeds: ['Kabza De Small', 'DJ Maphorisa', 'Uncle Waffles', 'Kelvin Momo', 'Focalistic', 'Young Stunna', 'Tyla', 'Mellow & Sleazy'] }),
  g('African', 'Afro House', { seeds: ['Black Coffee', 'Master KG', 'Culoe De Song', 'Da Capo', 'Enoo Napa'] }),
  g('African', 'Gqom', { seeds: ['DJ Lag', 'Babes Wodumo', 'Distruction Boyz', 'Mampintsha'] }),
  g('African', 'Kwaito', { seeds: ['Mandoza', 'Arthur Mafokate', 'TKZee', 'Mafikizolo', 'Brenda Fassie'] }),
  g('African', 'Highlife', { seeds: ['Osibisa', 'Daddy Lumba', 'Kojo Antwi', 'Amakye Dede', 'Flavour'] }),
  g('African', 'Ghanaian Hiplife & Drill', { seeds: ['Sarkodie', 'Stonebwoy', 'Black Sherif', 'King Promise', 'Shatta Wale', 'Kwesi Arthur'] }),
  g('African', 'Coupé-Décalé', { seeds: ['DJ Arafat', 'Serge Beynaud', 'Debordo Leekunfa', 'Kerozen'] }),
  g('African', 'Makossa', { seeds: ['Manu Dibango', 'Petit Pays', 'Charlotte Dipanda', 'Salatiel'] }),
  g('African', 'Afrobeat (Fela)', { seeds: ['Fela Kuti', 'Femi Kuti', 'Seun Kuti', 'Tony Allen', 'Antibalas'] }),
  g('African', 'Ugandan Pop', { seeds: ['Eddy Kenzo', 'Azawi', 'Sheebah', 'Bebe Cool', 'Joshua Baraka', 'Vinka'] }),
  g('African', 'Ethiopian', { seeds: ['Teddy Afro', 'Aster Aweke', 'Mahmoud Ahmed', 'Mulatu Astatke', 'Gigi'] }),
  g('African', 'Kizomba & Semba', { seeds: ['Calema', 'C4 Pedro', 'Anselmo Ralph', 'Nelson Freitas', 'Yola Semedo'] }),
  g('African', 'Afro Soul', { seeds: ['Lira', 'Simphiwe Dana', 'Zahara', 'Ami Faku', 'Msaki'] }),
  // Hip-hop & R&B
  g('Hip-hop & R&B', 'Hip-hop', { dz: 116, seeds: ['Kendrick Lamar', 'Drake', 'J. Cole', 'Travis Scott', 'Future', '21 Savage'] }),
  g('Hip-hop & R&B', 'Trap', { seeds: ['Future', 'Metro Boomin', 'Young Thug', 'Gunna', 'Lil Baby', '21 Savage'] }),
  g('Hip-hop & R&B', 'UK Drill', { seeds: ['Central Cee', 'Headie One', 'Digga D', 'K-Trap', 'Unknown T'] }),
  g('Hip-hop & R&B', 'Grime', { seeds: ['Stormzy', 'Skepta', 'Wiley', 'Dizzee Rascal', 'JME'] }),
  g('Hip-hop & R&B', 'Old School Hip-hop', { seeds: ['2Pac', 'The Notorious B.I.G.', 'Nas', 'Wu-Tang Clan', 'Snoop Dogg', 'Dr. Dre'] }),
  g('Hip-hop & R&B', 'R&B', { dz: 165, seeds: ['SZA', 'Brent Faiyaz', 'Summer Walker', 'Chris Brown', 'Usher', 'Jhené Aiko'] }),
  g('Hip-hop & R&B', 'Neo Soul', { seeds: ['Erykah Badu', "D'Angelo", 'Jill Scott', 'Lauryn Hill', 'Maxwell'] }),
  g('Hip-hop & R&B', 'Soul & Funk', { dz: 169, seeds: ['Marvin Gaye', 'Stevie Wonder', 'Aretha Franklin', 'Earth, Wind & Fire', 'Al Green'] }),
  // Pop & Dance
  g('Pop & Dance', 'Pop', { dz: 132, seeds: ['Taylor Swift', 'Dua Lipa', 'Billie Eilish', 'Sabrina Carpenter', 'Bruno Mars', 'Ariana Grande'] }),
  g('Pop & Dance', 'K-pop', { seeds: ['BTS', 'BLACKPINK', 'Stray Kids', 'NewJeans', 'TWICE', 'Jungkook'] }),
  g('Pop & Dance', 'Indie Pop', { seeds: ['Clairo', 'Lorde', 'beabadoobee', 'Conan Gray', 'girl in red'] }),
  g('Pop & Dance', 'Dance & EDM', { dz: 113, seeds: ['Calvin Harris', 'David Guetta', 'Martin Garrix', 'Avicii', 'Swedish House Mafia'] }),
  g('Pop & Dance', 'House', { seeds: ['Fred again..', 'Disclosure', 'Purple Disco Machine', 'Peggy Gou', 'Fisher'] }),
  g('Pop & Dance', 'Electronic', { dz: 106, seeds: ['Daft Punk', 'Kaytranada', 'ODESZA', 'Flume', 'Bonobo'] }),
  g('Pop & Dance', 'Disco', { seeds: ['Bee Gees', 'Donna Summer', 'Chic', 'Gloria Gaynor', 'Boney M.'] }),
  // Gospel & Worship
  g('Gospel & Worship', 'Kenyan Gospel', { seeds: ['Guardian Angel', 'Size 8', 'Mercy Masika', 'Bahati', 'Christina Shusho', 'Rose Muhando', 'Daddy Owen'] }),
  g('Gospel & Worship', 'African Gospel', { seeds: ['Mercy Chinwo', 'Moses Bliss', 'Sinach', 'Nathaniel Bassey', 'Israel Mbonyi', 'Joyous Celebration'] }),
  g('Gospel & Worship', 'Worship', { seeds: ['Hillsong Worship', 'Elevation Worship', 'Maverick City Music', 'Bethel Music', 'Chris Tomlin'] }),
  g('Gospel & Worship', 'Gospel', { seeds: ['CeCe Winans', 'Kirk Franklin', 'Tasha Cobbs Leonard', 'Fred Hammond', 'Donnie McClurkin'] }),
  // Caribbean & Latin
  g('Caribbean & Latin', 'Reggae', { dz: 144, seeds: ['Bob Marley & The Wailers', 'Damian Marley', 'Chronixx', 'Protoje', 'Lucky Dube'] }),
  g('Caribbean & Latin', 'Dancehall', { seeds: ['Vybz Kartel', 'Popcaan', 'Shenseea', 'Sean Paul', 'Spice', 'Skillibeng'] }),
  g('Caribbean & Latin', 'Soca', { seeds: ['Machel Montano', 'Kes', 'Bunji Garlin', 'Patrice Roberts'] }),
  g('Caribbean & Latin', 'Reggaeton', { seeds: ['Bad Bunny', 'Daddy Yankee', 'J Balvin', 'Karol G', 'Ozuna', 'Feid'] }),
  g('Caribbean & Latin', 'Latin Pop', { dz: 197, seeds: ['Shakira', 'Rosalía', 'Karol G', 'Peso Pluma', 'Becky G'] }),
  g('Caribbean & Latin', 'Salsa & Bachata', { seeds: ['Marc Anthony', 'Romeo Santos', 'Aventura', 'Celia Cruz', 'Prince Royce'] }),
  g('Caribbean & Latin', 'Brazilian', { dz: 75, seeds: ['Anitta', 'Ludmilla', 'Jorge Ben Jor', 'Gilberto Gil', 'Marisa Monte'] }),
  // Rock & Alternative
  g('Rock & Alternative', 'Rock', { dz: 152, seeds: ['Queen', 'Foo Fighters', 'Red Hot Chili Peppers', 'Guns N\' Roses', 'AC/DC'] }),
  g('Rock & Alternative', 'Alternative', { dz: 85, seeds: ['Arctic Monkeys', 'Radiohead', 'The Strokes', 'Tame Impala', 'Twenty One Pilots'] }),
  g('Rock & Alternative', 'Indie Rock', { seeds: ['The Killers', 'Vampire Weekend', 'The 1975', 'Phoebe Bridgers', 'Arcade Fire'] }),
  g('Rock & Alternative', 'Metal', { dz: 464, seeds: ['Metallica', 'Iron Maiden', 'Linkin Park', 'System of a Down', 'Slipknot'] }),
  g('Rock & Alternative', 'Pop Punk', { seeds: ['Paramore', 'Blink-182', 'Green Day', 'Fall Out Boy', 'Avril Lavigne'] }),
  // Chill, Jazz & Classical
  g('Chill, Jazz & Classical', 'Jazz', { dz: 129, seeds: ['Miles Davis', 'John Coltrane', 'Ella Fitzgerald', 'Louis Armstrong', 'Hugh Masekela'] }),
  g('Chill, Jazz & Classical', 'Smooth Jazz', { seeds: ['Kenny G', 'George Benson', 'Boney James', 'Dave Koz', 'Najee'] }),
  g('Chill, Jazz & Classical', 'Blues', { dz: 153, seeds: ['B.B. King', 'Muddy Waters', 'John Lee Hooker', 'Etta James', 'Ali Farka Touré'] }),
  g('Chill, Jazz & Classical', 'Classical', { dz: 98, seeds: ['Ludovico Einaudi', 'Johann Sebastian Bach', 'Wolfgang Amadeus Mozart', 'Ludwig van Beethoven', 'Frédéric Chopin'] }),
  g('Chill, Jazz & Classical', 'Acoustic & Singer-songwriter', { seeds: ['Ed Sheeran', 'Jack Johnson', 'Norah Jones', 'Tracy Chapman', 'Ben Howard'] }),
  g('Chill, Jazz & Classical', 'Country', { seeds: ['Morgan Wallen', 'Luke Combs', 'Chris Stapleton', 'Dolly Parton', 'Zach Bryan'] }),
  g('Chill, Jazz & Classical', 'Folk', { dz: 466, seeds: ['Mumford & Sons', 'The Lumineers', 'Bon Iver', 'Fleet Foxes', 'Simon & Garfunkel'] }),
  g('Chill, Jazz & Classical', 'Soundtracks', { dz: 173, seeds: ['Hans Zimmer', 'John Williams', 'Ludwig Göransson', 'Ennio Morricone'] }),
  // World
  g('World', 'Bollywood', { dz: 81, seeds: ['Arijit Singh', 'Shreya Ghoshal', 'A. R. Rahman', 'Pritam', 'Neha Kakkar'] }),
  g('World', 'Arabic Pop', { seeds: ['Amr Diab', 'Nancy Ajram', 'Elissa', 'Mohamed Ramadan', 'Fairuz'] }),
  g('World', 'French Pop & Rap', { seeds: ['Aya Nakamura', 'Gims', 'Dadju', 'Tayc', 'Ninho', 'Stromae'] }),
  g('World', 'J-pop & Anime', { seeds: ['YOASOBI', 'Kenshi Yonezu', 'Ado', 'LiSA', 'Fujii Kaze'] }),
  g('World', 'Zouk', { seeds: ['Kassav\'', 'Kaysha', 'Medi Meyz', 'Lynnsha'] }),
];

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Genres whose name, group or artists contain the words typed. */
export function searchGenres(q: string): Genre[] {
  const want = fold(q.trim());
  if (!want) return GENRES;
  return GENRES.filter((x) => fold(`${x.name} ${x.group} ${(x.seeds || []).join(' ')}`).includes(want));
}

export const genreById = (id: string): Genre | undefined => GENRES.find((x) => x.id === id);
