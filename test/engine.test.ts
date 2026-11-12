import { describe, it, expect } from 'vitest';
import { Card, evaluate7, compareHandValue, compareUpcards, CATEGORY_NAME } from '../src/engine/cards';
import { createGame, chooseReveal, applyAction, startHand, legalActions, ANTE } from '../src/engine/game';
import { aiChooseReveal } from '../src/engine/ai';

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

describe('칩 보존과 올인', () => {
  const sum = (g: ReturnType<typeof createGame>) => g.seats.reduce((a, s) => a + s.chips, 0);

  it('올인 콜: 부족한 금액은 보유 칩까지만 걸리고 칩은 0이 된다', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    g.seats[0].chips = 30;
    g.seats[0].bet = 0;
    g.currentBet = 100;
    g.turn = 0;
    const potBefore = g.pot;
    expect(legalActions(g, 0)).toContain('call');
    applyAction(g, 0, 'call');
    expect(g.seats[0].chips).toBe(0);
    expect(g.seats[0].bet).toBe(30);
    expect(g.pot).toBe(potBefore + 30);
  });

  it('무작위 대국 100판: 진행 중 칩+팟 총량 보존, 정산 후 팟 전액이 칩으로 이동', () => {
    const g = createGame();
    let expected = sum(g) + g.pot;
    for (let h = 0; h < 100; h++) {
      let guard = 0;
      while (g.phase !== 'hand-over' && guard++ < 2000) {
        if (g.phase === 'choose-reveal') {
          for (let i = 0; i < 4; i++) if (!g.revealPicked[i]) chooseReveal(g, i, aiChooseReveal(g, i));
        } else if (g.phase === 'betting') {
          const seat = g.turn;
          const legal = legalActions(g, seat);
          applyAction(g, seat, legal[Math.floor(Math.random() * legal.length)]);
        } else break;
        if ((g.phase as string) !== 'hand-over') expect(sum(g) + g.pot).toBe(expected);
        expect(g.seats.every((s) => s.chips >= 0)).toBe(true);
      }
      expect(g.phase).toBe('hand-over');
      expect(sum(g)).toBe(expected); // 정산 후 총량 그대로
      expect(g.pot).toBe(0); // 팟 전액 분배됨
      startHand(g); // 파산 리필이 있으면 총량이 바뀌므로 기대치 갱신
      expected = sum(g) + g.pot;
    }
  });
});

describe('올인 팟 분리(메인팟·사이드팟) 정산', () => {
  // 족보가 알려진 7장을 직접 배정하고, 마지막 스트리트 베팅 완료 직전 상태를 만든다.
  const SF: Card[] = [
    { rank: 2, suit: 's' }, { rank: 3, suit: 's' }, { rank: 4, suit: 's' }, { rank: 5, suit: 's' }, { rank: 6, suit: 's' },
    { rank: 9, suit: 'd' }, { rank: 13, suit: 'c' },
  ]; // 스트레이트플러시 6
  const FLUSH: Card[] = [
    { rank: 14, suit: 'h' }, { rank: 3, suit: 'h' }, { rank: 5, suit: 'h' }, { rank: 7, suit: 'h' }, { rank: 9, suit: 'h' },
    { rank: 2, suit: 'c' }, { rank: 6, suit: 'd' },
  ]; // 플러시 A
  const PAIR: Card[] = [
    { rank: 8, suit: 'c' }, { rank: 8, suit: 'd' }, { rank: 13, suit: 's' }, { rank: 11, suit: 'h' },
    { rank: 4, suit: 'd' }, { rank: 6, suit: 'h' }, { rank: 10, suit: 'c' },
  ]; // 원페어 8
  const HIGH: Card[] = [
    { rank: 14, suit: 'd' }, { rank: 12, suit: 'c' }, { rank: 10, suit: 'h' }, { rank: 9, suit: 's' },
    { rank: 7, suit: 'd' }, { rank: 5, suit: 'c' }, { rank: 2, suit: 'h' },
  ]; // 하이카드 A
  const JUNK: Card[] = [
    { rank: 3, suit: 'c' }, { rank: 4, suit: 'c' }, { rank: 6, suit: 'c' }, { rank: 7, suit: 'c' },
    { rank: 9, suit: 'c' }, { rank: 11, suit: 'c' }, { rank: 2, suit: 'd' },
  ];

  function forceShowdown(committed: number[], hands: Card[][], folded: boolean[]) {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) {
      const s = g.seats[i];
      s.cards = hands[i];
      s.revealed = hands[i].map(() => true);
      s.folded = folded[i];
      s.committed = committed[i];
      s.bet = 0;
      s.chips = 1000;
    }
    g.pot = committed.reduce((a, b) => a + b, 0);
    g.phase = 'betting';
    g.street = 3;
    g.currentBet = 0;
    g.raisesUsed = 0;
    g.turn = g.seats.findIndex((s) => !s.folded);
    // 마지막 스트리트 베팅 완료 직전: 턴 자리만 미행동, 나머지는 행동 완료
    g.acted = g.seats.map((s, i) => s.folded || i !== g.turn);
    g.deck = [];
    return g;
  }

  const deltas = (g: ReturnType<typeof createGame>, before: number[]) => g.seats.map((s, i) => s.chips - before[i]);

  it('적게 걸고 올인한 사람이 이기면 자기 기여금 구간(메인팟)만 받고, 초과분은 차점자에게', () => {
    const g = forceShowdown([300, 100, 300, 0], [FLUSH, SF, HIGH, JUNK], [false, false, false, true]);
    const before = g.seats.map((s) => s.chips);
    applyAction(g, g.turn, 'check'); // 베팅 완료 → 승부 공개
    expect(g.phase).toBe('hand-over');
    // 구간1: 100x3=300 → 전원 자격, 최강 s1(스트레이트플러시). 구간2: 200x2=400 → s0,s2 중 s0(플러시)
    expect(deltas(g, before)).toEqual([400, 300, 0, 0]);
    expect(g.pot).toBe(0);
    expect(g.winners).toEqual([1]); // 공개 연출은 전체 최강 패
  });

  it('다이한 사람의 기여금은 팟에 남지만 수상 자격은 없다', () => {
    const g = forceShowdown([300, 300, 50, 10], [FLUSH, HIGH, JUNK, JUNK], [false, false, true, true]);
    const before = g.seats.map((s) => s.chips);
    applyAction(g, g.turn, 'check');
    expect(g.phase).toBe('hand-over');
    expect(deltas(g, before)).toEqual([660, 0, 0, 0]); // 660 = 전체 팟
    expect(g.pot).toBe(0);
  });

  it('올인이 여러 층이면 기여금 구간마다 따로 수상자를 정한다(총량 보존)', () => {
    const g = forceShowdown([80, 150, 400, 400], [SF, FLUSH, PAIR, HIGH], [false, false, false, false]);
    const before = g.seats.map((s) => s.chips);
    applyAction(g, g.turn, 'check');
    expect(g.phase).toBe('hand-over');
    // 구간1: 80x4=320 → s0(SF). 구간2: 70x3=210 → s1(플러시). 구간3: 250x2=500 → s2(원페어)
    expect(deltas(g, before)).toEqual([320, 210, 500, 0]);
    expect(deltas(g, before).reduce((a, b) => a + b, 0)).toBe(1030); // 팟 총량과 일치
    expect(g.pot).toBe(0);
  });
});

describe('진행 저장·복원', () => {
  it('복원된 칩으로 첫 판 시작: 앤티는 복원 칩에서 차감(총량 보존)', () => {
    const g = createGame(() => 0.5, { chips: [1000, 500, 250, 100], hands: 0 });
    const sum = g.seats.reduce((a, s) => a + s.chips, 0) + g.pot;
    expect(sum).toBe(1000 + 500 + 250 + 100);
    expect(g.pot).toBe(ANTE * 4);
    expect(g.seats[0].chips).toBe(990);
  });

  it('복원 시 파산 자리는 리필 후 앤티 차감', () => {
    const g = createGame(() => 0.5, { chips: [0, 500, 250, 100], hands: 0 });
    expect(g.seats[0].refilled).toBe(true);
    expect(g.seats[0].chips).toBe(1000 - ANTE);
  });

  it('판 번호도 복원되어 다음 번호부터 시작', () => {
    const g = createGame(() => 0.5, { chips: [1500, 1500, 1500, 1500], hands: 41 });
    expect(g.handNumber).toBe(42);
  });

  it('깨진 저장 값은 무시하고 기본값으로 시작', () => {
    const g = createGame(() => 0.5, { chips: [-5, 1, 2] as unknown as number[], hands: -3 });
    expect(g.seats[0].chips).toBe(1500 - ANTE);
    expect(g.handNumber).toBe(1);
  });
});
