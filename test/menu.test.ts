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
