// dist의 js/css를 index.html에 인라인해 '단일 파일 배포 산출물' docs/index.html을 만든다.
// 배포가 한 파일 커밋이 되어 번들/HTML 참조 어긋남(선전환 사고)이 구조적으로 불가능해진다.
// 사용: node tools/build-inline.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dist = 'dist';
const html = readFileSync(`${dist}/index.html`, 'utf8');
const assets = readdirSync(`${dist}/assets`);
const jsName = assets.find((f) => f.endsWith('.js'));
const cssName = assets.find((f) => f.endsWith('.css'));
if (!jsName || !cssName) throw new Error('dist/assets에 js/css가 없습니다. 먼저 npm run build');
const js = readFileSync(`${dist}/assets/${jsName}`, 'utf8');
const css = readFileSync(`${dist}/assets/${cssName}`, 'utf8');
const stamp = createHash('sha256').update(js).update(css).digest('hex').slice(0, 12); // js+css 합산 — css-only 변경도 스탬프가 바뀐다

let out = html.replace(
  new RegExp(`<script type="module" crossorigin src="[^"]*${jsName}"></script>`),
  () => `<script type="module">\n/* build:${stamp} ${jsName} */\n${js}\n</script>`,
);
out = out.replace(
  new RegExp(`<link rel="stylesheet" crossorigin href="[^"]*${cssName}">`),
  () => `<style>\n${css}\n</style>`,
);
if (!out.includes(`build:${stamp}`)) throw new Error('js 인라인 실패: script 태그를 찾지 못했습니다');
if (/src="[^"]*assets\/index-/.test(out) || /href="[^"]*assets\/index-/.test(out)) {
  throw new Error('외부 번들 참조가 남아 있습니다(인라인 불완전)');
}
out = out.replace('</head>', `  <!-- deploy-stamp:${stamp} -->\n  </head>`);
writeFileSync('docs/index.html', out);
console.log(`inline ok: docs/index.html (${out.length} bytes, stamp ${stamp}, js ${jsName}, css ${cssName})`);
