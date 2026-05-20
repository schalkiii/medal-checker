const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

global.DOMParser = (new JSDOM('')).window.DOMParser;
delete require.cache[path.resolve('tests/mocks/chrome-mock.js')];
const { createChromeMock } = require('../tests/mocks/chrome-mock');
global.chrome = createChromeMock();
global.AbortController = AbortController;
global.navigator = { userAgent: 'test' };
global.fetch = () => Promise.resolve({ ok: false });

delete require.cache[require.resolve('../background.js')];
const bg = require('../background.js');

const [,, debugFile] = process.argv;
if (!debugFile || !fs.existsSync(debugFile)) {
  console.error('Usage: node scripts/build-snapshot.js PT_Debug_*.json');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(debugFile, 'utf-8'));
const pages = data.pages || [];

const snapshot = {
  generatedAt: new Date().toISOString(),
  sourceFile: path.basename(debugFile),
  totalPages: pages.length,
  sites: []
};

let totalMedals = 0;
let sitesWithMedals = 0;

for (const p of pages) {
  const url = p.url;
  const fromUrl = new URL(url);
  const domain = fromUrl.hostname;
  const pathName = fromUrl.pathname;

  const medals = bg.extractMedalsFromHtml(p.html);

  const entry = {
    url,
    domain,
    path: pathName,
    htmlBytes: p.html.length,
    medalCount: medals.length,
    medals: medals.map(m => ({
      name: m.name,
      price: m.price,
      duration: m.duration,
      bonus: m.bonus,
      stock: m.stock,
      timeRange: m.timeRange,
      medalId: m.medalId || ''
    }))
  };

  snapshot.sites.push(entry);

  if (medals.length > 0) {
    sitesWithMedals++;
    totalMedals += medals.length;
    console.log(`  [${medals.length}] ${domain}${pathName}`);
    for (const m of medals) {
      console.log(`    - ${m.name}  price=${m.price}  id=${m.medalId || '-'}`);
    }
  }
}

snapshot.summary = {
  sitesWithMedals,
  totalMedals,
  pagesWithoutMedals: pages.length - sitesWithMedals
};

const debugDir = path.dirname(path.resolve(debugFile));
const outPath = path.join(__dirname, '..', 'tests', 'fixtures', 'snapshot.json');
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log(`\nSnapshot saved to ${outPath}`);
console.log(`Total pages: ${pages.length}, sites with medals: ${sitesWithMedals}, total medals: ${totalMedals}`);