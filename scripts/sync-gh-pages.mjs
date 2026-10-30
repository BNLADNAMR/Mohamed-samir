import fs from 'node:fs';
import path from 'node:path';

const distIndex = path.resolve('dist/index.html');

if (fs.existsSync(distIndex)) {
  const html = fs.readFileSync(distIndex, 'utf8');

  // 1. مجلد docs/ للنشر المباشر من GitHub Pages
  fs.mkdirSync('docs', {recursive: true});
  fs.writeFileSync('docs/index.html', html, 'utf8');
  fs.writeFileSync('docs/404.html', html, 'utf8');
  fs.writeFileSync('docs/.nojekyll', '', 'utf8');

  // 2. مجلد dist/ لـ GitHub Actions
  fs.writeFileSync('dist/404.html', html, 'utf8');
  fs.writeFileSync('dist/.nojekyll', '', 'utf8');
  fs.writeFileSync('.nojekyll', '', 'utf8');

  console.log('Successfully synced clean production HTML to docs/ and dist/.');
}
