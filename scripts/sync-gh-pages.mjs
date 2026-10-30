import fs from 'node:fs';
import path from 'node:path';

const distEntry = path.resolve('dist/build-entry.html');
const distIndex = path.resolve('dist/index.html');

if (fs.existsSync(distEntry)) {
  fs.renameSync(distEntry, distIndex);
}

if (fs.existsSync(distIndex)) {
  const html = fs.readFileSync(distIndex, 'utf8');

  // استخراج الـ CSS والـ JS المدمجين لإنشاء ملفات ثابتة في جذر المستودع /(root) تعمل مباشرة على GitHub Pages بدون أي خطأ MIME لملفات .tsx
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const compiledCss = styleMatch ? styleMatch[1] : '';

  const moduleScriptMatches = [
    ...html.matchAll(/<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/gi),
  ];
  const compiledJs = moduleScriptMatches.map((m) => m[1]).join('\n;\n');

  fs.writeFileSync('gh-pages-bundle.css', compiledCss, 'utf8');
  fs.writeFileSync('gh-pages-bundle.js', compiledJs, 'utf8');

  // محمّل ذكي يعمل على GitHub Pages /(root) بتحميل الحزمة المترجمة، بينما يستبدله Vite في وضع التطوير المحلي تلقائياً
  const loaderJs = `(function () {
  var s = document.createElement('script');
  s.type = 'module';
  s.src = './gh-pages-bundle.js';
  document.body.appendChild(s);
})();
`;
  fs.writeFileSync('gh-pages-loader.js', loaderJs, 'utf8');

  // 1. دعم النشر من الجذر /(root) مباشرة على GitHub Pages
  fs.writeFileSync('404.html', html, 'utf8');
  fs.writeFileSync('.nojekyll', '', 'utf8');

  // 2. دعم النشر من مجلد /docs على GitHub Pages
  fs.mkdirSync('docs', {recursive: true});
  fs.writeFileSync('docs/index.html', html, 'utf8');
  fs.writeFileSync('docs/404.html', html, 'utf8');
  fs.writeFileSync('docs/.nojekyll', '', 'utf8');

  // 3. دعم الرفع اليدوي ومجلد dist لـ GitHub Actions
  fs.mkdirSync('github-web-upload', {recursive: true});
  fs.writeFileSync('github-web-upload/index.html', html, 'utf8');
  fs.writeFileSync('github-web-upload/404.html', html, 'utf8');
  fs.writeFileSync('github-web-upload/.nojekyll', '', 'utf8');

  fs.writeFileSync('standalone-index.html', html, 'utf8');
  fs.writeFileSync('dist/404.html', html, 'utf8');
  fs.writeFileSync('dist/.nojekyll', '', 'utf8');

  console.log(
    'Successfully generated root GitHub Pages bundles (gh-pages-bundle.js/.css), docs/, and dist/!'
  );
}
