// Construit le prototype du TCG en un seul fichier (tcg/jeu.html, ouvrable sans serveur)
// et le CSV de toutes les cartes (tcg/cartes.csv), à partir de tcg/src/.
//   node tcg/build.js
const fs = require('node:fs');
const path = require('node:path');

const src = (f) => path.join(__dirname, 'src', f);
const MODULES = ['data.js', 'engine.js', 'bot.js', 'booster.js', 'csv.js', 'app.js']; // dans l'ordre des dépendances

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

  const { cardsCsv } = await import('./src/csv.js');
  fs.writeFileSync(path.join(__dirname, 'cartes.csv'), cardsCsv());
  console.log(`tcg/jeu.html (${Math.round(html.length / 1024)} Ko) et tcg/cartes.csv écrits.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
