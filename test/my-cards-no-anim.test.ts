// @vitest-environment happy-dom
// 사용자 요청: 내 패는 뒤집히는 플립 없이 표시하되 날아오는 비행 연출은 유지,
// 첫 배분뿐 아니라 이후 구의 추가 카드에도 비행이 나와야 함(통제 테스트환경).
import { describe, it, expect } from 'vitest';
import { createGame, startHand } from '../src/engine/game';
import { mountTable } from '../src/ui/table';

const flushRaf = () => new Promise((r) => setTimeout(r, 30));

describe('내 패 연출: 플립 제거 + 비행 유지', () => {
  it('내 패에는 플립이 없고, 공개 전환된 상대 패에는 플립이 유지된다', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    const myCards = [...document.querySelectorAll('.pk-me-cards .pk-card')];
    expect(myCards.length).toBe(3);
    expect(myCards.every((c) => !c.classList.contains('pk-flipin'))).toBe(true);
    for (let i = 0; i < 4; i++) state.seats[i].revealed[0] = true;
    ui.render();
    expect(document.querySelectorAll('.pk-opp .pk-flipin').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.pk-me-cards .pk-flipin').length).toBe(0);
    ui.unmount();
  });

  it('첫 배분에 내 자리로도 비행 카드가 날아온다', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    await flushRaf();
    // 4자리 x 3장 = 12장의 비행 카드가 예약된다
    expect(document.querySelectorAll('.pk-fly').length).toBe(12);
    ui.unmount();
  });

  it('이후 구의 추가 카드에도 내 자리를 포함해 비행이 나온다', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    await flushRaf();
    document.querySelectorAll('.pk-fly').forEach((f) => f.remove());
    // 4구 진입을 시뮬레이션: 각 자리에 카드 1장씩 추가 후 렌더
    for (const s of state.seats) {
      s.cards.push(s.cards[0]);
      s.revealed.push(true);
    }
    ui.render();
    await flushRaf();
    expect(document.querySelectorAll('.pk-fly').length).toBe(4); // 내 자리 포함 4자리
    ui.unmount();
  });

  it('비행 중 리렌더가 일어나도 비행이 지워지지 않고 새 목표로 이어진다', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    await flushRaf();
    const before = document.querySelectorAll('.pk-fly').length;
    expect(before).toBeGreaterThan(0);
    ui.render(); // DOM 통째 교체(기존 구현은 여기서 비행이 지워졌다)
    await flushRaf();
    expect(document.querySelectorAll('.pk-fly').length).toBeGreaterThan(0);
    ui.unmount();
  });
});
