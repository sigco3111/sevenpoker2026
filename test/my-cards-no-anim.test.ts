// @vitest-environment happy-dom
// 사용자 요청: '나만 보는 패' 애니메이션 제거 — 내 패는 등장 플립/딜링 비행 없이 즉시 표시,
// 상대 자리의 연출은 유지되는지 검증(통제 테스트환경).
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/engine/game';
import { mountTable } from '../src/ui/table';

describe('내 패 애니메이션 제거', () => {
  it('내 패에는 플립이 없고, 공개 전환된 상대 패에는 플립이 유지된다', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const state = createGame(() => 0.42);
    const ui = mountTable(document.getElementById('app')!, state, { persist: false });
    // 내 패 카드: 플립 클래스 없음
    const myCards = [...document.querySelectorAll('.pk-me-cards .pk-card')];
    expect(myCards.length).toBe(3);
    expect(myCards.every((c) => !c.classList.contains('pk-flipin'))).toBe(true);
    // 공개 플래그만 직접 전환(카드 수 불변) → 상대 공개 카드는 플립, 내 카드는 플립 없음
    for (let i = 0; i < 4; i++) state.seats[i].revealed[0] = true;
    ui.render();
    expect(document.querySelectorAll('.pk-opp .pk-flipin').length).toBeGreaterThan(0); // 상대 연출 유지
    expect(document.querySelectorAll('.pk-me-cards .pk-flipin').length).toBe(0); // 내 패 제거
    ui.unmount();
  });
});
