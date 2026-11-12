// @vitest-environment happy-dom
// 스토리 대국 제목 줄의 목표 진행 표시(통제 테스트환경: 엔진 직접 구동 + happy-dom 마운트)
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/engine/game';
import { mountTable } from '../src/ui/table';
import { STORY_CHAPTERS } from '../src/story';

describe('스토리 목표 진행 표시', () => {
  it('제목 줄에 목표까지 남은 칩을 보여 주고 판 사이에 갱신된다', () => {
    const ch = STORY_CHAPTERS[0]; // 1500 → 2000
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42, undefined, { opponents: ch.opponents, startChips: ch.startChips });
    const ui = mountTable(document.getElementById('app')!, state, { title: ch.title, goalChips: ch.goalChips, persist: false });
    const t = () => document.querySelector('.pk-title')!.textContent!;
    expect(t()).toContain('1장');
    expect(t()).toContain('목표 2000칩까지 510칩'); // 1500 시작 - 앤티 10 납부 후
    state.seats[0].chips = 1800;
    ui.render();
    expect(t()).toContain('목표 2000칩까지 200칩');
    state.seats[0].chips = 2050;
    ui.render();
    expect(t()).toContain('목표 2000칩 달성');
    ui.unmount();
  });

  it('자유 대국(목표 없음)은 기존 제목 그대로다', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    const t = document.querySelector('.pk-title')!.textContent!;
    expect(t).toContain('자유 대국');
    expect(t).not.toContain('목표');
    ui.unmount();
  });
});
