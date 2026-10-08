// Construit le prototype du TCG en un seul fichier (tcg/jeu.html, ouvrable sans serveur)
// et le CSV de toutes les cartes (tcg/cartes.csv), à partir de tcg/src/.
//   node tcg/build.js
const fs = require('node:fs');
const path = require('node:path');

const src = (f) => path.join(__dirname, 'src', f);
const MODULES = ['data.js', 'engine.js', 'bot.js', 'booster.js', 'csv.js', 'xlsx.js', 'app.js']; // dans l'ordre des dépendances

async function main() {
  const declared = new Map();
  const parts = MODULES.map((file) => {
    const code = fs.readFileSync(src(file), 'utf8')
      .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
      .replace(/^export\s+(?=(const|let|function|async|class)\b)/gm, '');
    if (/^\s*(import|export)\b/m.test(code)) throw new Error(`${file} : import/export non pris en charge par la construction.`);
    // Tous les modules partagent la même portée : un nom déclaré deux fois casserait le jeu.
    for (const m of code.matchAll(/^(?:const|let|function|async function|class)\s+([\w$]+)/gm)) {
      if (declared.has(m[1])) throw new Error(`« ${m[1]} » est déclaré dans ${declared.get(m[1])} et dans ${file}.`);
      declared.set(m[1], file);
    }
    return `// ===== ${file} =====\n${code}`;
  });
  const html = fs.readFileSync(src('index.html'), 'utf8')
    .replace('/*__CSS__*/', () => fs.readFileSync(src('app.css'), 'utf8'))
    .replace('/*__JS__*/', () => parts.join('\n'));
  fs.writeFileSync(path.join(__dirname, 'jeu.html'), html);

  const {
    cardsCsv, figmaCsv, figmaRows, figmaSplitCsv, figmaSheets,
  } = await import('./src/csv.js');
  const { xlsxWorkbook } = await import('./src/xlsx.js');
  fs.writeFileSync(path.join(__dirname, 'cartes.csv'), cardsCsv());
  fs.writeFileSync(path.join(__dirname, 'cartes-figma.csv'), figmaCsv());
  fs.writeFileSync(path.join(__dirname, 'cartes-figma.json'), `${JSON.stringify(figmaRows(), null, 2)}\n`);
  for (const [name, csv] of Object.entries(figmaSplitCsv())) fs.writeFileSync(path.join(__dirname, `figma-${name}.csv`), csv);
  fs.writeFileSync(path.join(__dirname, 'figma.xlsx'), xlsxWorkbook(figmaSheets()));
  console.log(`tcg/jeu.html (${Math.round(html.length / 1024)} Ko), tcg/cartes.csv, tcg/cartes-figma.csv et .json, tcg/figma-cartes.csv, figma-personnages.csv, figma-marqueurs.csv et tcg/figma.xlsx écrits.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
