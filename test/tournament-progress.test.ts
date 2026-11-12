// @vitest-environment happy-dom
// 토너먼트 대국 제목 줄의 진행 표시(통제 테스트환경: 엔진 직접 구동 + happy-dom 마운트)
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/engine/game';
import { mountTable } from '../src/ui/table';
import { TOURNAMENT_STAGES, bindCharacters, stageSeats } from '../src/tournament';
import { CHARACTERS } from '../src/characters';

bindCharacters(CHARACTERS);

describe('토너먼트 진행 표시', () => {
  it('제목 줄에 n/N판과 현재 순위를 보여 주고 칩 변화에 따라 갱신된다', () => {
    const stage = TOURNAMENT_STAGES[0]; // 예선 · 8판
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42, undefined, {
      opponents: stageSeats(stage),
      startChips: stage.startChips,
      ante: stage.ante,
      betUnits: stage.betUnits,
    });
    const ui = mountTable(document.getElementById('app')!, state, {
      title: `선셋 컵 ${stage.name}`,
      tourTotalHands: stage.hands,
      persist: false,
    });
    const t = () => document.querySelector('.pk-title')!.textContent!;
    expect(t()).toContain('1/8판');
    expect(t()).toContain('현재 1위'); // 전원 동일 칩이면 공동 1위
    state.seats[1].chips = state.seats[0].chips + 100;
    state.seats[2].chips = state.seats[0].chips + 50;
    ui.render();
    expect(t()).toContain('현재 3위');
    state.handNumber = 9; // 마지막 판 정리 화면에서도 총 판 수를 넘기지 않는다
    ui.render();
    expect(t()).toContain('8/8판');
    ui.unmount();
  });

  it('스토리·자유 대국(총 판 수 없음)은 기존 제목 형식 그대로다', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    const t = document.querySelector('.pk-title')!.textContent!;
    expect(t).toContain('번째 판');
    expect(t).not.toContain('현재');
    expect(t).not.toContain('/');
    ui.unmount();
  });
});
