/**
 * Build a standalone file:// compatible edition of ならべてポン.
 *
 * Usage: npm run build:offline
 * Output: dist/ならべてポン-offline.html
 *
 * Inline assets avoid file:// ES-module CORS restrictions and avoid network access.
 * Web/GitHub Pages source files remain unchanged.
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFile(join(root, p), 'utf8');
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
const extension = (name) => name.slice(name.lastIndexOf('.')).toLowerCase();

async function getAssetMap() {
  const map = {};
  for (const folder of ['assets/dice', 'assets/audio']) {
    let files;
    try {
      files = await readdir(join(root, folder));
    } catch (error) {
      if (folder === 'assets/dice') throw new Error('Missing required dice images directory: ' + folder);
      console.warn('Audio folder not found; the offline build will have no audio.');
      continue;
    }
    for (const file of files) {
      const mediaType = mime[extension(file)];
      if (!mediaType) continue;
      const path = folder + '/' + file;
      const bytes = await readFile(join(root, path));
      map[path] = 'data:' + mediaType + ';base64,' + bytes.toString('base64');
    }
  }
  for (const color of ['r', 'b', 'y', 'g']) {
    for (const face of [1, 2, 3, 4]) {
      if (!map['assets/dice/' + color + face + '.png']) throw new Error('Missing die: ' + color + face + '.png');
    }
  }
  if (!map['assets/dice/JK.png']) throw new Error('Missing joker: assets/dice/JK.png');
  return map;
}

function withoutModules(source, filename) {
  const imports = source.match(/^\s*import\s+[^;\n]+;\s*$/gm) || [];
  if (filename === 'src/main.js' && imports.length !== 2) {
    throw new Error('Unexpected game imports: update the offline bundler to match current src/main.js');
  }
  if (filename !== 'src/main.js' && imports.length) {
    throw new Error('Unexpected import in ' + filename);
  }
  return source
    .replace(/^\s*import\s+[^;\n]+;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:const|let|var|function|class|async)\b)/g, '');
}

function makeOfflineMain(main) {
  // Every image URL resolves through the embedded map (including score examples).
  main = main.replace(/function asset\(die\)\s*\{[^\n]*\}/, 'function asset(die) { return offlineAsset(die.joker ? "assets/dice/JK.png" : "assets/dice/" + COLOR_CODES[die.color] + die.number + ".png"); }');
  main = main.replace(/img\.src\s*=\s*([^;]+);/g, 'img.src = offlineAsset($1);');
  // Every sound URL is converted to an embedded data URI.
  main = main.replace(/(['"])(assets\/audio\/[^'"]+)\1/g, (_, quote, path) => 'offlineAsset(' + JSON.stringify(path) + ')');
  return main;
}

async function build() {
  const [html, css, game, rankings, main, assets] = await Promise.all([
    read('index.html'),
    read('src/styles.css'),
    read('src/game.js'),
    read('src/rankings.js'),
    read('src/main.js'),
    getAssetMap(),
  ]);
  let responsiveCss = '';
  try { responsiveCss = await read('src/responsive-playables.css'); } catch { /* PR #22 not yet merged */ }
  const offlinePrelude = [
    'const OFFLINE_ASSETS = ' + JSON.stringify(assets) + ';',
    'function offlineAsset(path) { return OFFLINE_ASSETS[path] || path; }',
    'globalThis.__NARABETEPON_OFFLINE__ = true;',
  ].join('\n');
  const rankOffline = rankings
    .replace('function jsonp(params, timeoutMs = 8000) {', 'function jsonp(params, timeoutMs = 8000) {\n  return Promise.reject(new Error("Offline: no external ranking service"));')
    .replace(/export async function submitRemoteRanking\([\s\S]*?\n\}/, 'export async function submitRemoteRanking(mode, name, score) {\n  return { ok: true, offline: true };\n}');
  if (rankOffline === rankings || !rankOffline.includes('offline: true')) {
    throw new Error('Ranking API changed: offline handling could not be installed');
  }
  const combinedJs = [
    '(function () {',
    '"use strict";',
    offlinePrelude,
    withoutModules(game, 'src/game.js'),
    withoutModules(rankOffline, 'src/rankings.js'),
    makeOfflineMain(withoutModules(main, 'src/main.js')),
    '})();',
  ].join('\n');
  const escapeScriptClose = s => s.replace(/<\/script/gi, '<\\/script');
  const output = html
    .replace(/<link\s+rel="stylesheet"\s+href="\.\/src\/styles\.css"\s*\/>/, '<style>\n' + css + '\n' + responsiveCss + '\n</style>')
    .replace(/\s*<link\s+rel="stylesheet"\s+href="\.\/src\/responsive-playables\.css"\s*\/>/, '')
    .replace(/<script\s+type="module"\s+src="\.\/src\/main\.js"\s*><\/script>/, '<script>\n' + escapeScriptClose(combinedJs) + '\n</script>');
  if (output === html || output.includes('type="module"') || output.includes('./src/main.js') || output.includes('./src/styles.css')) {
    throw new Error('Offline HTML generation failed: module or source URLs remain');
  }
  const outDir = join(root, 'dist');
  await mkdir(outDir, { recursive: true });
  const target = join(outDir, 'ならべてポン-offline.html');
  await writeFile(target, output, 'utf8');
  console.info('Offline standalone HTML created: ' + target);
  console.info('Embedded media assets: ' + Object.keys(assets).length);
  console.info('File bytes: ' + Buffer.byteLength(output, 'utf8'));
}
await build();
