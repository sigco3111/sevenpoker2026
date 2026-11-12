import { describe, it, expect } from 'vitest';
import { Card, evaluate7, compareHandValue, compareUpcards, CATEGORY_NAME } from '../src/engine/cards';
import { createGame, chooseReveal, applyAction, startHand, ANTE } from '../src/engine/game';

const c = (rank: number, suit: Card['suit']): Card => ({ rank, suit });

describe('족보 판정', () => {
  it('스트레이트플러시 > 포카드 > 풀하우스 > 플러시 > 스트레이트', () => {
    const sf = evaluate7([c(10, 's'), c(11, 's'), c(12, 's'), c(13, 's'), c(14, 's'), c(2, 'h'), c(3, 'd')]);
    const quads = evaluate7([c(9, 's'), c(9, 'd'), c(9, 'h'), c(9, 'c'), c(2, 'h'), c(3, 'd'), c(4, 's')]);
    const fh = evaluate7([c(9, 's'), c(9, 'd'), c(9, 'h'), c(4, 'c'), c(4, 'h'), c(3, 'd'), c(5, 's')]);
    const flush = evaluate7([c(2, 's'), c(5, 's'), c(9, 's'), c(11, 's'), c(13, 's'), c(3, 'd'), c(4, 'h')]);
    const st = evaluate7([c(5, 's'), c(6, 'd'), c(7, 'h'), c(8, 'c'), c(9, 'h'), c(2, 'd'), c(2, 'h')]);
    expect(sf.category).toBe(8);
    expect(quads.category).toBe(7);
    expect(fh.category).toBe(6);
    expect(flush.category).toBe(5);
    expect(st.category).toBe(4);
    expect(compareHandValue(sf, quads)).toBeGreaterThan(0);
    expect(compareHandValue(quads, fh)).toBeGreaterThan(0);
    expect(compareHandValue(fh, flush)).toBeGreaterThan(0);
    expect(compareHandValue(flush, st)).toBeGreaterThan(0);
  });

  it('백스트레이트(A-2-3-4-5)를 스트레이트로 인정', () => {
    const wheel = evaluate7([c(14, 's'), c(2, 'd'), c(3, 'h'), c(4, 'c'), c(5, 'h'), c(9, 'd'), c(11, 'h')]);
    expect(wheel.category).toBe(4);
    expect(wheel.tiebreak[0]).toBe(5);
  });

  it('같은 족보는 숫자, 그다음 무늬 서열(스다하크)로 결정', () => {
    const pairK = evaluate7([c(13, 's'), c(13, 'd'), c(2, 'h'), c(5, 'c'), c(7, 'h'), c(9, 'd'), c(11, 'h')]);
    const pairQ = evaluate7([c(12, 's'), c(12, 'd'), c(2, 'h'), c(5, 'c'), c(7, 'h'), c(9, 'd'), c(11, 'h')]);
    expect(compareHandValue(pairK, pairQ)).toBeGreaterThan(0);
    // 완전 동률: 최고 카드 무늬가 스페이드인 쪽이 승
    const aSpade = evaluate7([c(14, 's'), c(13, 'c'), c(2, 'h'), c(5, 'c'), c(7, 'd'), c(9, 'h'), c(11, 'd')]);
    const aClub = evaluate7([c(14, 'c'), c(13, 'd'), c(2, 'c'), c(5, 'd'), c(7, 'h'), c(9, 'c'), c(11, 'c')]);
    expect(compareHandValue(aSpade, aClub)).toBeGreaterThan(0);
  });

  it('족보 이름이 모두 있다', () => {
    expect(CATEGORY_NAME[8]).toBe('스트레이트플러시');
    expect(CATEGORY_NAME[0]).toBe('하이카드');
  });

  it('오픈카드 서열은 숫자 뒤 무늬', () => {
    expect(compareUpcards([c(14, 's')], [c(14, 'c')])).toBeGreaterThan(0);
    expect(compareUpcards([c(13, 's')], [c(14, 'c')])).toBeLessThan(0);
  });
});

describe('게임 진행', () => {
  it('한 판 시작: 앤티 4인, 3장씩 배분, 공개 선택 단계', () => {
    const g = createGame(() => 0.5);
    expect(g.pot).toBe(ANTE * 4);
    expect(g.seats.every((s) => s.cards.length === 3)).toBe(true);
    expect(g.phase).toBe('choose-reveal');
  });

  it('4명이 공개 패를 고르면 4번째 카드가 공개로 배분되고 4구 베팅 시작', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    expect(g.phase).toBe('betting');
    expect(g.street).toBe(0);
    expect(g.seats.every((s) => s.cards.length === 4)).toBe(true);
    expect(g.seats.every((s) => s.revealed.filter(Boolean).length === 2)).toBe(true);
  });

  it('모두 체크하면 5구로 진행, 카드가 한 장씩 늘어난다', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    for (let k = 0; k < 4; k++) applyAction(g, g.turn, 'check');
    expect(g.street).toBe(1);
    expect(g.seats[0].cards.length).toBe(5);
  });

  it('레이즈하면 다른 사람이 다시 행동해야 한다', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    const raiser = g.turn;
    applyAction(g, raiser, 'raise');
    expect(g.currentBet).toBe(50);
    // 남은 3명 콜
    for (let k = 0; k < 3; k++) applyAction(g, g.turn, 'call');
    expect(g.street).toBe(1);
    expect(g.pot).toBe(ANTE * 4 + 50 * 4);
  });

  it('3명이 다이 하면 기권승으로 팟 획득', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    applyAction(g, g.turn, 'raise');
    applyAction(g, g.turn, 'fold');
    applyAction(g, g.turn, 'fold');
    applyAction(g, g.turn, 'fold');
    expect(g.phase).toBe('hand-over');
    expect(g.winners.length).toBe(1);
    expect(g.seats[g.winners[0]].chips).toBeGreaterThan(1500 - ANTE);
  });

  it('마지막 베팅까지 가면 승부 공개 후 승자가 팟을 가진다', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    // 모든 스트리트 체크
    for (let street = 0; street < 4; street++) {
      for (let k = 0; k < 4; k++) applyAction(g, g.turn, 'check');
    }
    expect(g.phase).toBe('hand-over');
    expect(g.winners.length).toBe(1);
    const total = g.seats.reduce((sum, s) => sum + s.chips, 0);
    expect(total).toBe(1500 * 4); // 칩 총량 보존
    expect(g.seats[0].cards.length).toBe(7);
  });

  it('7번째 카드는 히든이다', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    for (let street = 0; street < 3; street++) {
      for (let k = 0; k < 4; k++) applyAction(g, g.turn, 'check');
    }
    expect(g.street).toBe(3);
    expect(g.seats[1].revealed[6]).toBe(false);
    expect(g.seats[1].revealed[5]).toBe(true);
  });

  it('파산하면 다음 판 시작 때 기본 칩을 다시 지급한다', () => {
    const g = createGame(() => 0.5);
    g.seats[0].chips = 0;
    startHand(g, () => 0.5);
    expect(g.seats[0].chips).toBeGreaterThanOrEqual(ANTE);
    expect(g.seats[0].refilled).toBe(true);
  });

  it('스트리트당 레이즈는 2회까지', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    applyAction(g, g.turn, 'raise');
    applyAction(g, g.turn, 'raise');
    const third = g.turn;
    applyAction(g, third, 'call'); // 레이즈 불가 상태에서 콜
    expect(g.raisesUsed).toBe(2);
  });
});
