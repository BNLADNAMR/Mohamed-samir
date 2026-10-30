import fs from 'node:fs';
import path from 'node:path';

const distIndex = path.resolve('dist/index.html');
if (fs.existsSync(distIndex)) {
  const html = fs.readFileSync(distIndex, 'utf8');

  // 1. مجلد docs/ للنشر الجاهز من الفرع (Settings -> Pages -> Branch: main /docs)
  fs.mkdirSync('docs', {recursive: true});
  fs.writeFileSync('docs/index.html', html, 'utf8');
  fs.writeFileSync('docs/404.html', html, 'utf8');
  fs.writeFileSync('docs/.nojekyll', '', 'utf8');

  // 2. مجلد github-web-upload/ يحتوي على الملفات النهائية النظيفة الجاهزة للرفع اليدوي على جذر المستودع /(root)
  fs.mkdirSync('github-web-upload', {recursive: true});
  fs.writeFileSync('github-web-upload/index.html', html, 'utf8');
  fs.writeFileSync('github-web-upload/404.html', html, 'utf8');
  fs.writeFileSync('github-web-upload/.nojekyll', '', 'utf8');

  // 3. نسخة في جذر المشروع وداخل dist/ لدعم GitHub Actions أيضاً
  fs.writeFileSync('standalone-index.html', html, 'utf8');
  fs.writeFileSync('dist/404.html', html, 'utf8');
  fs.writeFileSync('dist/.nojekyll', '', 'utf8');
  fs.writeFileSync('.nojekyll', '', 'utf8');

  console.log('Generated error-free deployment files in docs/ and github-web-upload/');
}
