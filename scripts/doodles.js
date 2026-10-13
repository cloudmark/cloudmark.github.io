// Re-renders the static doodle SVGs in _includes/doodles/ from assets/js/doodles.js.
// Run after adding or changing a doodle: npm i roughjs@4.6.6 && node scripts/doodles.js
const fs = require('fs'), path = require('path');
global.rough = require('roughjs/bundled/rough.cjs.js');
const { render } = require('../assets/js/doodles.js');
const out = path.join(__dirname, '../_includes/doodles');
const themes = fs.readFileSync(path.join(__dirname, '../_data/themes.yml'), 'utf8');
const pairs = [...themes.matchAll(/color: "(#[0-9a-f]+)"[\s\S]*?doodle: (\w+)/g)].map(m => [m[2], m[1]]);
for (const [key, color] of pairs) fs.writeFileSync(path.join(out, key + '.svg'), render(key, color, 7));
fs.writeFileSync(path.join(out, 'ring.svg'), render('ring', '#f07f1f', 3));
fs.writeFileSync(path.join(out, 'arrow.svg'), render('arrow', 'currentColor', 40));
console.log('wrote', pairs.length + 2, 'doodles');
