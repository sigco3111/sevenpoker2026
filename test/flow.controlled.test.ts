// @vitest-environment happy-dom
// 통제 테스트환경 검증(야간 위임 작업): 프로덕션 코드 변경 없이 Math.random만
// 시드 LCG로 대체하고, 실제 main.ts 앱을 happy-dom에 마운트해 실제 UI 클릭으로
// 결과 씬까지 진행한다. 씬 캡처는 DOM 스냅샷이며 '통제 테스트환경' 증거이다.
import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-ignore 런타임은 node이나 @types/node 미설치 — 캡처 파일 저장용
import { writeFileSync, mkdirSync } from 'node:fs';

const CAP_DIR = '/tmp/flow-captures';
mkdirSync(CAP_DIR, { recursive: true });

const lcg = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function boot(seed: number, preseed: Record<string, string> = {}) {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  for (const [k, v] of Object.entries(preseed)) localStorage.setItem(k, v);
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockImplementation(lcg(seed));
  await import('../src/main');
}

function clickByText(selector: string, text: string) {
  const els = [...document.querySelectorAll<HTMLElement>(selector)];
  const el = els.find((e) => (e.textContent ?? '').includes(text));
  if (!el) throw new Error(`버튼 없음: ${selector} ~ ${text} | 현재: ${els.map((e) => e.textContent?.trim().slice(0, 20)).join('|')}`);
  el.click();
}

const sceneText = () => document.querySelector('.pk-scene')?.textContent ?? '';
const inTable = () => !!document.querySelector('.pk-table');
const inMenu = () => !!document.querySelector('.pk-menu');

// fake timer를 조금씩 전진하며 조건 대기
async function runUntil(pred: () => boolean, capMs: number) {
  let t = 0;
  while (t < capMs) {
    if (pred()) return true;
    await vi.advanceTimersByTimeAsync(700);
    t += 700;
  }
  return pred();
}

function capture(name: string, extra: Record<string, unknown>) {
  const scene = document.querySelector('.pk-scene');
  writeFileSync(`${CAP_DIR}/${name}.html`, scene ? scene.outerHTML : document.body.innerHTML.slice(0, 4000));
  writeFileSync(
    `${CAP_DIR}/${name}.json`,
    JSON.stringify(
      {
        label: '통제 테스트환경 검증 (happy-dom, Math.random=시드 LCG 대체)',
        at: new Date().toISOString(),
        ...extra,
        sceneTitle: scene?.querySelector('h1,h2,.title')?.textContent ?? null,
        sceneText: scene?.textContent?.slice(0, 600) ?? null,
        buttons: [...document.querySelectorAll('.pk-scene button')].map((b) => b.textContent?.trim()),
        localStorage: { story1: localStorage.getItem('sevenpoker2026.story1'), tour1: localStorage.getItem('sevenpoker2026.tour1'), save2: localStorage.getItem('sevenpoker2026.save2') },
      },
      null,
      2,
    ),
  );
}

// 위임 모드로 스토리 1장을 끝까지 진행해 결과 씬 종류를 반환
async function playStory(seed: number): Promise<'clear' | 'fail' | 'timeout'> {
  await boot(seed);
  clickByText('.pk-menu button', '스토리');
  expect(sceneText()).toContain('1장');
  clickByText('.pk-scene button', '대국 시작');
  expect(inTable()).toBe(true);
  clickByText('.pk-table button', '위임');
  const ok = await runUntil(() => sceneText().includes('클리어') || sceneText().includes('칩이 다 떨어졌습니다'), 6_000_000);
  if (!ok) return 'timeout';
  return sceneText().includes('클리어') ? 'clear' : 'fail';
}

async function playTournament(seed: number): Promise<'win' | 'lose' | 'timeout'> {
  await boot(seed);
  clickByText('.pk-menu button', '토너먼트');
  expect(sceneText()).toContain('예선');
  clickByText('.pk-scene button', '대국 시작');
  expect(inTable()).toBe(true);
  clickByText('.pk-table button', '위임');
  const ok = await runUntil(() => sceneText().includes('통과') || sceneText().includes('탈락') || sceneText().includes('우승'), 8_000_000);
  if (!ok) return 'timeout';
  return sceneText().includes('탈락') ? 'lose' : 'win';
}

describe('통제 플로우: 스토리 승리→클리어→2장 해금', () => {
  it('시드 탐색 후 클리어 씬과 해금을 검증한다', async () => {
    let found = -1;
    for (let s = 1; s <= 30; s++) {
      const r = await playStory(s);
      console.log(`story seed ${s}: ${r}`);
      if (r === 'clear') { found = s; break; }
    }
    expect(found).toBeGreaterThan(0);
    // found 시드는 playStory 내부 마지막 실행 상태: 클리어 씬이 화면에 있다
    expect(sceneText()).toContain('클리어');
    expect(localStorage.getItem('sevenpoker2026.story1')).toContain('"unlocked":1');
    capture('story-clear', { flow: 'a', seed: found });
    clickByText('.pk-scene button', '다음 챕터');
    expect(sceneText()).toContain('2장'); // 2장 해금 확인
    capture('story-ch2-intro', { flow: 'a2', seed: found });
  }, 300_000);
});

describe('통제 플로우: 스토리 파산→실패→재도전, 자유대국 save2 불변', () => {
  it('시드 탐색 후 실패 씬과 재도전, save2 불변을 검증한다', async () => {
    const SAVE2 = '{"v":2,"tabId":"testtab","hands":406,"chips":[1540,1000,1000,1000]}';
    let found = -1;
    for (let s = 1; s <= 40; s++) {
      const r = await playStory(s);
      console.log(`story-fail seed ${s}: ${r}`);
      if (r === 'fail') { found = s; break; }
      if (r === 'clear') { /* 계속 탐색 */ }
    }
    expect(found).toBeGreaterThan(0);
    // save2 마커를 심고 같은 시드로 다시 실행해 실패 씬까지 재현
    await boot(found);
    localStorage.setItem('sevenpoker2026.save2', SAVE2);
    clickByText('.pk-menu button', '스토리');
    clickByText('.pk-scene button', '대국 시작');
    clickByText('.pk-table button', '위임');
    const ok = await runUntil(() => sceneText().includes('칩이 다 떨어졌습니다'), 6_000_000);
    expect(ok).toBe(true);
    capture('story-fail', { flow: 'b', seed: found });
    clickByText('.pk-scene button', '다시 도전');
    expect(sceneText()).toContain('1장'); // 재도전 → 챕터 인트로
    expect(localStorage.getItem('sevenpoker2026.save2')).toBe(SAVE2); // 자유대국 저장 불변
    expect(localStorage.getItem('sevenpoker2026.story1') ?? '0').not.toContain('"unlocked":1'); // 실패는 해금 없음
    capture('story-retry', { flow: 'b2', seed: found });
  }, 300_000);
});

describe('통제 플로우: 토너먼트 예선 8판 → 통과(우승 진행)/탈락 → 메뉴 복귀', () => {
  it('통과 시드: 예선 통과 씬 → 다음 스테이지 인트로', async () => {
    let winSeed = -1;
    for (let s = 1; s <= 30; s++) {
      const r = await playTournament(s);
      console.log(`tour seed ${s}: ${r}`);
      if (r === 'win') { winSeed = s; break; }
    }
    expect(winSeed).toBeGreaterThan(0);
    expect(sceneText()).toMatch(/통과|우승/);
    expect(localStorage.getItem('sevenpoker2026.tour1')).toContain('"stage":1'); // 준결승 개방 저장
    capture('tour-clear', { flow: 'c1', seed: winSeed });
    clickByText('.pk-scene button', '다음 스테이지');
    expect(sceneText()).toContain('준결승');
    capture('tour-next-stage', { flow: 'c1b', seed: winSeed });
  }, 300_000);

  it('탈락 시드: 탈락 씬 → 메뉴 복귀', async () => {
    let loseSeed = -1;
    for (let s = 1; s <= 30; s++) {
      const r = await playTournament(s);
      console.log(`tour-lose seed ${s}: ${r}`);
      if (r === 'lose') { loseSeed = s; break; }
    }
    expect(loseSeed).toBeGreaterThan(0);
    expect(sceneText()).toContain('탈락');
    capture('tour-fail', { flow: 'c2', seed: loseSeed });
    clickByText('.pk-scene button', '메뉴로');
    expect(inMenu()).toBe(true);
    capture('tour-back-menu', { flow: 'c2b', seed: loseSeed });
  }, 300_000);
});

// 위임 모드로 스토리 마지막 챕터를 진행해 결과 씬 종류를 반환
async function playStoryChapter3(seed: number): Promise<'ending' | 'fail' | 'timeout'> {
  await boot(seed, { 'sevenpoker2026.story1': '{"v":1,"unlocked":2}' });
  clickByText('.pk-menu button', '스토리');
  expect(sceneText()).toContain('3장');
  clickByText('.pk-scene button', '대국 시작');
  clickByText('.pk-table button', '위임');
  const ok = await runUntil(() => sceneText().includes('엔딩') || sceneText().includes('칩이 다 떨어졌습니다'), 8_000_000);
  if (!ok) return 'timeout';
  return sceneText().includes('엔딩') ? 'ending' : 'fail';
}

async function playTournamentFinal(seed: number): Promise<'win' | 'lose' | 'timeout'> {
  await boot(seed, { 'sevenpoker2026.tour1': '{"v":1,"stage":2,"won":false}' });
  clickByText('.pk-menu button', '토너먼트');
  expect(sceneText()).toContain('결승');
  clickByText('.pk-scene button', '대국 시작');
  clickByText('.pk-table button', '위임');
  const ok = await runUntil(() => sceneText().includes('우승') || sceneText().includes('탈락'), 8_000_000);
  if (!ok) return 'timeout';
  return sceneText().includes('우승!') ? 'win' : 'lose';
}

describe('통제 플로우: 스토리 3장 클리어 → 엔딩', () => {
  it('엔딩 씬과 전 챕터 클리어 저장을 검증한다', async () => {
    let found = -1;
    for (let s = 1; s <= 40; s++) {
      const r = await playStoryChapter3(s);
      console.log(`story-ch3 seed ${s}: ${r}`);
      if (r === 'ending') { found = s; break; }
    }
    expect(found).toBeGreaterThan(0);
    expect(sceneText()).toContain('엔딩 · 새 챔피언');
    expect(localStorage.getItem('sevenpoker2026.story1')).toContain('"unlocked":3');
    capture('story-ending', { flow: 'd', seed: found });
    clickByText('.pk-scene button', '메뉴로');
    expect(inMenu()).toBe(true);
    expect(document.querySelector('.pk-menu')?.textContent).toContain('전 챕터 클리어');
    capture('story-ending-menu', { flow: 'd2', seed: found });
  }, 300_000);
});

describe('통제 플로우: 토너먼트 결승 우승 → won 저장 → 메뉴 우승 완료', () => {
  it('우승 씬, won:true 저장, 메뉴 라벨을 검증한다', async () => {
    let found = -1;
    for (let s = 1; s <= 40; s++) {
      const r = await playTournamentFinal(s);
      console.log(`tour-final seed ${s}: ${r}`);
      if (r === 'win') { found = s; break; }
    }
    expect(found).toBeGreaterThan(0);
    expect(sceneText()).toContain('우승!');
    expect(localStorage.getItem('sevenpoker2026.tour1')).toContain('"won":true');
    capture('tour-win-final', { flow: 'e', seed: found });
    clickByText('.pk-scene button', '메뉴로');
    expect(inMenu()).toBe(true);
    expect(document.querySelector('.pk-menu')?.textContent).toContain('우승 완료');
    capture('tour-win-menu', { flow: 'e2', seed: found });
  }, 300_000);
});

describe('통제 플로우: 토너먼트 중간 재진입 라벨', () => {
  it('stage:1 저장 상태에서 메뉴 라벨과 입장 인트로를 검증한다', async () => {
    await boot(1, { 'sevenpoker2026.tour1': '{"v":1,"stage":1,"won":false}' });
    const menu = document.querySelector('.pk-menu')?.textContent ?? '';
    expect(menu).toContain('준결승 진행 중');
    clickByText('.pk-menu button', '토너먼트');
    expect(sceneText()).toContain('준결승');
    capture('tour-reenter', { flow: 'f', seed: 1 });
  }, 60_000);
});
