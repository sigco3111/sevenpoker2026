// @vitest-environment happy-dom
// 메뉴/장면 UI 마운트 스모크 — 화면을 비우고 난 뒤 mount하는 show() 순서를 흉내 내어
// 'mount 후 비우기' 순서 버그(빈 화면)가 재발하면 잡는다.
import { describe, it, expect } from 'vitest';
import { mountMenu } from '../src/ui/menu';
import { mountScene } from '../src/ui/scene';

const story = { v: 1, unlocked: 0 };
const tour = { v: 1 as const, stage: 0, won: false };

describe('메뉴 화면 마운트', () => {
  it('메뉴가 실제 DOM에 렌더된다(모드 3개)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountMenu(root, story, tour, { onFree: () => {}, onStory: () => {}, onTournament: () => {} });
    expect(root.querySelector('.pk-menu')).toBeTruthy();
    expect(root.querySelectorAll('.pk-mode').length).toBe(3);
    expect(root.textContent).toContain('자유 대국');
    expect(root.textContent).toContain('토너먼트');
  });

  it('비우기 → mount 순서(show와 동일)로 다시 그려도 화면이 남는다', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    root.innerHTML = '';
    mountScene(root, { kicker: 'k', title: 't', lines: ['l'], actions: [{ label: 'a', onClick: () => {} }] });
    expect(root.querySelector('.pk-scene')).toBeTruthy();
    expect(root.textContent).toContain('t');
  });
});

describe('전 챕터 클리어 후 스토리 타일', () => {
  it('클리어 상태면 다시 보기 핸들러로 간다', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let replay = 0, storyIdx = -1;
    mountMenu(root, { v: 1, unlocked: 3 }, tour, { onFree: () => {}, onStory: (i) => { storyIdx = i; }, onTournament: () => {}, onStoryReplay: () => { replay++; } });
    expect(root.textContent).toContain('전 챕터 클리어');
    const tile = [...root.querySelectorAll('.pk-mode')].find((b) => b.textContent!.includes('스토리')) as HTMLButtonElement;
    tile.click();
    expect(replay).toBe(1);
    expect(storyIdx).toBe(-1); // 진행 저장·재도전 경로 불변: 바로 챕터로 가지 않는다
  });
  it('미클리어 상태면 기존처럼 도전 챕터로 간다', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let storyIdx = -1;
    mountMenu(root, { v: 1, unlocked: 1 }, tour, { onFree: () => {}, onStory: (i) => { storyIdx = i; }, onTournament: () => {}, onStoryReplay: () => { throw new Error('호출되면 안 됨'); } });
    const tile = [...root.querySelectorAll('.pk-mode')].find((b) => b.textContent!.includes('스토리')) as HTMLButtonElement;
    tile.click();
    expect(storyIdx).toBe(1);
  });
});

describe('아바타 프리로드', () => {
  it('메뉴 마운트 시 아바타 6종을 미리 요청한다', () => {
    const srcs: string[] = [];
    const OrigImage = (globalThis as { Image?: unknown }).Image;
    (globalThis as { Image?: unknown }).Image = class {
      set src(v: string) { srcs.push(v); }
    };
    (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback = (cb) => { cb(); return 0; };
    const root = document.createElement('div');
    document.body.appendChild(root);
    mountMenu(root, story, tour, { onFree: () => {}, onStory: () => {}, onTournament: () => {} });
    expect(srcs.filter((s) => /avatars\/avatar-\d\.png/.test(s)).length).toBe(6);
    (globalThis as { Image?: unknown }).Image = OrigImage;
  });
});
