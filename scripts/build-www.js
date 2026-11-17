/* Copies the web app into www/ so Capacitor can bundle it into the Android app.
   The app files are not changed; only the files the app needs at run time are copied. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const items = ['index.html', 'preview.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'sw.js', 'css', 'fonts', 'js'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const it of items) {
  const from = path.join(root, it);
  if (!fs.existsSync(from)) {
    console.error('Missing: ' + it);
    process.exit(1);
  }
  fs.cpSync(from, path.join(out, it), { recursive: true });
}
console.log('www/ ready (' + items.length + ' items)');
