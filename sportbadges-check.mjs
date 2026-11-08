/**
 * Live Sports badges and competition logos (src/services/sportBadges.ts).
 * Team names and search results are as ESPN and the listing sources give them.
 *
 * Run: node --experimental-strip-types sportbadges-check.mjs
 */
import { competitionOf, teamMatch, pickBadge, isTeamSport } from './src/services/sportBadges.ts';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};
const name = (e) => competitionOf(e)?.name ?? null;

console.log('\nthe series a session belongs to');
eq('a labelled Grand Prix', name({ category: 'motor-sports', league: 'Formula 1', title: 'São Paulo Grand Prix - Race' }), 'Formula 1');
eq('a bare qualifying session is F1', name({ category: 'motor-sports', title: 'Sao Paulo Qualifying' }), 'Formula 1');
eq('a channel named F1', name({ category: 'motor-sports', league: 'F1', title: 'Sky Sports F1' }), 'Formula 1');
eq('MotoGP keeps its own logo', name({ category: 'motor-sports', league: 'MotoGP', title: 'Valencia Grand Prix - Sprint' }), 'MotoGP');
eq('Moto2 is MotoGP', name({ category: 'motor-sports', title: 'Moto2 Valencia Race' }), 'MotoGP');
eq('Formula E is not F1', name({ category: 'motor-sports', title: 'Formula E Miami Qualifying' }), 'Formula E');
eq('Formula 2 is not F1', competitionOf({ category: 'motor-sports', title: 'Formula 2 Sprint Race' })?.logo, undefined);
eq('a local speedway is not F1', name({ category: 'motor-sports', title: 'Fall Brawl at Hickory Motor Speedway' }), null);
eq('local practice is not F1', name({ category: 'motor-sports', title: 'Dirt Track Practice at Charlotte' }), null);
eq('a fight card', name({ category: 'fight', league: 'UFC', title: 'UFC Fight Night: Cortes Acosta vs. Walker' }), 'UFC');
eq('a Grand Prix outside motor sport is not F1', name({ category: 'other', title: 'Diamond League Grand Prix' }), null);

console.log('\na team is the team');
eq('the same name', teamMatch('Heerenveen', 'Heerenveen'), 3);
eq('a longer listing', teamMatch('Feyenoord Rotterdam', 'Feyenoord'), 2);
eq('FC is nothing', teamMatch('Austin FC', 'Austin'), 3);
eq('accents aside', teamMatch('Djurgården', 'Djurgarden'), 3);
eq('a name the club does not use', teamMatch('Inter Milan', 'Internazionale'), 3);
eq('another club of the same city is not it', teamMatch('Manchester United', 'Manchester City'), 0);
eq('another Real is not it', teamMatch('Real Betis', 'Real Madrid'), 0);

console.log('\nthe right badge from a search');
const r = (displayName, sport, url, subtitle = '') => ({ displayName, sport, subtitle, image: { default: url } });
eq('the right sport only', pickBadge('Arsenal', 'football', [r('Arsenal', 'basketball', 'b.png'), r('Arsenal', 'soccer', 's.png')]), 's.png');
eq('American football is not football', pickBadge('Dallas Cowboys', 'american-football', [r('Dallas Cowboys', 'football', 'c.png')]), 'c.png');
eq('the men\'s side', pickBadge('Heerenveen', 'football', [r('Heerenveen', 'soccer', 'w.png', 'Dutch Vrouwen Eredivisie'), r('Heerenveen', 'soccer', 'm.png', 'Eredivisie')]), 'm.png');
eq('the best match wins', pickBadge('Inter', 'football', [r('Inter Turku', 'soccer', 't.png'), r('Internazionale', 'soccer', 'i.png')]), 'i.png');
eq('no good match, no badge', pickBadge('Gor Mahia', 'football', [r('Mahindra United', 'soccer', 'x.png')]), null);
eq('fighters have no team badge', pickBadge('Walker', 'fight', [r('Walker', 'mma', 'x.png')]), null);
eq('tennis is not a team sport', isTeamSport('tennis'), false);
eq('football is', isTeamSport('football'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
