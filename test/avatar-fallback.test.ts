// @vitest-environment happy-dom
// 아바타 이니셜 폴백(통제 테스트환경: 엔진 직접 구동 + happy-dom 마운트)
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/engine/game';
import { mountTable } from '../src/ui/table';

describe('아바타 이니셜 폴백', () => {
  it('마운트 직후(로딩 중)에도 상대 이니셜이 보인다', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42); // 기본 상대: 소연 · 연륜 / 선우 · 관찰 / 록키 · 직관
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    const fallbacks = [...document.querySelectorAll('.pk-ava-fallback')].map((e) => e.textContent);
    expect(fallbacks).toEqual(['소', '선', '록']);
    ui.unmount();
  });

  it('이미지 로드 실패 시 img만 사라지고 이니셜 폴백은 남는다', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    const img = document.querySelector<HTMLImageElement>('.pk-ava')!;
    img.dispatchEvent(new Event('error'));
    expect(document.querySelectorAll('.pk-ava').length).toBe(2); // 실패한 1개만 제거
    const fallbacks = [...document.querySelectorAll('.pk-ava-fallback')].map((e) => e.textContent);
    expect(fallbacks).toEqual(['소', '선', '록']); // 폴백 3개 유지
    ui.unmount();
  });
});
