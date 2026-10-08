// Prépare une commande de boosters pour l'imprimeur.
//   node tcg/boosters.js 100              → 100 boosters
//   node tcg/boosters.js 100 --graine 42  → toujours les mêmes 100 boosters (pour refaire exactement une commande)
//   node tcg/boosters.js 100 --dossier ~/commande-imprimeur
// Écrit dans le dossier (par défaut tcg/commandes/boosters-100/) :
//   impression-quantites.csv  quoi imprimer et combien
//   boosters-composition.csv  le contenu de chaque booster, carte par carte
//   resume.txt                le résumé à envoyer à l'imprimeur
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { n: null, seed: null, dir: null };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--graine' || a === '--seed') args.seed = Number(argv[++k]);
    else if (a === '--dossier' || a === '--dir') args.dir = argv[++k];
    else if (/^\d+$/.test(a)) args.n = Number(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.n || args.n < 1) {
    console.error('Combien de boosters ? Exemple : node tcg/boosters.js 100 [--graine 42] [--dossier chemin]');
    process.exit(1);
  }
  const seed = Number.isFinite(args.seed) ? args.seed : Math.floor(Math.random() * 1e9);
  const { planBoosters, seededRandom } = await import('./src/booster.js');
  const { quantitiesCsv, compositionCsv, orderSummary } = await import('./src/csv.js');
  const { GAME_NAME } = await import('./src/data.js');

  const boosters = planBoosters(args.n, seededRandom(seed));
  const dir = path.resolve(args.dir || path.join(__dirname, 'commandes', `boosters-${args.n}`));
  fs.mkdirSync(dir, { recursive: true });
  const summary = orderSummary(boosters, { seed, gameName: GAME_NAME });
  fs.writeFileSync(path.join(dir, 'impression-quantites.csv'), quantitiesCsv(boosters));
  fs.writeFileSync(path.join(dir, 'boosters-composition.csv'), compositionCsv(boosters));
  fs.writeFileSync(path.join(dir, 'resume.txt'), `${summary}\n`);
  console.log(`${summary}\n\nFichiers écrits dans ${dir}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
