/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Julian Digital Products
 *
 * BlackMyData - 100% Client-Side German PII & Context Disambiguation Engine
 * Ported from app/services/detector_service.py for Browser-Standalone Mode
 */

const COMMON_FIRST_NAMES = new Set([
  "alexander", "amelie", "andreas", "anja", "anna", "annika", "anton", "axel",
  "bärbel", "baerbel", "ben", "benjamin", "bernd", "bettina", "bianca", "birgit",
  "brigitte", "britta", "carina", "carsten", "charlotte", "christa", "christian",
  "christina", "christine", "christoph", "christopher", "clara", "claudia",
  "dagmar", "daniel", "daniela", "david", "dennis", "detlef", "dieter", "dirk",
  "dominik", "elena", "elias", "elisabeth", "elke", "emil", "emilia", "emma",
  "erik", "erika", "ernst", "eva", "fabian", "felix", "finn", "flora", "florian",
  "frank", "franz", "franziska", "frieda", "friedrich", "gabriele", "georg",
  "gerd", "gerda", "gerhard", "gisela", "greta", "günter", "guenter", "günther",
  "guenther", "hannah", "hannelore", "hans", "harald", "hartmut", "heike",
  "heinrich", "heinz", "helga", "helmut", "henry", "herbert", "hermann",
  "hildegard", "holger", "horst", "ida", "ilse", "ingo", "ingrid", "iris",
  "irmgard", "jan", "jana", "jannik", "jasmin", "jennifer", "jens", "jessica",
  "joachim", "johanna", "johannes", "jonas", "jonathan", "jörg", "joerg", "josef",
  "julia", "julian", "jürgen", "juergen", "jutta", "karin", "karl", "karla",
  "karsten", "katharina", "kathrin", "katja", "katrin", "kerstin", "kevin",
  "klara", "klaus", "konrad", "kurt", "lara", "laura", "lea", "lena", "leni",
  "leon", "leonie", "liam", "lilly", "lily", "lina", "lisa", "lothar", "otta",
  "lotta", "louis", "lucas", "luisa", "luise", "luka", "lukas", "maja", "manfred",
  "manuel", "manuela", "marc", "marcel", "marco", "marcus", "maria", "marianne",
  "marie", "marion", "mark", "markus", "martin", "martina", "mathilda", "matteo",
  "matthias", "max", "maximilian", "melanie", "mia", "michael", "mila", "monika",
  "moritz", "nadine", "nele", "nicole", "niklas", "nils", "nina", "noah",
  "norbert", "oliver", "otto", "pascal", "patrick", "paul", "peter", "petra",
  "philipp", "pia", "ainer", "rainer", "ralf", "ralph", "renate", "rené", "rene",
  "reinhard", "rolf", "rosa", "rose", "roswitha", "rudi", "sabine", "sabrina",
  "samuel", "sandra", "sara", "sarah", "sascha", "sebastian", "sepp", "siegfried",
  "silke", "silvia", "simon", "simone", "sofia", "sommer", "sonja", "sophia",
  "stefan", "stefanie", "steffi", "stephan", "susanne", "sven", "svenja",
  "sylvia", "tanja", "theo", "thomas", "thorsten", "tim", "tobias", "torsten",
  "ulrich", "ursula", "uwe", "vanessa", "verena", "victoria", "viktoria",
  "viola", "volker", "walter", "werner", "wilhelm", "wolf", "wolfgang"
]);

const COMMON_LAST_NAMES = new Set([
  "müller", "mueller", "schmidt", "schmitt", "schmied", "schneider", "fischer",
  "weber", "meyer", "meier", "maier", "mayer", "wagner", "becker", "schulz",
  "schulze", "schultze", "hoffmann", "hofmann", "schäfer", "schaefer",
  "schröder", "schroeder", "neumann", "zimmermann", "krüger", "krueger",
  "hartmann", "werner", "schmitz", "krause", "lehmann", "köhler", "koehler",
  "herrmann", "huber", "möller", "moeller", "kähler", "kaehler", "schubert",
  "lorenz", "baumann", "albrecht", "böhm", "boehm", "schumacher", "krämer",
  "kraemer", "vogt", "voigt", "seidel", "brandt", "schreiber", "schulte",
  "dietrich", "ziegler", "kühn", "kuehn", "kuhn", "pohl", "bergmann",
  "pfeiffer", "bärwald", "baerwald", "mustermann", "musterfrau", "lindner",
  "reuter", "reuther", "richter", "winkler", "beck", "kopp", "busch", "horn",
  "sauer", "arnold", "wolff", "pätzold", "paetzold", "kowalski", "nowak",
  "yilmaz", "kaya", "demir", "özdemir", "oezdemir", "nguyen", "rossi",
  "lindemann", "kramer", "franke", "simon", "ludwig", "winter", "kraus",
  "martin", "otto", "scholz", "günther", "guenther", "vogel", "stein", "jäger",
  "jaeger", "weiß", "weiss", "sommer", "groß", "gross", "heinrich", "haas",
  "graf", "engel", "thomas", "schwarz", "braun", "klein", "wolf", "fuchs",
  "kaiser", "könig", "koenig", "bauer", "koch"
]);

const POLYSEMOUS_WORDS = new Set([
  "schwarz", "weiß", "weiss", "braun", "klein", "groß", "gross", "jung", "alt",
  "lang", "kurz", "roth", "rot", "sauer", "ernst", "frank", "frei", "fromm",
  "klug", "stolz", "wild", "zart", "fein", "hart", "weich", "kalt", "warm",
  "winter", "sommer", "herbst", "frühling", "mai", "august",
  "wolf", "wölfe", "vogel", "vögel", "fuchs", "füchse", "hahn", "hase", "hasen",
  "bär", "bären", "hirsch", "adler", "fink", "strauß", "schwan",
  "koch", "bauer", "bäcker", "fleischer", "maurer", "zimmermann", "schreiner",
  "maler", "schmied", "schreiber", "könig", "kaiser", "fürst", "graf", "herzog",
  "baron", "richter", "jäger", "jaeger", "krieger", "schütze", "sänger", "ritter",
  "held", "meister", "schüler", "gast", "wirt", "freund", "feind",
  "rose", "rosen", "rosa", "jasmin", "iris", "flora", "viola", "lily", "lilly",
  "heide", "linde", "stern", "stein", "berg", "tal", "wald", "baum", "busch",
  "strauch", "blatt", "blume", "horn", "engel", "teufel", "kraft", "sturm",
  "wind", "schnee", "regen", "frost", "eis", "gold", "silber", "stahl", "eisen",
  "glas", "holz", "korn", "mehl", "brot", "salz", "pfeffer", "bier", "wein",
  "wasser", "brücke", "straße", "weg", "platz", "hof", "burg", "turm", "tor",
  "wand", "mauer", "dach", "zimmer", "kammer", "küche", "keller", "garten",
  "park", "feld", "wiese", "acker", "moor", "see", "teich", "bach", "fluss",
  "meer", "strand", "ufer", "insel", "hafen", "schiff", "boot", "wagen",
  "horst"
]);

const DETERMINERS_AND_ARTICLES = new Set([
  "ein", "eine", "einer", "einem", "einen", "eines",
  "kein", "keine", "keiner", "keinem", "keinen", "keines",
  "der", "die", "des", "dem", "den",
  "dieser", "diese", "dieses", "diesem", "diesen",
  "jener", "jene", "jenes", "jenem", "jenen",
  "solcher", "solche", "solches", "solchem", "solchen",
  "jeder", "jede", "jedes", "jedem", "jeden",
  "mancher", "manche", "manches", "manchem", "manchen",
  "welcher", "welche", "welches", "welchem", "welchen",
  "alle", "aller", "allen", "alles",
  "einige", "einiger", "einigen", "einiges",
  "etliche", "etlicher", "etlichen",
  "mehrere", "mehreren",
  "viele", "vieler", "vielen", "viel",
  "wenige", "weniger", "wenigen", "wenig",
  "mein", "meine", "meiner", "meinem", "meinen", "meines",
  "dein", "deine", "deiner", "deinem", "deinen", "deines",
  "sein", "seine", "seiner", "seinem", "seinen", "seines",
  "ihr", "ihre", "ihrer", "ihrem", "ihren", "ihres",
  "unser", "unsere", "unserer", "unserem", "unseren", "unseres",
  "euer", "eure", "eurer", "eurem", "euren", "eures",
  "im", "am", "zum", "zur", "beim", "vom", "ins", "ans", "aufs", "fürs", "durchs", "übers", "unters"
]);

const OBJECT_ACTION_WORDS = new Set([
  "gelegt", "legen", "legt", "legte", "gestellt", "stellen", "stellt", "stellte",
  "gepflückt", "pflücken", "pflückt", "pflückte", "pflanzte", "gepflanzte", "gepflanzt", "pflanzen",
  "blüht", "geblüht", "blühen", "verwelkt", "verwelken", "duftet", "geduftet", "duften",
  "gekauft", "kaufen", "kaufte", "geschenkt", "verschenkt", "schenkte",
  "gesichtet", "erlegt", "gejagt", "jagen", "jagt", "jagte", "gefressen", "fressen", "frass",
  "heulen", "geheult", "heult", "zwitschern", "gezwitschert", "fliegen", "geflogen", "abgeschossen",
  "blumenstrauß", "strauß", "vase", "blumentopf", "beet", "blumenbeet", "garten", "wald"
]);

const SALUTATIONS_PATTERN =
  "(?:Herrn?[ \\t]+Prof\\.[ \\t]+Dr\\.(?:[ \\t]+med\\.)?|Frau[ \\t]+Prof\\.[ \\t]+Dr\\.(?:[ \\t]+med\\.)?|" +
  "Herrn?[ \\t]+Dr\\.(?:[ \\t]+med\\.)?|Frau[ \\t]+Dr\\.(?:[ \\t]+med\\.)?|" +
  "Prof\\.[ \\t]+Dr\\.(?:[ \\t]+med\\.)?|Dr\\.[ \\t]+med\\.|Dr\\.[ \\t]+jur\\.|" +
  "Herrn?|Frau|Dr\\.|Prof\\.|Dipl\\.-Ing\\.|Familie|Ehepaar|Gebrüder|" +
  "RA|Rechtsanwalt|Rechtsanwältin|Notar|Notarin|Kollege|Kollegin|Tante|Onkel|Liebe(?:r)?|Hallo)";

const CONTEXTUAL_ROLE_PATTERN =
  "(?:Familie|Ehepaar|Gebrüder|Kollege|Kollegin|Patient|Patientin|Mandant|Mandantin|" +
  "Kunde|Kundin|Bewerber|Bewerberin|Zeuge|Zeugin|Angeklagte(?:r)?|Kläger(?:in)?|" +
  "Beklagte(?:r)?|Mieter(?:in)?|Vermieter(?:in)?|Eigentümer(?:in)?|Antragsteller(?:in)?|" +
  "Sachbearbeiter(?:in)?:?|Ansprechpartner(?:in)?:?|Prüfer(?:in)?:?|Gutachter(?:in)?:?|" +
  "Richter(?:in)?|Staatsanwalt|Staatsanwältin|Rechtsanwalt|Rechtsanwältin|" +
  "Kommissar(?:in)?|Abgeordnete(?:r)?|Bürgermeister(?:in)?|Minister(?:in)?|" +
  "Präsident(?:in)?|Kanzler(?:in)?|Direktor(?:in)?|Leiter(?:in)?|Chef(?:in)?|" +
  "Vorstand|Geschäftsführer(?:in)?|" +
  // family members in forms and letters ("Ihre Ehefrau Erika Mustermann")
  "Ehefrau|Ehemann|Ehegatte|Ehegattin|Ehepartner(?:in)?|Lebenspartner(?:in)?|Lebensgefährt(?:e|in)|" +
  "Tochter|Sohn|Mutter|Vater|Bruder|Schwester|Enkel(?:in)?)";

const TITLE_TOKENS = new Set([
  "herr", "herrn", "frau", "dr.", "dr", "prof.", "prof", "dipl.-ing.", "med.", "med", "jur.", "jur",
  "ra", "rechtsanwalt", "rechtsanwältin", "notar", "notarin",
  "familie", "ehepaar", "gebrüder", "kollege", "kollegin", "tante", "onkel"
]);

const ROLE_TOKENS = new Set([
  ...TITLE_TOKENS,
  "mandant", "mandantin", "patient", "patientin", "kunde", "kundin",
  "ehefrau", "ehemann", "ehegatte", "ehegattin", "ehepartner", "ehepartnerin", "lebenspartner", "lebenspartnerin",
  "lebensgefährte", "lebensgefährtin", "tochter", "sohn", "mutter", "vater", "bruder", "schwester", "enkel", "enkelin",
  "kollege", "kollegin", "zeuge", "zeugin", "richter", "richterin",
  "rechtsanwalt", "rechtsanwältin", "staatsanwalt", "staatsanwältin",
  "kläger", "klägerin", "beklagte", "beklagter", "angeklagte", "angeklagter",
  "mieter", "mieterin", "vermieter", "vermieterin", "eigentümer", "eigentümerin",
  "antragsteller", "antragstellerin", "bewerber", "bewerberin",
  "sachbearbeiter", "sachbearbeiterin", "ansprechpartner", "ansprechpartnerin",
  "prüfer", "prüferin", "gutachter", "gutachterin", "direktor", "direktorin",
  "leiter", "leiterin", "chef", "chefin", "vorstand", "geschäftsführer",
  "geschäftsführerin", "bürgermeister", "bürgermeisterin", "minister",
  "ministerin", "präsident", "präsidentin", "kanzler", "kanzlerin",
  "kommissar", "kommissarin", "abgeordnete", "abgeordneter"
]);

const INFORMAL_SALUTATIONS = new Set(["liebe", "lieber", "hallo", "tante", "onkel"]);

const NON_NAMES = new Set([
  "gestern", "heute", "morgen", "dann", "da", "dort", "hier", "nun",
  "deshalb", "jedoch", "trotzdem", "zudem", "leider", "zuvor", "danach",
  "damals", "bislang", "bisher", "bereits", "oft", "manchmal", "immer",
  "nie", "wieder", "auch", "selbst", "dies", "das", "alles", "nichts",
  "jemand", "niemand", "alle", "einer", "keiner", "wer", "was", "wie",
  "wo", "warum", "weshalb", "weswegen", "wann", "auf", "in", "an", "unter", "über",
  "sie", "er", "es", "wir", "ihr", "ihnen", "uns", "euch"
]);

const STOPWORDS = new Set([
  // Words that stand for a person without naming one ("als zweite versicherte Person eingetragen").
  "person", "personen", "mensch", "menschen", "leute", "persönlichkeit",
  ...DETERMINERS_AND_ARTICLES,
  ...NON_NAMES,
  ...ROLE_TOKENS,
  "gmbh", "ag", "kg", "ohg", "ug", "gbr", "ev", "partner", "kollegen",
  "abteilung", "bereich", "klinik", "praxis", "arztpraxis", "kanzlei", "anwaltskanzlei",
  "gericht", "amtsgericht", "landgericht", "behörde", "amt", "ministerium",
  "polizei", "staatsanwaltschaft", "vertrag", "kaufvertrag", "mietvertrag",
  "bericht", "antrag", "schreiben", "datum", "geburtsdatum", "nummer",
  "adresse", "anschrift", "wohnort", "telefon", "mobiltelefon", "konto",
  "bank", "bankverbindung", "sparkasse", "versicherung", "krankenkasse",
  "techniker", "allianz", "aok", "barmer", "dak", "iban", "bic", "swift",
  "steuer", "steuernummer", "identifikationsnummer", "unterschrift",
  "betreff", "bestätigung", "eingang", "unterlagen", "rechtsstreit",
  "interessen", "änderungen", "grüßen", "grüße", "sitzung", "schule",
  "urlaub", "italien", "deutschland", "berlin", "hamburg", "münchen",
  "köln", "frankfurt", "stuttgart", "düsseldorf", "leipzig", "dortmund",
  "essen", "bremen", "dresden", "hannover", "nürnberg", "duisburg",
  "bochum", "wuppertal", "bielefeld", "bonn", "münster", "karlsruhe",
  "mannheim", "augsburg", "wiesbaden", "mönchengladbach", "gelsenkirchen",
  "aachen", "braunschweig", "kiel", "chemnitz", "halle", "magdeburg",
  "freiburg", "krefeld", "mainz", "lübeck", "erfurt", "oberhausen",
  "rostock", "kassel", "hagen", "potsdam", "saarbrücken", "hamm",
  "ludwigshafen", "mülheim", "oldenburg", "osnabrück", "leverkusen",
  "heidelberg", "darmstadt", "solingen", "herne", "neuss", "regensburg",
  "paderborn", "ingolstadt", "offenbach", "fürth", "würzburg", "ulm",
  "heilbronn", "pforzheim", "wolfsburg", "göttingen", "bottrop", "reutlingen",
  "koblenz", "bremerhaven", "rems", "bergisch", "gladbach", "jena",
  "remscheid", "erlangen", "moers", "siegen", "hildesheim", "salzgitter",
  "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag",
  "januar", "februar", "märz", "april", "mai", "juni", "juli", "august",
  "september", "oktober", "november", "dezember", "straße", "strasse",
  "allee", "platz", "weg", "ring", "gasse", "ufer", "damm", "chaussee",
  "haus", "hause", "tisch", "garten", "wald", "dach", "auto", "erfolg", "nacht", "zeit"
]);

const VERBA_DICENDI_PATTERN =
  "(?:sagte|sagt|fragte|fragt|meinte|meint|erklärte|erklärt|erwiderte|erwidert|" +
  "berichtet|berichtete|rief|schrieb|schreibt|antwortete|antwortet|betonte|betont|" +
  "bestätigte|bestätigt|ergänzte|behauptete|forderte|riet|wusste|teilte[ \\t]+mit|gab[ \\t]+an|" +
  "informierte|kontaktierte|erwähnte|versicherte|bemerkte|wandte[ \\t]+ein)";

const ACTION_VERBS_PATTERN =
  "(?:geht|ging|gehe|kommen|kommt|kam|fährt|fuhr|reist|reiste|bleibt|blieb|" +
  "wohnt|wohnte|arbeitet|arbeitete|schläft|schlief|studiert|studierte|" +
  "telefoniert|telefonierte|besucht|besuchte|trifft|traf|hilft|half|sieht|sah|" +
  "unterschrieb|unterschrieben|unterschreibt|leitet|leitete|prüft|prüfte|geprüft|" +
  "übernimmt|übernahm|vertritt|vertrat|berät|beriet|klagt|klagte|kündigt|kündigte|" +
  "meldet|meldete|nimmt|nahm|erhält|erhielt|bittet|bat|dankt|dankte|wartet|wartete|" +
  "will|wollte|muss|musste|soll|sollte|kann|konnte|darf|durfte|möchte|möchten)";

const AUX_PARTICIPLE_VERBS_PATTERN =
  "(?:angerufen|gearbeitet|unterschrieben|vorgelegt|mitgeteilt|bestätigt|teilgenommen|" +
  "gesagt|gefragt|geschrieben|geprüft|eingereicht|beantragt|überwiesen|bezahlt|" +
  "gekündigt|zugestimmt|abgelehnt|berichtet|erklärt|vereinbart|empfangen|gesendet|" +
  "verlassen|besucht|getroffen|geholfen|übernommen|geleitet)";

// Words that only end like a street ("…tor", "…ring", "…feld") but are none (B5). Checked against the last word.
const NOT_STREETS = /^(?:monitor|motor|doktor|direktor|faktor|sektor|traktor|reaktor|editor|vektor|rotor|indikator|moderator|navigator|generator|kalkulator|projektor|inspektor|autor|mentor|spring|string|ring|bring|tal|feld|park|markt|hof|weg|berg|wald|garten)$/i;
// Business words followed by a number that are no street above an address line (B5).
const BUSINESS_WORDS = /^(?:auftrag|auftragsnummer|kunde|kunden|kundengruppe|kundennummer|kapitel|stand|version|gruppe|position|pos|konto|vertrag|vertragsnummer|bestellung|bestellnummer|lieferung|lieferschein|raum|zimmer|etage|stock|ebene|abschnitt|paragraph|anlage|tabelle|abbildung|band|heft|ausgabe|jahrgang|klasse|stufe|level|termin|tag|woche|monat|jahr|quartal|order|customer|chapter|section|room|floor|page)$/i;
// ISO country codes accepted for a BIC without "BIC"/"SWIFT" label (B27).
const BIC_COUNTRIES = new Set("AD AE AT AU BA BE BG BR CA CH CN CY CZ DE DK EE ES FI FR GB GI GR HR HU IE IL IN IS IT JP KR LI LT LU LV MC ME MK MT MX NL NO NZ PL PT RO RS RU SA SE SG SI SK SM TR UA US VA ZA".split(" "));

function makeEntityId() {
  return Math.random().toString(36).substring(2, 10);
}

function isGranularCatMode(categories) {
  const g = categories && categories.granularity ? categories.granularity : "coarse";
  return g === "granular" || g === "fine";
}

function isGrammaticallyExcluded(text, start, end) {
  const candidate = text.slice(start, end).toLowerCase();
  const beforeText = text.slice(0, start).trimEnd();
  const wordsBefore = beforeText.match(/[a-zA-ZäöüÄÖÜß]+/g) || [];

  if (wordsBefore.length > 0) {
    const lastWord = wordsBefore[wordsBefore.length - 1].toLowerCase();
    if (DETERMINERS_AND_ARTICLES.has(lastWord)) {
      if (
        lastWord === "das" &&
        (COMMON_FIRST_NAMES.has(candidate) ||
          COMMON_LAST_NAMES.has(candidate) ||
          ["rose", "sommer", "wolf", "frank", "vogel", "ernst"].includes(candidate))
      ) {
        // allow 'das Rose nach hause geht'
      } else {
        return true;
      }
    }

    if (
      POLYSEMOUS_WORDS.has(candidate) &&
      ["ist", "war", "sind", "waren", "wird", "wurde", "bleibt", "blieb", "sehr", "ziemlich", "etwas", "ganz", "zu", "so", "wie", "voll", "voller"].includes(lastWord)
    ) {
      return true;
    }

    if (wordsBefore.length >= 2) {
      const secondLast = wordsBefore[wordsBefore.length - 2].toLowerCase();
      if (DETERMINERS_AND_ARTICLES.has(secondLast)) {
        if (ROLE_TOKENS.has(lastWord)) {
          // e.g. 'Unser Mandant Schneider'
        } else if (
          secondLast === "das" &&
          ["rose", "sommer", "wolf", "frank", "vogel", "ernst"].includes(candidate) &&
          !["voller", "ganzer", "reiner"].includes(lastWord)
        ) {
          // allow
        } else {
          return true;
        }
      }
    }
  }

  const beforeParts = text.slice(Math.max(0, start - 45), start).split(/[.!?\n]/);
  const beforeWin = beforeParts[beforeParts.length - 1] || "";
  const afterWin = (text.slice(end, Math.min(text.length, end + 45)).split(/[.!?\n]/)[0]) || "";
  const windowWords = (beforeWin + " " + afterWin).toLowerCase().match(/[a-zA-ZäöüÄÖÜß]+/g) || [];
  if (POLYSEMOUS_WORDS.has(candidate)) {
    for (const w of windowWords) {
      if (OBJECT_ACTION_WORDS.has(w)) return true;
    }
  }

  const afterImmediate = text.slice(end, Math.min(text.length, end + 25));
  if (/^-(?:Straße|Strasse|Str\.|Weg|Platz|Allee|Ring|Gasse|Ufer|Chaussee|Damm|Institut|Klinik|Schule|GmbH|AG)\b/i.test(afterImmediate)) {
    return true;
  }

  return false;
}

function hasPersonContext(text, start, end) {
  if (isGrammaticallyExcluded(text, start, end)) return false;

  const beforeSlice = text.slice(Math.max(0, start - 60), start);
  const afterSlice = text.slice(end, Math.min(text.length, end + 60));

  const salOrRoleRe = new RegExp(`(?:${SALUTATIONS_PATTERN}|${CONTEXTUAL_ROLE_PATTERN})[ \\t:]*$`);
  if (salOrRoleRe.test(beforeSlice)) return true;
  if (/(?:Name|Vorname|Nachname|Patient|Mandant|Kunde|Vertragspartner|gez\.|gezeichnet|Unterschrift)[: \t]+$/i.test(beforeSlice)) {
    return true;
  }

  const vdBeforeRe = new RegExp(`(?:^|[^a-zA-ZäöüÄÖÜß])${VERBA_DICENDI_PATTERN}[ \\t]+$`);
  const vdAfterRe = new RegExp(`^[ \\t]+${VERBA_DICENDI_PATTERN}(?![a-zA-ZäöüÄÖÜß])`);
  if (vdBeforeRe.test(beforeSlice) || vdAfterRe.test(afterSlice)) return true;

  const actionAfterRe = new RegExp(`^[ \\t]+${ACTION_VERBS_PATTERN}(?![a-zA-ZäöüÄÖÜß])`);
  if (actionAfterRe.test(afterSlice)) return true;

  const auxAfterRe = new RegExp(`^[ \\t]+(?:hat|hatte|ist|war|wird|wurde)\\b[^.!?\\n;]{0,45}?\\b${AUX_PARTICIPLE_VERBS_PATTERN}\\b`);
  if (auxAfterRe.test(afterSlice)) return true;

  if (/(?:^|[^a-zA-ZäöüÄÖÜß])(?:dass|das|weil|ob|wenn|als|während|nachdem|bevor|obwohl|damit|falls)[ \t]+$/.test(beforeSlice)) {
    const subordVerbRe = new RegExp(`\\b(?:${ACTION_VERBS_PATTERN}|${VERBA_DICENDI_PATTERN}|krank|verhindert|anwesend|informiert|einverstanden)\\b`);
    if (subordVerbRe.test(afterSlice.slice(0, 50))) return true;
  }

  if (/(?:^|[^a-zA-ZäöüÄÖÜß])(?:mit|für|von|bei|dank|gegenüber|laut|gemäß)[ \t]+$/.test(beforeSlice)) {
    return true;
  }
  if (/(?:warten|wartet|wartete|warteten|freuen|freut|hoffen|hofft)[ \t]+auf[ \t]+$/i.test(beforeSlice)) {
    return true;
  }

  const mPrev = beforeSlice.match(/([A-ZÄÖÜ][a-zäöüß]{2,20})[ \t]+$/);
  if (mPrev) {
    const prevW = mPrev[1].toLowerCase();
    if (COMMON_FIRST_NAMES.has(prevW) && !POLYSEMOUS_WORDS.has(prevW)) return true;
  }
  const mNext = afterSlice.match(/^[ \t]+([A-ZÄÖÜ][a-zäöüß]{2,25})(?![a-zA-ZäöüÄÖÜß])/);
  if (mNext) {
    const nextW = mNext[1].toLowerCase();
    if (COMMON_LAST_NAMES.has(nextW) && !POLYSEMOUS_WORDS.has(nextW)) return true;
  }

  return false;
}

function isWhitelistedText(text, exceptions) {
  if (!exceptions || !Array.isArray(exceptions.whitelist) || exceptions.whitelist.length === 0) {
    return false;
  }
  const caseSens = Boolean(exceptions.case_sensitive);
  const textCheck = caseSens ? text : text.toLowerCase();
  for (const rawItem of exceptions.whitelist) {
    const item = String(rawItem || "").trim();
    if (!item) continue;
    const itemCheck = caseSens ? item : item.toLowerCase();
    if (itemCheck === textCheck) {
      return true;
    }
    // Exact word/token boundaries (Unicode-aware): e.g. "Frank" must not falsely match "Frankfurt"
    const escapedItem = itemCheck.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const itemRegex = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedItem}([^\\p{L}\\p{N}]|$)`, "u");
    if (itemRegex.test(textCheck)) {
      return true;
    }
  }
  return false;
}

/**
 * Applies the whitelist to one match: whitelisted words at the start or end are cut off, the rest stays redacted.
 * Whitelisting "Peter" keeps "Müller" of "Peter Müller" redacted; "10115 Berlin" with "Berlin" whitelisted keeps
 * "10115". Returns null when nothing is left, otherwise {text, offset} (offset of the remaining text in the match).
 */
function trimWhitelisted(text, exceptions) {
  if (!exceptions || !Array.isArray(exceptions.whitelist) || exceptions.whitelist.length === 0) return { text, offset: 0 };
  const caseSens = Boolean(exceptions.case_sensitive);
  const norm = (v) => (caseSens ? v : v.toLowerCase()).replace(/^[.,;:!?"'()[\]{}<>«»„“”]+|[.,;:!?"'()[\]{}<>«»„“”]+$/g, "");
  const items = new Set(exceptions.whitelist.map((w) => norm(String(w || "").trim())).filter(Boolean));
  const whole = norm(text.trim());
  if (items.has(whole)) return null;
  // Multi-word whitelist entries are matched as a whole only.
  const tokens = [];
  const tokRe = /\S+/g;
  let t;
  while ((t = tokRe.exec(text)) !== null) tokens.push({ s: t.index, e: t.index + t[0].length, v: norm(t[0]) });
  let first = 0;
  let last = tokens.length - 1;
  while (first <= last && items.has(tokens[first].v)) first++;
  while (last >= first && items.has(tokens[last].v)) last--;
  if (first > last) return null;
  if (first === 0 && last === tokens.length - 1) return { text, offset: 0 };
  return { text: text.substring(tokens[first].s, tokens[last].e), offset: tokens[first].s };
}

/** ISO 13616 check (mod 97 = 1). */
function isValidIban(raw) {
  const iban = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

function spanOverlaps(s1, e1, spans) {
  if (s1 < 0 || e1 < 0) return false;
  for (const [s2, e2] of spans) {
    if (!(e1 <= s2 || s1 >= e2)) return true;
  }
  return false;
}

function emitGranularNameParts(
  matches,
  nameText,
  start,
  end,
  confidence,
  source,
  categories,
  salutationText = "",
  salutationStart = -1,
  salutationEnd = -1,
  fieldLabel = "",
  discoveredFirst = null,
  discoveredLast = null
) {
  const granular = isGranularCatMode(categories);
  const tokens = nameText.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return;

  let coreTokens = [];
  const embeddedTitles = [];
  const cleanTitleSet = new Set(Array.from(TITLE_TOKENS).map((t) => t.replace(/\.$/, "")));

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    const cleanTok = tok.toLowerCase().replace(/\.$/, "");
    if (cleanTitleSet.has(cleanTok) && idx < tokens.length - 1) {
      embeddedTitles.push(tok);
    } else {
      coreTokens = tokens.slice(idx);
      break;
    }
  }

  if (coreTokens.length > 0) {
    if (coreTokens.length >= 2) {
      if (discoveredFirst) {
        for (const fnTok of coreTokens.slice(0, -1)) {
          if (!STOPWORDS.has(fnTok.toLowerCase()) && fnTok.length >= 2) {
            discoveredFirst.add(fnTok);
          }
        }
      }
      if (discoveredLast) {
        const lnTok = coreTokens[coreTokens.length - 1];
        if (!STOPWORDS.has(lnTok.toLowerCase()) && lnTok.length >= 2) {
          discoveredLast.add(lnTok);
        }
      }
    } else {
      const singleTok = coreTokens[0];
      const fl = (fieldLabel || "").toLowerCase().trim();
      const salClean = (salutationText || "").toLowerCase().trim();
      const isFormalSal = Boolean(salClean && !INFORMAL_SALUTATIONS.has(salClean)) || embeddedTitles.length > 0;
      if (!STOPWORDS.has(singleTok.toLowerCase()) && singleTok.length >= 2) {
        if (fl === "nachname" || isFormalSal) {
          if (discoveredLast) discoveredLast.add(singleTok);
        } else if (fl === "vorname") {
          if (discoveredFirst) discoveredFirst.add(singleTok);
        }
      }
    }
  }

  if (!granular) {
    if (categories.names) {
      matches.push({ id: makeEntityId(), text: nameText.trim(), category: "name", start, end, confidence, source });
    }
    return;
  }

  if (salutationText && categories.titles) {
    for (const tTok of salutationText.trim().split(/\s+/)) {
      matches.push({ id: makeEntityId(), text: tTok, category: "title", start: salutationStart, end: salutationEnd, confidence, source });
    }
  }
  if (embeddedTitles.length > 0 && categories.titles) {
    for (const et of embeddedTitles) {
      matches.push({ id: makeEntityId(), text: et, category: "title", start, end, confidence, source });
    }
  }
  if (coreTokens.length === 0) return;

  if (coreTokens.length >= 2) {
    if (categories.first_names) {
      for (const fnTok of coreTokens.slice(0, -1)) {
        matches.push({ id: makeEntityId(), text: fnTok, category: "first_name", start, end, confidence, source });
      }
    }
    if (categories.last_names) {
      matches.push({ id: makeEntityId(), text: coreTokens[coreTokens.length - 1], category: "last_name", start, end, confidence, source });
    }
  } else {
    const singleTok = coreTokens[0];
    const tokLower = singleTok.toLowerCase();
    const fl = (fieldLabel || "").toLowerCase().trim();
    const salClean = (salutationText || "").toLowerCase().trim();
    const isFormalSal = Boolean(salClean && !INFORMAL_SALUTATIONS.has(salClean)) || embeddedTitles.length > 0;

    let isFirst = false;
    if (["vorname", "first_name", "first_names"].includes(fl)) {
      isFirst = true;
    } else if (["nachname", "last_name", "last_names"].includes(fl)) {
      isFirst = false;
    } else if (isFormalSal) {
      isFirst = false;
    } else if (COMMON_LAST_NAMES.has(tokLower) && !COMMON_FIRST_NAMES.has(tokLower)) {
      isFirst = false;
    } else if (COMMON_FIRST_NAMES.has(tokLower) && !COMMON_LAST_NAMES.has(tokLower)) {
      isFirst = true;
    } else if (COMMON_FIRST_NAMES.has(tokLower)) {
      isFirst = Boolean(categories.first_names);
    }

    if (isFirst && categories.first_names) {
      matches.push({ id: makeEntityId(), text: singleTok, category: "first_name", start, end, confidence, source });
    } else if (!isFirst && categories.last_names) {
      matches.push({ id: makeEntityId(), text: singleTok, category: "last_name", start, end, confidence, source });
    }
  }
}

function detectPiiRulesJS(text, categories, exceptions, knownNames = null, sensitivity = "balanced") {
  if (!text) return [];
  const matches = [];
  const isGranular = isGranularCatMode(categories);
  const nonNameSpans = [];
  const normSens = ["minimal", "low", "balanced", "high", "maximum"].includes(sensitivity) ? sensitivity : "balanced";

  // 1. E-Mails
  const emailRe = /\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b/g;
  let m;
  while ((m = emailRe.exec(text)) !== null) {
    nonNameSpans.push([m.index, m.index + m[0].length]);
    if (categories.emails) {
      matches.push({ id: makeEntityId(), text: m[0], category: "email", start: m.index, end: m.index + m[0].length, confidence: 1.0, source: "regex" });
    }
  }

  // 2. IBAN & BIC
  const foundIbans = [];
  const ibanPositions = [];
  // Letters are allowed after the check digits (GB, NL, FR, IT, CH …) and in lower case. Purely numeric IBANs are
  // accepted as before; ones with letters must pass the mod-97 check so ordinary words are not taken for IBANs.
  const ibanRe = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi;
  while ((m = ibanRe.exec(text)) !== null) {
    const val = m[0].trim();
    const clean = val.replace(/\s+/g, "");
    const numericBody = /^\d+$/.test(clean.slice(4));
    if (clean.length >= 15 && (isValidIban(clean) || (numericBody && /^[A-Z]{2}/.test(clean)))) {
      foundIbans.push(clean);
      ibanPositions.push(m.index);
      nonNameSpans.push([m.index, m.index + m[0].length]);
      if (categories.ibans) {
        matches.push({ id: makeEntityId(), text: val, category: "iban", start: m.index, end: m.index + m[0].length, confidence: 0.98, source: "regex" });
      }
    }
  }

  const wantBic = isGranular ? categories.bics : categories.ibans;
  if (wantBic) {
    const bicCat = isGranular ? "bic" : "iban";
    const bicRe = /\b(?:BIC|SWIFT)?[:\s]*([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g;
    while ((m = bicRe.exec(text)) !== null) {
      const val = m[1] || m[0];
      // Without a "BIC"/"SWIFT" label any 8- or 11-letter capital word (product codes,
      // OCR noise) would count. Unlabelled BICs need a real country code and an IBAN close by (B27).
      const labelled = /BIC|SWIFT/.test(m[0]);
      if (!labelled) {
        const nearIban = ibanPositions.some((p) => Math.abs(p - m.index) <= 200);
        if (!nearIban || !BIC_COUNTRIES.has(val.substring(4, 6))) continue;
      }
      if (val.length === 8 || val.length === 11) {
        matches.push({ id: makeEntityId(), text: val, category: bicCat, start: m.index, end: m.index + m[0].length, confidence: 0.95, source: "regex" });
      }
    }
  }

  // 3. Phones
  if (categories.phones) {
    // German numbers plus any international one (+43, +41, +1 …): "+" / "00", a country code of 1–3 digits and
    // at least two further digit groups.
    const phoneRe = /(?<![A-Za-z0-9#\-])(?:(?:\+|00)49[ \t\-\/]*(?:[1-9][0-9]{1,4}[ \t\-\/]+)?[0-9]{3,9}|(?:\+|00)(?!49)[1-9][0-9]{0,2}[ \t\-\/.]*\(?[0-9]{1,5}\)?(?:[ \t\-\/.]+[0-9]{2,9}){1,4}|(?:\+|00)(?!49)[1-9][0-9]{6,14}|0[1-9][0-9]{1,4}[ \t\-\/]+[0-9]{3,9})(?:[ \t\-\/]+[0-9]{1,5})?\b/g;
    while ((m = phoneRe.exec(text)) !== null) {
      const val = m[0].trim();
      const cleanDigits = val.replace(/\D/g, "");
      if (cleanDigits.length >= 7 && cleanDigits.length <= 15 && !foundIbans.some((ib) => ib.includes(cleanDigits))) {
        nonNameSpans.push([m.index, m.index + m[0].length]);
        matches.push({ id: makeEntityId(), text: val, category: "phone", start: m.index, end: m.index + m[0].length, confidence: 0.90, source: "regex" });
      }
    }

    // Labelled numbers ("Tel: …", "Mobil: …"): the label is the evidence, so the value is
    // taken even when OCR misreads digits (O/0, l/1, S/5, B/8 …) or a fold breaks the number.
    const labelPhoneRe = /\b(?:Tel(?:efon)?|Telephone|Phone|Mobil(?:telefon)?|Mob|Handy|Fon|Fax)\.?[ \t]*[:.]?[ \t]*((?:\+|00)?[0-9OoIlSsBPZ()][0-9OoIlSsBPZ() \t\/.\-]{4,24})/gi;
    while ((m = labelPhoneRe.exec(text)) !== null) {
      // Stop at a column gap and drop trailing non-digits (OCR noise next to the number).
      const val = m[1].split(/[ \t]{3,}/)[0].replace(/[^0-9]+$/, "").trim();
      const start = m.index + m[0].lastIndexOf(m[1]);
      const end = start + val.length;
      const digits = (val.match(/\d/g) || []).length;
      const digitLike = (val.match(/[0-9OoIlSsBPZ]/g) || []).length;
      if (digits >= 4 && digitLike >= 6 && !spanOverlaps(start, end, nonNameSpans)) {
        nonNameSpans.push([start, end]);
        matches.push({ id: makeEntityId(), text: val, category: "phone", start, end, confidence: 0.85, source: "label" });
      }
    }
  }

  // 4. Tax IDs & Social Security IDs
  if (categories.tax_ids) {
    const taxIdRe = /(?:Steuer[- ]?ID|IdNr|Identifikationsnummer)?[:\s]*\b(\d{2}[ \t]?\d{3}[ \t]?\d{3}[ \t]?\d{3})\b/gi;
    while ((m = taxIdRe.exec(text)) !== null) {
      const val = m[1] || m[0];
      const cleanDigits = val.replace(/\D/g, "");
      if (cleanDigits.length === 11 && !foundIbans.some((ib) => ib.includes(cleanDigits))) {
        matches.push({ id: makeEntityId(), text: val, category: "tax_id", start: m.index, end: m.index + m[0].length, confidence: 0.95, source: "regex" });
      }
    }

    const steuernrRe = /(?:Steuernummer|St\.-Nr\.)?[:\s]*\b(\d{2,3}[\/\s]\d{3}[\/\s]\d{4,5})\b/gi;
    while ((m = steuernrRe.exec(text)) !== null) {
      const val = m[1] || m[0];
      matches.push({ id: makeEntityId(), text: val, category: "tax_id", start: m.index, end: m.index + m[0].length, confidence: 0.95, source: "regex" });
    }
  }

  const wantSsn = isGranular ? categories.social_security_ids : categories.tax_ids;
  if (wantSsn) {
    const ssnCat = isGranular ? "social_security_id" : "tax_id";
    const rvnrRe = /\b\d{2}[ \t]?(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}[ \t]?[A-Z][ \t]?\d{3}\b/g;
    while ((m = rvnrRe.exec(text)) !== null) {
      matches.push({ id: makeEntityId(), text: m[0], category: ssnCat, start: m.index, end: m.index + m[0].length, confidence: 0.95, source: "regex" });
    }
    const kvnrRe = /\b[A-Z]\d{9}\b/g;
    while ((m = kvnrRe.exec(text)) !== null) {
      const prefix = text.substring(Math.max(0, m.index - 35), m.index).toLowerCase();
      if (["invoice", "rechnung", "order", "bestell", "artikel", "item", "sku", "tracking", "#"].some((w) => prefix.includes(w))) {
        continue;
      }
      matches.push({ id: makeEntityId(), text: m[0], category: ssnCat, start: m.index, end: m.index + m[0].length, confidence: 0.90, source: "regex" });
    }
  }

  // 5. Addresses (Streets + House Numbers, PLZ + Cities)
  // OCR often misreads "straße" ("Hauptstrans 88", "Leopoldstrabe 14"). From the standard level on, these misreadings
  // count as a street too – a house number has to follow, which keeps words like "Strafe" out.
  const ocrStreet = ["minimal", "low"].includes(normSens) ? "" : "strans|strabe|straBe|stra8e|strafse|strasze|strase|";
  const streetRe = new RegExp(String.raw`\b((?:[A-ZÄÖÜ][a-zäöüß]{1,25}[ \t\-])?[A-ZÄÖÜ][a-zäöüß]{2,25}(?:straße|strasse|str\.|STREET_OCRweg|platz|allee|ring|gasse|ufer|chaussee|damm|zeile|pfad|kamp|anger|steig|stieg|blick|berg|tal|grund|hang|rain|höhe|hoehe|feld|garten|park|markt|tor|brücke|wald|eck|hof|Straße|Strasse|Str\.|Weg|Platz|Allee|Ring|Gasse|Ufer|Chaussee|Damm|Blick|Berg|Tal|Feld))[ \t]+(\d{1,4}[ \t]?[a-zA-Z]?(?:[ \t]?[\/\-][ \t]?\d{1,4})?)\b`.replace("STREET_OCR", ocrStreet), "g");
  // B5: no /i flag any more – with it the capital-letter checks above were void ("sowie Direktor 4").
  // At most 3 spaces between PLZ and city: OCR of two-column layouts puts both columns on one
  // line, and an unlimited gap joined the PLZ of one column with the city of the other.
  const plzCityRe = /\b(\d{5})[ \t]{1,3}([A-ZÄÖÜ][a-zäöüß]{2,25}(?:[- ][A-ZÄÖÜ][a-zäöüß]{2,25})?)(?![A-Za-zÄÖÜäöüß])/g;
  const cityPlzRe = /\b([A-ZÄÖÜ][a-zäöüß]{2,25}),?[ \t]{1,3}(\d{5})\b/g;

  const streetMatches = [];
  while ((m = streetRe.exec(text)) !== null) {
    // B5: "Der Faktor 2", "Direktor 4" – words that only end like a street.
    const lastWord = m[1].split(/[ \t\-]/).pop();
    if (NOT_STREETS.test(lastWord)) continue;
    // A form label in front ("Wohnort Leopoldstraße 14") is not part of the address.
    let start = m.index, full = m[0], street = m[1];
    const label = street.match(/^(Wohnort|Wohnhaft|Adresse|Anschrift|Lieferadresse|Rechnungsadresse|Sitz|Standort)[ \t]+/);
    if (label) {
      start += label[0].length; full = full.slice(label[0].length); street = street.slice(label[0].length);
    }
    nonNameSpans.push([start, m.index + m[0].length]);
    streetMatches.push({ full, street, house: m[2], index: start, end: m.index + m[0].length });
  }

  const plzMatches = [];
  while ((m = plzCityRe.exec(text)) !== null) {
    nonNameSpans.push([m.index, m.index + m[0].length]);
    plzMatches.push({ full: m[0], plz: m[1], city: m[2], index: m.index, end: m.index + m[0].length });
  }
  while ((m = cityPlzRe.exec(text)) !== null) {
    if (!spanOverlaps(m.index, m.index + m[0].length, nonNameSpans)) {
      nonNameSpans.push([m.index, m.index + m[0].length]);
      plzMatches.push({ full: m[0], plz: m[2], city: m[1], index: m.index, end: m.index + m[0].length });
    }
  }

  // Address blocks: "Word 12" in the lines just above a "PLZ City" / "City, PLZ" line is the
  // street, even when OCR misspells the street name ("Musterfeldbtick 10").
  if (plzMatches.length > 0) {
    // B5: house numbers have at most 3 digits here ("Stand 2024", "Auftrag 4711" are no streets), and only the
    // nearest non-empty line above the PLZ line counts.
    const blockStreetRe = /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]{3,30}(?:[ \t][A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]{2,30})?)[ \t]{1,3}(\d{1,3}[a-zA-Z]?)\b/g;
    for (const pm of plzMatches) {
      const lineStart = text.lastIndexOf("\n", pm.index - 1) + 1;
      if (lineStart === 0) continue;
      let from = text.lastIndexOf("\n", lineStart - 2) + 1;
      // skip one empty line between street and PLZ line
      if (text.slice(from, lineStart).trim() === "" && from > 0) from = text.lastIndexOf("\n", from - 2) + 1;
      const region = text.slice(from, lineStart);
      blockStreetRe.lastIndex = 0;
      while ((m = blockStreetRe.exec(region)) !== null) {
        const start = from + m.index;
        const end = start + m[0].length;
        const word = m[1].toLowerCase();
        if (STOPWORDS.has(word) || spanOverlaps(start, end, nonNameSpans)) continue;
        if (/^(seite|page|invoice|rechnung|item|qty|nr|no|total|summe|artikel)$/i.test(word)) continue;
        if (BUSINESS_WORDS.test(word.split(/[ \t]/)[0]) || NOT_STREETS.test(m[1].split(/[ \t\-]/).pop())) continue;
        nonNameSpans.push([start, end]);
        streetMatches.push({ full: m[0], street: m[1], house: m[2], index: start, end });
      }
    }
  }

  if (!isGranular) {
    if (categories.addresses) {
      for (const sm of streetMatches) {
        matches.push({ id: makeEntityId(), text: sm.full, category: "address", start: sm.index, end: sm.end, confidence: 0.95, source: "regex" });
      }
      for (const pm of plzMatches) {
        matches.push({ id: makeEntityId(), text: pm.full, category: "address", start: pm.index, end: pm.end, confidence: 0.90, source: "regex" });
      }
    }
  } else {
    for (const sm of streetMatches) {
      if (categories.streets) {
        matches.push({ id: makeEntityId(), text: sm.street, category: "street", start: sm.index, end: sm.index + sm.street.length, confidence: 0.95, source: "regex" });
      }
      if (categories.house_numbers) {
        matches.push({ id: makeEntityId(), text: sm.house, category: "house_number", start: sm.end - sm.house.length, end: sm.end, confidence: 0.95, source: "regex" });
      }
    }
    for (const pm of plzMatches) {
      if (categories.zip_codes) {
        matches.push({ id: makeEntityId(), text: pm.plz, category: "zip_code", start: pm.index, end: pm.index + pm.plz.length, confidence: 0.92, source: "regex" });
      }
      if (categories.cities) {
        matches.push({ id: makeEntityId(), text: pm.city, category: "city", start: pm.end - pm.city.length, end: pm.end, confidence: 0.90, source: "regex" });
      }
    }
  }

  // 6. Dates & Birth Dates
  const birthRe = /(?:geboren[ \t]+am|geb\.|Geburtsdatum[: \t]*)[ \t]*(\d{1,2}\.[ \t]*(?:\d{1,2}|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\.?[ \t]*\d{4})/gi;
  // 12.03.1985, 12.03.85, 12/03/1985, 1985-03-12, 12. März 1985 / 12 March 1985.
  const MONTHS_RE = "Januar|Jänner|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|January|February|March|May|June|July|October|December|Jan|Feb|Mär|Mrz|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Oct|Nov|Dez|Dec";
  const dateRe = new RegExp(
    // A two-digit year needs a two-digit day and month ("12.03.85"); "1.5.15" is far more often a version number.
    "\\b(?:(?:0?[1-9]|[12][0-9]|3[01])\\.(?:0?[1-9]|1[012])\\.(?:19|20)\\d\\d" +
      "|(?<![\\d.])(?:0[1-9]|[12][0-9]|3[01])\\.(?:0[1-9]|1[012])\\.\\d\\d(?![\\d.])" +
      "|(?:0?[1-9]|[12][0-9]|3[01])\\/(?:0?[1-9]|1[012])\\/(?:19|20)\\d\\d" +
      "|(?:19|20)\\d\\d-(?:0[1-9]|1[012])-(?:0[1-9]|[12][0-9]|3[01])" +
      "|(?:0?[1-9]|[12][0-9]|3[01])\\.?[ \\t]+(?:" + MONTHS_RE + ")\\.?[ \\t]+(?:19|20)\\d\\d)\\b",
    "gi",
  );

  if (!isGranular) {
    if (categories.dates) {
      while ((m = birthRe.exec(text)) !== null) {
        const val = (m[1] || m[0]).trim();
        matches.push({ id: makeEntityId(), text: val, category: "date", start: m.index, end: m.index + m[0].length, confidence: 0.95, source: "regex" });
      }
      while ((m = dateRe.exec(text)) !== null) {
        matches.push({ id: makeEntityId(), text: m[0], category: "date", start: m.index, end: m.index + m[0].length, confidence: 0.85, source: "regex" });
      }
    }
  } else {
    const birthDateValues = new Set();
    while ((m = birthRe.exec(text)) !== null) {
      const val = (m[1] || m[0]).trim();
      birthDateValues.add(val);
      if (categories.birth_dates) {
        matches.push({ id: makeEntityId(), text: val, category: "birth_date", start: m.index, end: m.index + m[0].length, confidence: 0.95, source: "regex" });
      }
    }
    if (categories.general_dates) {
      while ((m = dateRe.exec(text)) !== null) {
        const val = m[0].trim();
        if (birthDateValues.has(val)) continue;
        matches.push({ id: makeEntityId(), text: val, category: "general_date", start: m.index, end: m.index + m[0].length, confidence: 0.85, source: "regex" });
      }
    }
  }

  // 6b. Values after a field label. On a poor scan the value itself is often garbled
  // ("Geburtsdatum 12051669", "(EMail erkamusiermann@webde", "Wohnort Leopoldstrans 14 80802 Manche"),
  // so the value patterns above miss it – but the label is legible and is the evidence.
  // Each value stops at a column gap (3+ spaces) or the end of the line.
  const labelValueEnd = (raw) => raw.split(/[ \t]{3,}/)[0].replace(/[\s,;]+$/, "");
  const coveredByMatch = (start, end) => matches.some((x) => x.start <= start && x.end >= end);
  // Matches that lie inside a longer labelled value are replaced by it (one finding for the whole address).
  const absorbInto = (start, end, cats) => {
    for (let i = matches.length - 1; i >= 0; i--) {
      if (cats.includes(matches[i].category) && matches[i].start >= start && matches[i].end <= end) matches.splice(i, 1);
    }
  };

  if (categories.emails) {
    const labelEmailRe = /(?:^|[^A-Za-zÄÖÜäöüß])(?:E-?Mail(?:-Adresse)?|Mail)[ \t]*[:.]?[ \t]*([^\n]{5,90})/gi;
    while ((m = labelEmailRe.exec(text)) !== null) {
      // The whole value up to a column gap: OCR often splits an address ("erika mustermann@web de"),
      // and it ends before the next field label on the same line ("… Telefon: 0171 …").
      const val = labelValueEnd(m[1].split(/[ \t]+(?=(?:Tel(?:efon)?|Fax|Mobil|Handy|Web|www\.|Internet|IBAN)\b)/i)[0]).replace(/^[(\"'„“]+/, "").replace(/[.:)]+$/, "");
      if (!/@|\w\.\w{2,}/.test(val) || val.length > 70) continue; // "E-Mail senden" is no address
      const start = m.index + m[0].length - m[1].length + m[1].indexOf(val);
      const end = start + val.length;
      if (coveredByMatch(start, end)) continue;
      nonNameSpans.push([start, end]);
      matches.push({ id: makeEntityId(), text: val, category: "email", start, end, confidence: 0.85, source: "label" });
    }
  }

  const birthCat = isGranular ? (categories.birth_dates ? "birth_date" : null) : (categories.dates ? "date" : null);
  if (birthCat) {
    // No /i flag: it would let the OCR-confusion class [OoIlSB] match any letter ("24.08.1981 in" → "… i").
    const labelBirthRe = /\b(?:[Gg]eburtsdatum|[Gg]eburtstag|[Gg]eb\.?-?(?:[Dd]atum|[Tt]ag)|[Gg]eb\.|[Gg]eboren(?:[ \t]+am)?|[Dd]ate of [Bb]irth|[Bb]irth ?[Dd]ate|DOB)[ \t]*[:.]?[ \t]*([0-9OolISB][0-9OolISB. \/-]{4,12}[0-9OolISB])/g;
    while ((m = labelBirthRe.exec(text)) !== null) {
      const val = labelValueEnd(m[1]);
      if ((val.match(/[0-9OolISB]/g) || []).length < 6 || (val.match(/\d/g) || []).length < 4) continue;
      const start = m.index + m[0].length - m[1].length;
      const end = start + val.length;
      if (coveredByMatch(start, end)) continue;
      nonNameSpans.push([start, end]);
      matches.push({ id: makeEntityId(), text: val, category: birthCat, start, end, confidence: 0.85, source: "label" });
    }
  }

  const addrCat = isGranular ? (categories.streets ? "street" : null) : (categories.addresses ? "address" : null);
  if (addrCat) {
    const labelAddrRe = /\b(?:Wohnort|Wohnhaft(?:[ \t]+in)?|Anschrift|Adresse|Wohnadresse|Straße|Strasse|Address)\b[ \t]*[:.]?[ \t]*([^\n]{4,90})/gi;
    while ((m = labelAddrRe.exec(text)) !== null) {
      const val = labelValueEnd(m[1]).replace(/^["'„“]+/, "");
      // An address has a house number or postcode and no "@" (that is the e-mail label "E-Mail-Adresse").
      if (!/\d/.test(val) || val.includes("@") || val.length > 80) continue;
      const end = m.index + m[0].length - m[1].length + m[1].indexOf(val) + val.length;
      const start = end - val.length;
      if (coveredByMatch(start, end)) continue;
      absorbInto(start, end, ["address", "street", "house_number", "zip_code", "city"]);
      nonNameSpans.push([start, end]);
      matches.push({ id: makeEntityId(), text: val, category: addrCat, start, end, confidence: 0.85, source: "label" });
    }
  }

  // 6c. Names in capital letters after a title in letterheads ("DR. MED. STEFAN KAHLER", OCR also "ARZTPRAXISDR MED …").
  if (categories.names || categories.last_names) {
    const capsDoctorRe = /(?:^|[^A-Za-zÄÖÜäöüß]|PRAXIS)(?:DR|PROF)\.?[ \t]*(?:(?:MED|DENT|JUR|RER\.?[ \t]*NAT)\.?[ \t]+)?([A-ZÄÖÜ]{2,20}(?:[ \t\-][A-ZÄÖÜ]{2,20}){1,2})(?![A-Za-zäöüß])/g;
    while ((m = capsDoctorRe.exec(text)) !== null) {
      const val = m[1];
      const end = m.index + m[0].length;
      const start = end - val.length;
      if (coveredByMatch(start, end)) continue;
      nonNameSpans.push([start, end]);
      matches.push({ id: makeEntityId(), text: val, category: isGranular ? "last_name" : "name", start, end, confidence: 0.8, source: "title_caps" });
    }
  }

  // 8. Organizations
  const orgRe = /\b[A-ZÄÖÜ][A-Za-z0-9äöüß.\-&]{1,40}[ \t]+(?:GmbH(?:\s*&\s*Co\.\s*KG)?|AG|KG|OHG|UG(?:\s*\(haftungsbeschränkt\))?|e\.V\.|GbR)\b/g;
  while ((m = orgRe.exec(text)) !== null) {
    nonNameSpans.push([m.index, m.index + m[0].length]);
    if (categories.organizations) {
      matches.push({ id: makeEntityId(), text: m[0], category: "organization", start: m.index, end: m.index + m[0].length, confidence: 0.90, source: "regex" });
    }
  }

  // 7. Names & Persons
  const wantAnyName = isGranular ? Boolean(categories.first_names || categories.last_names || categories.titles) : Boolean(categories.names);
  const discoveredFirstNames = new Set(knownNames && knownNames.first_names ? knownNames.first_names : []);
  const discoveredLastNames = new Set(knownNames && knownNames.last_names ? knownNames.last_names : []);
  const coveredNameSpans = [];

  if (wantAnyName) {
    // A. Salutations + Name
    const salNameRe = new RegExp(`(?:^|[^a-zA-ZäöüÄÖÜß])(${SALUTATIONS_PATTERN})[ \\t]+([A-ZÄÖÜ][a-zäöüß]{2,20}(?:[ \\t]+[A-ZÄÖÜ][a-zäöüß]{2,20}){0,2})(?![A-Za-zÄÖÜäöüß])`, "g");
    while ((m = salNameRe.exec(text)) !== null) {
      const salPart = m[1].trim();
      const rawNamePart = m[2].trim();
      const rawTokens = rawNamePart.split(/\s+/);
      const validTokens = [];
      for (const tok of rawTokens) {
        if (TITLE_TOKENS.has(tok.toLowerCase().replace(/\.$/, "")) && validTokens.length === 0) {
          validTokens.push(tok);
        } else if (!STOPWORDS.has(tok.toLowerCase())) {
          validTokens.push(tok);
        } else {
          break;
        }
      }
      if (validTokens.length === 0) continue;
      const namePart = validTokens.join(" ");
      const fullMatchOffset = m[0].indexOf(m[1]);
      const salStart = m.index + fullMatchOffset;
      const salEnd = salStart + m[1].length;
      const sIdx = m.index + m[0].indexOf(m[2]);
      const eIdx = sIdx + namePart.length;

      if (!spanOverlaps(sIdx, eIdx, nonNameSpans) && !isGrammaticallyExcluded(text, sIdx, eIdx)) {
        coveredNameSpans.push([salStart, eIdx]);
        emitGranularNameParts(
          matches, namePart, sIdx, eIdx, 0.95, "heuristic", categories,
          salPart, salStart, salEnd, "", discoveredFirstNames, discoveredLastNames
        );
      }
    }

    // B. Form Fields
    const fieldNameRe = /\b(Name|Vorname|Nachname|Patient(?:in)?|Mandant(?:in)?|Kunde|Kundin|Vertragspartner(?:in)?|gez\.|gezeichnet|Unterschrift)[: \t]+([A-ZÄÖÜ][a-zäöüß]{2,20}(?:[ \t]+[A-ZÄÖÜ][a-zäöüß]{2,20}){0,2})(?![A-Za-zÄÖÜäöüß])/gi;
    while ((m = fieldNameRe.exec(text)) !== null) {
      const fieldLbl = m[1].trim();
      const rawVal = m[2].trim();
      const validTokens = [];
      for (const tok of rawVal.split(/\s+/)) {
        if (!STOPWORDS.has(tok.toLowerCase())) {
          validTokens.push(tok);
        } else {
          break;
        }
      }
      if (validTokens.length === 0) continue;
      const val = validTokens.join(" ");
      const sIdx = m.index + m[0].indexOf(m[2]);
      const eIdx = sIdx + val.length;
      if (!spanOverlaps(sIdx, eIdx, nonNameSpans) && !spanOverlaps(sIdx, eIdx, coveredNameSpans)) {
        if (!isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          const lblHint = ["vorname", "nachname"].includes(fieldLbl.toLowerCase()) ? fieldLbl : (validTokens.length === 1 ? "nachname" : "");
          emitGranularNameParts(matches, val, sIdx, eIdx, 0.95, "heuristic", categories, "", -1, -1, lblHint, discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    // B2. Contextual Role Triggers
    const roleNameRe = new RegExp(`\\b(${CONTEXTUAL_ROLE_PATTERN})[ \\t]+([A-ZÄÖÜ][a-zäöüß]{2,25}(?:[ \\t]+[A-ZÄÖÜ][a-zäöüß]{2,25})?)(?![A-Za-zÄÖÜäöüß])`, "g");
    while ((m = roleNameRe.exec(text)) !== null) {
      const rawVal = m[2].trim();
      const validTokens = [];
      for (const tok of rawVal.split(/\s+/)) {
        if (!STOPWORDS.has(tok.toLowerCase())) {
          validTokens.push(tok);
        } else {
          break;
        }
      }
      if (validTokens.length === 0) continue;
      const val = validTokens.join(" ");
      const sIdx = m.index + m[0].indexOf(m[2]);
      const eIdx = sIdx + val.length;
      // A part already found on its own ("Mustermann" from the name list) is replaced by the full name after the role.
      const partOnly = coveredNameSpans.filter(([a, b]) => a < eIdx && b > sIdx).every(([a, b]) => a >= sIdx && b <= eIdx);
      if (!spanOverlaps(sIdx, eIdx, nonNameSpans) && partOnly && validTokens.length > 1) {
        for (let i = matches.length - 1; i >= 0; i--) {
          const x = matches[i];
          if (["name", "first_name", "last_name"].includes(x.category) && x.start >= sIdx && x.end <= eIdx) matches.splice(i, 1);
        }
        for (let i = coveredNameSpans.length - 1; i >= 0; i--) {
          if (coveredNameSpans[i][0] >= sIdx && coveredNameSpans[i][1] <= eIdx) coveredNameSpans.splice(i, 1);
        }
      }
      if (!spanOverlaps(sIdx, eIdx, nonNameSpans) && !spanOverlaps(sIdx, eIdx, coveredNameSpans)) {
        if (!isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          const lblHint = validTokens.length === 1 ? "nachname" : "";
          emitGranularNameParts(matches, val, sIdx, eIdx, 0.93, "context", categories, "", -1, -1, lblHint, discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    // C. Known First Name + Last Name Pair
    const pairRe = /\b([A-ZÄÖÜ][a-zäöüß]{2,20})[ \t]+([A-ZÄÖÜ][a-zäöüß]{2,25})(?![A-Za-zÄÖÜäöüß])/g;
    while ((m = pairRe.exec(text)) !== null) {
      const first = m[1];
      const last = m[2];
      const sIdx = m.index;
      const eIdx = m.index + m[0].length;
      if (spanOverlaps(sIdx, eIdx, nonNameSpans) || spanOverlaps(sIdx, eIdx, coveredNameSpans)) continue;
      if (COMMON_FIRST_NAMES.has(first.toLowerCase()) && !STOPWORDS.has(first.toLowerCase()) && !STOPWORDS.has(last.toLowerCase())) {
        if (!isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, `${first} ${last}`, sIdx, eIdx, 0.88, "gazetteer", categories, "", -1, -1, "", discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    // D. Subordinating Clauses ('dass Rose nach hause geht')
    const subordRe = new RegExp(`\\b(?:dass|das|weil|ob|wenn|als|während|nachdem|bevor|obwohl|damit|falls)\\s+([A-ZÄÖÜ][a-zäöüß]{2,20})(?![A-Za-zÄÖÜäöüß])[^.!?\\n;]{0,40}?\\b${ACTION_VERBS_PATTERN}\\b`, "g");
    while ((m = subordRe.exec(text)) !== null) {
      const name = m[1].trim();
      const sIdx = m.index + m[0].indexOf(m[1]);
      const eIdx = sIdx + name.length;
      if (!STOPWORDS.has(name.toLowerCase()) && !spanOverlaps(sIdx, eIdx, nonNameSpans) && !spanOverlaps(sIdx, eIdx, coveredNameSpans)) {
        if (!isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, name, sIdx, eIdx, 0.95, "context", categories, "", -1, -1, "", discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    // E1 & E2. Verba Dicendi
    const vdBeforeNameRe = new RegExp(`\\b${VERBA_DICENDI_PATTERN}[ \\t]+([A-ZÄÖÜ][a-zäöüß]{2,25})(?![A-Za-zÄÖÜäöüß])`, "g");
    while ((m = vdBeforeNameRe.exec(text)) !== null) {
      const name = m[1].trim();
      const sIdx = m.index + m[0].lastIndexOf(m[1]);
      const eIdx = sIdx + name.length;
      if (!STOPWORDS.has(name.toLowerCase()) && !spanOverlaps(sIdx, eIdx, nonNameSpans) && !spanOverlaps(sIdx, eIdx, coveredNameSpans)) {
        if (!isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, name, sIdx, eIdx, 0.93, "context", categories, "", -1, -1, "", discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    const vdAfterNameRe = new RegExp(`\\b([A-ZÄÖÜ][a-zäöüß]{2,25})[ \\t]+${VERBA_DICENDI_PATTERN}\\b`, "g");
    while ((m = vdAfterNameRe.exec(text)) !== null) {
      const name = m[1].trim();
      const sIdx = m.index;
      const eIdx = sIdx + name.length;
      if (!STOPWORDS.has(name.toLowerCase()) && !spanOverlaps(sIdx, eIdx, nonNameSpans) && !spanOverlaps(sIdx, eIdx, coveredNameSpans)) {
        if (!isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, name, sIdx, eIdx, 0.93, "context", categories, "", -1, -1, "", discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    // F. Action Verbs & Aux Participles
    const actRe = new RegExp(`\\b([A-ZÄÖÜ][a-zäöüß]{2,25})[ \\t]+${ACTION_VERBS_PATTERN}\\b`, "g");
    while ((m = actRe.exec(text)) !== null) {
      const name = m[1].trim();
      const nl = name.toLowerCase();
      const sIdx = m.index;
      const eIdx = sIdx + name.length;
      if (!STOPWORDS.has(nl) && (COMMON_FIRST_NAMES.has(nl) || COMMON_LAST_NAMES.has(nl) || POLYSEMOUS_WORDS.has(nl))) {
        if (!spanOverlaps(sIdx, eIdx, nonNameSpans) && !spanOverlaps(sIdx, eIdx, coveredNameSpans) && !isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, name, sIdx, eIdx, 0.90, "context", categories, "", -1, -1, "", discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    const auxRe = new RegExp(`\\b([A-ZÄÖÜ][a-zäöüß]{2,25})[ \\t]+(?:hat|hatte)\\b[^.!?\\n;]{0,45}?\\b${AUX_PARTICIPLE_VERBS_PATTERN}\\b`, "g");
    while ((m = auxRe.exec(text)) !== null) {
      const name = m[1].trim();
      const nl = name.toLowerCase();
      const sIdx = m.index;
      const eIdx = sIdx + name.length;
      if (!STOPWORDS.has(nl) && (COMMON_FIRST_NAMES.has(nl) || COMMON_LAST_NAMES.has(nl) || POLYSEMOUS_WORDS.has(nl))) {
        if (!spanOverlaps(sIdx, eIdx, nonNameSpans) && !spanOverlaps(sIdx, eIdx, coveredNameSpans) && !isGrammaticallyExcluded(text, sIdx, eIdx)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, name, sIdx, eIdx, 0.90, "context", categories, "", -1, -1, "", discoveredFirstNames, discoveredLastNames);
        }
      }
    }

    // H. Standalone First Names, Standalone Last Names & Polysemous Names with Context
    if (normSens !== "minimal") {
      const wordRe = /\b([A-ZÄÖÜ][a-zäöüß]{2,25})(?![A-Za-zÄÖÜäöüß])/g;
      while ((m = wordRe.exec(text)) !== null) {
        const tok = m[1];
        const tokLower = tok.toLowerCase();
        const sIdx = m.index;
        const eIdx = sIdx + tok.length;

        if (STOPWORDS.has(tokLower)) continue;
        if (spanOverlaps(sIdx, eIdx, nonNameSpans) || spanOverlaps(sIdx, eIdx, coveredNameSpans)) continue;
        
        // At maximum sensitivity (Stufe 5), bypass grammar exclusions to catch all potential names
        if (normSens !== "maximum" && isGrammaticallyExcluded(text, sIdx, eIdx)) continue;

        const isPoly = POLYSEMOUS_WORDS.has(tokLower);
        const inFirst = COMMON_FIRST_NAMES.has(tokLower);
        const inLast = COMMON_LAST_NAMES.has(tokLower);

        // In 'low' sensitivity mode (Stufe 2 - invoice protection), require explicit person context for standalone words
        const personCtx = hasPersonContext(text, sIdx, eIdx);
        if (normSens === "low" && !personCtx) continue;

        if (isPoly) {
          if (personCtx || normSens === "maximum") {
            coveredNameSpans.push([sIdx, eIdx]);
            const lbl = inFirst && !inLast ? "vorname" : (!inFirst ? "nachname" : "");
            emitGranularNameParts(matches, tok, sIdx, eIdx, 0.88, "context", categories, "", -1, -1, lbl, discoveredFirstNames, discoveredLastNames);
          }
        } else if (inLast && !inFirst) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, tok, sIdx, eIdx, 0.88, "gazetteer", categories, "", -1, -1, "nachname", discoveredFirstNames, discoveredLastNames);
        } else if (inFirst) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, tok, sIdx, eIdx, 0.86, "gazetteer", categories, "", -1, -1, !inLast ? "vorname" : "", discoveredFirstNames, discoveredLastNames);
        } else if (normSens === "high" || normSens === "maximum") {
          // Stufe 4 (Hoch) & Stufe 5 (Maximal): Erkenne auch unbekannte großgeschriebene Wörter als Namenskandidaten
          if (personCtx || normSens === "maximum") {
            coveredNameSpans.push([sIdx, eIdx]);
            emitGranularNameParts(matches, tok, sIdx, eIdx, normSens === "maximum" ? 0.75 : 0.82, "candidate", categories, "", -1, -1, "", discoveredFirstNames, discoveredLastNames);
          }
        }
      }
    }

    // H2. High & Maximum Sensitivity Extra Rules: Loose Addresses & Reference IDs
    if ((normSens === "high" || normSens === "maximum") && (categories.addresses || categories.streets)) {
      // Loose Street without number (e.g. "Musterstraße", "Bahnhofsweg")
      const looseStreetRe = /\b([A-ZÄÖÜ][a-zäöüß]{2,25}(?:straße|strasse|str\.|weg|platz|allee|ring|gasse|ufer|chaussee|damm|zeile|pfad|kamp|anger|steig|blick|berg|tal|feld|garten|park|markt|tor|wald|eck|hof))\b/g;
      while ((m = looseStreetRe.exec(text)) !== null) {
        if (NOT_STREETS.test(m[0])) continue;
        if (!spanOverlaps(m.index, m.index + m[0].length, nonNameSpans) && !spanOverlaps(m.index, m.index + m[0].length, coveredNameSpans)) {
          nonNameSpans.push([m.index, m.index + m[0].length]);
          matches.push({ id: makeEntityId(), text: m[0], category: isGranular ? "street" : "address", start: m.index, end: m.index + m[0].length, confidence: 0.88, source: "sensitivity_high" });
        }
      }
    }

    if (normSens === "maximum") {
      // Stufe 5: Alphanumerische Kennzeichen & Referenznummern (z.B. ID-998822, REF-12345)
      const refIdRe = /\b([A-Z]{2,6}[-_/][A-Z0-9]{4,14})\b/g;
      while ((m = refIdRe.exec(text)) !== null) {
        if (!spanOverlaps(m.index, m.index + m[0].length, nonNameSpans) && !spanOverlaps(m.index, m.index + m[0].length, coveredNameSpans)) {
          matches.push({ id: makeEntityId(), text: m[0], category: "custom", start: m.index, end: m.index + m[0].length, confidence: 0.80, source: "sensitivity_max" });
        }
      }
    }

    // I. Intra-Page & Document-Wide Coreference Propagation
    const discFirstLower = new Set(Array.from(discoveredFirstNames).map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w)));
    const discLastLower = new Set(Array.from(discoveredLastNames).map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w)));

    if (discFirstLower.size > 0 || discLastLower.size > 0) {
      const corefRe = /\b([A-ZÄÖÜ][a-zäöüß]{2,25})(?![A-Za-zÄÖÜäöüß])/g;
      while ((m = corefRe.exec(text)) !== null) {
        const tok = m[1];
        const tokLower = tok.toLowerCase();
        const sIdx = m.index;
        const eIdx = sIdx + tok.length;
        if (spanOverlaps(sIdx, eIdx, nonNameSpans) || spanOverlaps(sIdx, eIdx, coveredNameSpans)) continue;
        if (isGrammaticallyExcluded(text, sIdx, eIdx)) continue;
        if (discLastLower.has(tokLower)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, tok, sIdx, eIdx, 0.90, "coreference", categories, "", -1, -1, "nachname");
        } else if (discFirstLower.has(tokLower)) {
          coveredNameSpans.push([sIdx, eIdx]);
          emitGranularNameParts(matches, tok, sIdx, eIdx, 0.90, "coreference", categories, "", -1, -1, "vorname");
        }
      }
    }
  }

  if (knownNames) {
    if (!knownNames.first_names) knownNames.first_names = new Set();
    if (!knownNames.last_names) knownNames.last_names = new Set();
    discoveredFirstNames.forEach((v) => knownNames.first_names.add(v));
    discoveredLastNames.forEach((v) => knownNames.last_names.add(v));
  }

  // 9. Custom Keywords
  if (Array.isArray(categories.custom_keywords)) {
    for (const rawKw of categories.custom_keywords) {
      const kw = String(rawKw || "").trim();
      if (!kw) continue;
      try {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Unicode-aware word boundaries: \b only knows ASCII letters, so "Özdemir", "Gauß" or "Co." never matched.
        const kwRe = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
        while ((m = kwRe.exec(text)) !== null) {
          matches.push({ id: makeEntityId(), text: m[0], category: "custom", start: m.index, end: m.index + m[0].length, confidence: 1.0, source: "custom" });
        }
      } catch (e) {
        // ignore invalid regex
      }
    }
  }

  // 10. Misread surnames: once "Lukas Schäfer" is known, "Lukas" followed by another word
  // on the same line (e.g. the OCR reading "Lukas Scnafer") is redacted together with it.
  if (!isGranular && categories.names) {
    const fullNames = matches.filter((mm) => mm.category === "name" && /^\S+\s+\S+/.test(mm.text.trim()));
    const lastByFirst = new Map();
    for (const fn of fullNames) {
      const [first, ...rest] = fn.text.trim().split(/\s+/);
      if (first.length >= 3 && !STOPWORDS.has(first.toLowerCase())) lastByFirst.set(first, rest.join(" ").toLowerCase());
    }
    for (const [first, last] of lastByFirst) {
      const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const contRe = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}[ \\t]{1,3}([\\p{L}][\\p{L}.\\-]{2,30})`, "gu");
      while ((m = contRe.exec(text)) !== null) {
        const word = m[1];
        if (word.toLowerCase() === last || STOPWORDS.has(word.toLowerCase())) continue;
        if (/^(und|oder|mit|hat|ist|war|wird|sagt|sagte|kommt|kam|geht|ging|aus|von|vom|bei|zu|zum|zur|an|am|im|in|auf|für|als|wie|and|or|with|has|is|was|from|for|at|to)$/i.test(word)) continue;
        matches.push({ id: makeEntityId(), text: m[0], category: "name", start: m.index, end: m.index + m[0].length, confidence: 0.8, source: "known_name" });
      }
    }
  }

  // Filter Whitelist & Deduplicate per page
  const filtered = [];
  const seen = new Set();
  for (const original of matches) {
    const kept = trimWhitelisted(original.text, exceptions);
    if (!kept) continue;
    const match = kept.offset === 0 && kept.text === original.text
      ? original
      : { ...original, text: kept.text, start: original.start + kept.offset, end: original.start + kept.offset + kept.text.length };
    const key = `${match.category}:${match.text.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      filtered.push(match);
    }
  }

  return filtered;
}

window.BlackMyDataPII = {
  detectPiiRulesJS,
  isGrammaticallyExcluded,
  hasPersonContext,
  isWhitelistedText,
  trimWhitelisted,
  isValidIban,
  emitGranularNameParts
};
