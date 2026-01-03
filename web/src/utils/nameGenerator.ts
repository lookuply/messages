/**
 * Random Name Generator
 *
 * Generates random conversation names in format: adjective-noun
 * Example: hnedy-autobus, rychly-vlak, zelena-kniha
 */

const ADJECTIVES = [
  'rychly', 'pomaly', 'velky', 'maly', 'stary', 'novy', 'cerveny', 'modry',
  'zeleny', 'zluty', 'biely', 'cierny', 'hnedy', 'fialovy', 'oranzovy', 'ruzovy',
  'svetly', 'tmavy', 'jasny', 'matny', 'leskliy', 'hruby', 'tenky', 'siroke',
  'uzky', 'vysoky', 'nizky', 'dlhy', 'kratky', 'tazky', 'lahky', 'silny',
  'slaby', 'tvrdy', 'mekky', 'hladky', 'drsny', 'ostry', 'tupy', 'rovny',
  'krivy', 'pravy', 'lavy', 'horny', 'dolny', 'predny', 'zadny', 'stredny',
  'vonkajsi', 'vnutorny', 'mlady', 'stary', 'novy', 'moderny', 'antikvny', 'klasicky',
  'jednoduchy', 'zlozity', 'lahky', 'tazky', 'mily', 'nemily', 'pekny', 'skaredky',
  'cistiy', 'spinavy', 'suchy', 'mokry', 'tepely', 'studeny', 'horuce', 'mrazive',
  'slnecny', 'dazdive', 'zamraceny', 'jasny', 'oblacny', 'veterny', 'tichy', 'hlucny',
  'kludny', 'ruchny', 'pokojny', 'nepokoj', 'vesely', 'smutny', 'stastny', 'nespokojny',
  'radostny', 'bolestn', 'prijemny', 'neprijemny', 'pohodln', 'nepohodlny', 'bezpecny', 'nebezpecny',
  'istiy', 'neisty', 'znamy', 'neznamy', 'oblubeny', 'neoblubeny', 'popularny', 'vzacny',
  'bezny', 'mimoriadny', 'normalny', 'cudny', 'zvlastny', 'obycajny', 'vynimocny', 'specialny',
  'hlavny', 'vedlajsi', 'prvny', 'posledny', 'druhy', 'treti', 'stvrty', 'piaty',
  'plny', 'prazdny', 'otvoreny', 'zatvoreny', 'volny', 'obsadeny', 'aktivny', 'pasivny',
  'zive', 'mrtve', 'zdravy', 'chory', 'sviezy', 'stary', 'cerstvej', 'pokazeny',
  'dobry', 'zly', 'spravny', 'nespravny', 'presny', 'nepresny', 'pravdivy', 'nepravdivy',
  'skutocny', 'neskutocny', 'realny', 'virtualny', 'mozny', 'nemozny', 'pravdepodobny', 'nepravdepodobny',
  'urcity', 'neurcity', 'konkretny', 'abstraktny', 'viditelny', 'neviditelny', 'pocutelny', 'nepocutelny',
  'chutny', 'nechutny', 'sladky', 'slany', 'kysly', 'horky', 'korenitiy', 'mdly',
  'vonavy', 'zapachajuci', 'aromaticky', 'pachnuci', 'cerstvy', 'zatuchly', 'dusny', 'vzdusny',
  'priestranny', 'tesny', 'prostranny', 'stiesneny', 'rozlahliy', 'obmedzeny', 'neobmedzeny', 'hranicny',
  'okrajovy', 'centralny', 'vzdaleny', 'blizky', 'primy', 'nepriam', 'usporny', 'marnotratny',
  'lacny', 'drahy', 'cenovy', 'bezcenny', 'dostupny', 'nedostupny', 'vyhodny', 'nevyhodny',
  'uzitocny', 'neuzitocny', 'praktickt', 'nepraktickt', 'funkcny', 'nefunkcny', 'vhodny', 'nevhodny',
  'prislusny', 'neprislusny', 'zakonny', 'nezakonny', 'legalny', 'illegalny', 'oficialny', 'neoficialny',
  'formalny', 'neformalny', 'slavnostny', 'vsedn', 'ceremonialny', 'bezny', 'tradicny', 'netradicny',
  'konvencny', 'nekonvencny', 'standardny', 'nestandardny', 'typicky', 'atypicky', 'bezny', 'nebezny',
  'pravidelny', 'nepravidelny', 'systematicky', 'chaoticky', 'organizo', 'dezorganiz', 'poriadny', 'neporiadny',
  'cistiy', 'necistr', 'hygienicky', 'nehygienicky', 'sterilny', 'kontaminovany', 'bezpecny', 'rizikovy',
  'stabilny', 'nestabilny', 'pevny', 'krehky', 'odolny', 'citlivy', 'trvanlivy', 'prechodny',
];

const NOUNS = [
  'autobus', 'vlak', 'lietadlo', 'lod', 'auto', 'bicykel', 'motorka', 'tramvaj',
  'trolejbus', 'metro', 'taxik', 'kamion', 'traktor', 'helikoptera', 'raketa', 'satelit',
  'strom', 'kvet', 'trava', 'krik', 'les', 'luka', 'pole', 'zahrada',
  'park', 'hora', 'kopec', 'dolina', 'rieka', 'potok', 'jazero', 'more',
  'ocean', 'ostrov', 'polostrov', 'pobrerie', 'plaz', 'utes', 'zaliv', 'prieplav',
  'pes', 'macka', 'kon', 'krava', 'svina', 'ovca', 'koza', 'sliepka',
  'vtak', 'ryba', 'motyl', 'vcela', 'mravec', 'pavuk', 'had', 'zaba',
  'zajac', 'liska', 'vlk', 'medved', 'jelen', 'diviak', 'vevericka', 'jez',
  'kniha', 'zosit', 'pero', 'ceruzka', 'guma', 'pravitko', 'noznice', 'lepidlo',
  'papier', 'obraz', 'fotka', 'mapa', 'atlas', 'slovnik', 'encyklopedia', 'noviny',
  'casopis', 'list', 'plagat', 'letak', 'sticker', 'znacka', 'etiketa', 'stitok',
  'dom', 'byt', 'izba', 'kuchyna', 'kupelna', 'zahrada', 'terasa', 'balkon',
  'pivnica', 'podkrovie', 'garaz', 'sklep', 'stodola', 'staj', 'kuren', 'humno',
  'stol', 'stolička', 'kreslo', 'pohovka', 'postel', 'skrina', 'polica', 'zasuvka',
  'lampa', 'lustier', 'zrkadlo', 'obraz', 'koberec', 'zavesa', 'vankus', 'prikryvka',
  'pocitac', 'telefon', 'tablet', 'klavesnica', 'mys', 'monitor', 'tlacaren', 'skener',
  'kamera', 'mikrofon', 'sluchadla', 'reproduktor', 'router', 'modem', 'disk', 'kabel',
  'jedlo', 'nápoj', 'chlieb', 'pecivo', 'maso', 'ryba', 'zelenina', 'ovocie',
  'polievka', 'salat', 'dezert', 'kolac', 'torta', 'susienka', 'cukrik', 'cokolada',
  'kava', 'caj', 'mlieko', 'dzus', 'voda', 'vino', 'pivo', 'limonada',
  'hrnček', 'sklenicka', 'tanierík', 'miska', 'pribor', 'noz', 'vidlička', 'lyzica',
  'hrniec', 'panvica', 'forma', 'misa', 'kastrola', 'kanvica', 'konvica', 'dzban',
  'tricko', 'kosela', 'nohavice', 'sukna', 'saty', 'kabat', 'bunda', 'sveter',
  'sála', 'ciapka', 'rukavice', 'ponozky', 'topanky', 'sandala', 'cizma', 'papuca',
  'hodiny', 'budzik', 'kalendar', 'diár', 'zosit', 'notes', 'blok', 'tabuľka',
  'mapa', 'globus', 'dalekohľad', 'mikroskop', 'lupa', 'zrkadlo', 'prisma', 'kompas',
  'slnko', 'mesiac', 'hviezda', 'planeta', 'kometa', 'meteor', 'galaxia', 'vesmír',
  'mraky', 'dazd', 'sneh', 'vietor', 'burka', 'hrom', 'blesk', 'dúha',
  'rano', 'den', 'vecer', 'noc', 'svitanie', 'súmrak', 'poludnie', 'polnoc',
  'pondelok', 'utorok', 'streda', 'stvrtok', 'piatok', 'sobota', 'nedela', 'vikend',
  'januar', 'februar', 'marec', 'april', 'maj', 'jun', 'jul', 'august',
  'september', 'oktober', 'november', 'december', 'jar', 'leto', 'jesen', 'zima',
  'sekunda', 'minuta', 'hodina', 'den', 'tyzden', 'mesiac', 'rok', 'desatrocie',
  'storocie', 'tisicrocie', 'era', 'epocha', 'obdobie', 'cas', 'chvila', 'moment',
  'hudba', 'piesen', 'melodia', 'rytmus', 'takt', 'ton', 'akord', 'harmonia',
  'nastroj', 'gitara', 'klavir', 'husle', 'flauta', 'trubka', 'bubon', 'cimbal',
  'film', 'serial', 'dokument', 'animak', 'komedía', 'drama', 'thriller', 'horor',
  'akcia', 'dobrodruzstvo', 'scifi', 'fantasy', 'western', 'muzkal', 'romance', 'mysteriozn',
  'sport', 'futbal', 'hokej', 'tenis', 'basketbal', 'volejbal', 'plávanie', 'beh',
  'cyklistika', 'lyžovanie', 'korculovanie', 'box', 'karate', 'judo', 'joga', 'fitness',
  'farba', 'stitec', 'platno', 'paleta', 'socha', 'galeria', 'muzeum', 'vystava',
  'divadlo', 'scena', 'kulisa', 'opona', 'herecz', 'reziser', 'scenar', 'kostum',
];

/**
 * Generate a random conversation name
 */
export function generateConversationName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective}-${noun}`;
}

/**
 * Generate multiple unique conversation names
 */
export function generateUniqueNames(count: number): string[] {
  const names = new Set<string>();

  while (names.size < count) {
    names.add(generateConversationName());
  }

  return Array.from(names);
}
