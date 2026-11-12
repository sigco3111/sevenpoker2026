// 배포 차단 검사: docs/index.html이 '단일 파일 배포' 규칙을 만족하는지 검사한다.
// 규칙 위반 시 0이 아닌 코드로 종료(배포 절차의 기계적 게이트).
// 검사 항목:
//  1. 외부 해시 번들 참조 금지(assets/index-*.js|css) — 선전환 사고의 직접 원인 차단
//  2. 인라인 번들의 build 스탬프와 주석의 deploy-stamp 일치
//  3. 최소 크기(번들+CSS 인라인이면 30KB 이상이어야 함)
// 사용: node tools/deploy-check.mjs [path]  (기본 docs/index.html)
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'docs/index.html';
const html = readFileSync(path, 'utf8');
const fail = (msg) => {
  console.error(`REJECT ${path}: ${msg}`);
  process.exit(1);
};

const extRef = html.match(/(?:src|href)="[^"]*assets\/index-[^"]+\.(js|css)"/);
if (extRef) fail(`외부 번들 참조 발견: ${extRef[0]} — 분리 배포는 선전환 사고를 낳으므로 금지`);

const build = html.match(/\/\* build:([0-9a-f]{12}) /);
if (!build) fail('인라인 번들 build 스탬프 없음 — 인라인 산출물이 아님');
const stamp = html.match(/<!-- deploy-stamp:([0-9a-f]{12}) -->/);
if (!stamp) fail('deploy-stamp 주석 없음');
if (build[1] !== stamp[1]) fail(`스탬프 불일치: 번들 ${build[1]} vs 주석 ${stamp[1]} — 어긋난 조합`);
if (html.length < 30_000) fail(`크기 ${html.length}B — 번들+CSS 인라인 산출물로 보기에 너무 작음`);

console.log(`PASS ${path}: self-contained, stamp ${stamp[1]}, ${html.length} bytes`);
