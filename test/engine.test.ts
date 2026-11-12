import { describe, it, expect } from 'vitest';
import { Card, evaluate5, evaluate7, evaluate7Best, compareHandValue, compareUpcards, CATEGORY_NAME } from '../src/engine/cards';
import { createGame, chooseReveal, applyAction, startHand, legalActions, progressSnapshot, canSaveProgress, ANTE } from '../src/engine/game';
import { aiChooseReveal, aiTurn, aiLine } from '../src/engine/ai';

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
    expect(g.winners).toEqual([1, 0]); // 각 구간 실제 수상자 전원(구간1: s1, 구간2: s0)
    expect(g.bestFive[1].length).toBe(5); // 각 수상자의 족보 5장
    expect(g.bestFive[0].length).toBe(5);
  });

  it('다이한 사람의 기여금은 팟에 남지만 수상 자격은 없다', () => {
    const g = forceShowdown([300, 300, 50, 10], [FLUSH, HIGH, JUNK, JUNK], [false, false, true, true]);
    const before = g.seats.map((s) => s.chips);
    applyAction(g, g.turn, 'check');
    expect(g.phase).toBe('hand-over');
    expect(deltas(g, before)).toEqual([660, 0, 0, 0]); // 660 = 전체 팟
    expect(g.pot).toBe(0);
  });

  it('미콜 초과분: 마지막 올인 레이즈를 아무도 못 받으면 초과 구간은 기여자에게 돌아간다', () => {
    // s0이 500까지 올인 레이즈, s1은 250까지만 올인 콜. 승부에서 s1이 이기면
    // 구간1~3(550)은 s1이, 아무도 못 받은 구간4(500-250=250, 자격자 s0뿐)는 s0에게 환불.
    const g = forceShowdown([500, 250, 40, 10], [HIGH, PAIR, JUNK, JUNK], [false, false, true, true]);
    const before = g.seats.map((s) => s.chips);
    applyAction(g, g.turn, 'check');
    expect(g.phase).toBe('hand-over');
    expect(deltas(g, before)).toEqual([250, 550, 0, 0]);
    expect(deltas(g, before).reduce((a, b) => a + b, 0)).toBe(800); // 팟 총량 보존
    // 수상과 반환을 구분해 표시: 패배자의 환불이 수상처럼 보이면 안 됨
    expect(g.resultText).toContain('원페어 550칩');
    expect(g.resultText).toContain('나 미콜 베팅 250칩 반환');
  });

  it('비폴드 자격자 0명 구간(자발적 다이로 발생 가능)은 기여자 각자에게 반환', () => {
    // s0이 110까지 베팅했으나 s1(60)·s2(30)이 올인 콜로만 맞춘 뒤 s0가 자발적 다이를 한 상황.
    // 최상위 구간(110-60=50)은 기여자가 다이한 s0뿐이라 수상 자격자가 없다 → s0에게 반환.
    const g = forceShowdown([110, 60, 30, 10], [JUNK, FLUSH, PAIR, HIGH], [true, false, false, true]);
    const before = g.seats.map((s) => s.chips);
    applyAction(g, g.turn, 'check');
    expect(g.phase).toBe('hand-over');
    // 구간1 10x4=40, 구간2 20x3=60, 구간3 30x2=60 → 전부 s1(플러시) 수상 = 160. 구간4 50x1 → s0 반환.
    expect(deltas(g, before)).toEqual([50, 160, 0, 0]);
    expect(deltas(g, before).reduce((a, b) => a + b, 0)).toBe(210); // 팟 총량 보존
    expect(g.resultText).toContain('플러시 160칩');
    expect(g.resultText).toContain('나 미콜 베팅 50칩 반환');
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

  it('저장 스냅샷은 판 종료 시점에만 만들어진다(중도 저장 금지 회귀)', () => {
    const g = createGame(() => 0.5);
    expect(progressSnapshot(g)).toBeNull(); // 공개 선택 단계
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    expect(progressSnapshot(g)).toBeNull(); // 베팅 단계
    let guard = 0;
    while (g.phase !== 'hand-over' && guard++ < 10) applyAction(g, g.turn, 'fold');
    expect(g.phase).toBe('hand-over');
    const snap = progressSnapshot(g);
    expect(snap).not.toBeNull();
    expect(snap!.hands).toBe(g.handNumber);
    expect(snap!.chips).toEqual(g.seats.map((x) => x.chips));
  });

  it('스냅샷 복원 회귀: 저장된 판 종료 상태가 다음 판 시작 상태와 일치', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    let guard = 0;
    while (g.phase !== 'hand-over' && guard++ < 10) applyAction(g, g.turn, 'fold');
    const snap = progressSnapshot(g)!;
    const g2 = createGame(() => 0.5, snap);
    // 복원 후 새 판의 앤티 차감 전 칩이 저장 시점과 같아야 한다(판 번호는 +1)
    expect(g2.handNumber).toBe(snap.hands! + 1);
    expect(g2.seats.reduce((a, x) => a + x.chips, 0) + g2.pot).toBe(snap.chips!.reduce((a, b) => a + b, 0));
  });

  it('저장 소유권: 다른 탭의 같은 판 저장과 역행을 차단하고 이어쓰기는 허용', () => {
    const snap = { chips: [1, 2, 3, 4], hands: 10 };
    // 기록이 없으면 첫 저장 허용
    expect(canSaveProgress(null, null, snap, 'tabA')).toBe(true);
    // 내가 소유한 기록은 같은 판이라도 이어 쓸 수 있다
    expect(canSaveProgress({ tabId: 'tabA', hands: 10 }, 10, snap, 'tabA')).toBe(true);
    // 다른 탭이 같은 판을 먼저 저장했으면 차단 (같은 판 이중 종료 충돌)
    expect(canSaveProgress({ tabId: 'tabB', hands: 10 }, 10, snap, 'tabA')).toBe(false);
    // 다른 탭의 더 앞선 판은 차단 (역행)
    expect(canSaveProgress({ tabId: 'tabB', hands: 11 }, 11, snap, 'tabA')).toBe(false);
    // 다른 탭보다 앞선 판은 번호상 허용 (끈적 차단은 UI 계층의 saveBlocked가 담당)
    expect(canSaveProgress({ tabId: 'tabB', hands: 9 }, 9, snap, 'tabA')).toBe(true);
    // 소유권 기록이 없는 구형 저장: 번호 비교로 동일하게 동작
    expect(canSaveProgress(null, 10, snap, 'tabA')).toBe(false);
    expect(canSaveProgress(null, 9, snap, 'tabA')).toBe(true);
  });

  it('깨진 저장 값은 무시하고 기본값으로 시작', () => {
    const g = createGame(() => 0.5, { chips: [-5, 1, 2] as unknown as number[], hands: -3 });
    expect(g.seats[0].chips).toBe(1500 - ANTE);
    expect(g.handNumber).toBe(1);
  });
});

describe('AI 성향·정보 위생', () => {
  // 결정론적 난수(LCG): 재현 가능한 시뮬레이션용
  const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

  it('AI는 상대 히든 패를 보지 않는다: 히든 패를 바꿔도 같은 결정', () => {
    // 시드 여러 개로 만든 실제 대국 상태에서, 결정 자리 외 좌석의
    // 비공개 카드만 다른 카드로 바꿔도 aiTurn의 행동이 같아야 한다.
    for (const seed of [7, 42, 1337]) {
      const g = createGame(lcg(seed));
      for (let i = 0; i < 4; i++) chooseReveal(g, i, aiChooseReveal(g, i));
      // 베팅 단계의 각 AI 차례마다 검사
      let guard = 0;
      while (g.phase === 'betting' && guard++ < 50) {
        const seat = g.turn;
        const before = aiTurn(g, seat, lcg(seed * 10 + guard)).action;
        // 다른 좌석의 히든(비공개) 카드만 바꿔침 — 공개 정보는 그대로
        for (let i = 0; i < 4; i++) {
          if (i === seat) continue;
          const s = g.seats[i];
          s.cards = s.cards.map((card, ci) => (s.revealed[ci] ? card : { rank: ((card.rank + 4) % 13) + 2, suit: card.suit }));
        }
        const after = aiTurn(g, seat, lcg(seed * 10 + guard)).action;
        expect(after).toBe(before);
        applyAction(g, seat, before, lcg(seed + guard));
      }
    }
  });

  it('성향별 장기 통계: 연륜(신중)이 가장 많이 다이, 직관(공격)이 가장 많이 레이즈', () => {
    const rng = lcg(20261112);
    const g = createGame(rng);
    const cnt = [0, 1, 2, 3].map(() => ({ fold: 0, raise: 0, call: 0, check: 0, total: 0 }));
    for (let h = 0; h < 1500; h++) {
      let guard = 0;
      while (g.phase !== 'hand-over' && guard++ < 2000) {
        if (g.phase === 'choose-reveal') {
          for (let i = 0; i < 4; i++) if (!g.revealPicked[i]) chooseReveal(g, i, aiChooseReveal(g, i));
        } else if (g.phase === 'betting') {
          const seat = g.turn;
          const { action } = aiTurn(g, seat, rng);
          cnt[seat][action] += 1;
          cnt[seat].total += 1;
          applyAction(g, seat, action, rng);
        } else break;
      }
      startHand(g, rng);
    }
    const rate = (i: number, k: 'fold' | 'raise') => cnt[i][k] / cnt[i].total;
    // seat1=연륜(tight), seat2=관찰(balanced), seat3=직관(loose)
    expect(cnt[1].total).toBeGreaterThan(500);
    expect(rate(1, 'fold')).toBeGreaterThan(rate(2, 'fold')); // 신중이 균형보다 더 다이
    expect(rate(2, 'fold')).toBeGreaterThan(rate(3, 'fold')); // 균형이 공격보다 더 다이
    expect(rate(3, 'raise')).toBeGreaterThan(rate(2, 'raise')); // 공격이 균형보다 더 레이즈
    expect(rate(2, 'raise')).toBeGreaterThan(rate(1, 'raise')); // 균형이 신중보다 더 레이즈
  });

  it('대사 초안: 각 성향·상황에 빈칸 없는 한 줄이 있다', () => {
    for (const seat of [1, 2, 3]) {
      for (const sit of ['reveal', 'raise', 'bluff', 'fold', 'call', 'win', 'lose'] as const) {
        expect(aiLine(seat, sit, () => 0).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('승부 공개 표시 데이터(최적 5장·칩 증감)', () => {
  const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

  it('evaluate7Best는 7장 중 최적 5장의 인덱스를 돌려준다', () => {
    const cards: Card[] = [
      { rank: 14, suit: 's' }, { rank: 14, suit: 'h' }, { rank: 14, suit: 'd' }, { rank: 14, suit: 'c' },
      { rank: 13, suit: 's' }, { rank: 2, suit: 'h' }, { rank: 3, suit: 'c' },
    ]; // 포카드 A, 키커 K
    const { value, indices } = evaluate7Best(cards);
    expect(CATEGORY_NAME[value.category]).toBe('포카드');
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('승부 공개 시 bestFive는 승자의 족보를 이루는 5장을 가리킨다', () => {
    const rng = lcg(777);
    const g = createGame(rng);
    let guard = 0;
    while (guard++ < 5000) {
      while (g.phase !== 'hand-over' && guard++ < 5000) {
        if (g.phase === 'choose-reveal') {
          for (let i = 0; i < 4; i++) if (!g.revealPicked[i]) chooseReveal(g, i, aiChooseReveal(g, i));
        } else if (g.phase === 'betting') {
          const seat = g.turn;
          const { action } = aiTurn(g, seat, rng);
          applyAction(g, seat, action, rng);
        } else break;
      }
      if (g.resultText.includes('승부 공개')) break;
      startHand(g, rng);
    }
    expect(g.resultText).toContain('승부 공개');
    expect(g.phase).toBe('hand-over');
    const w = g.winners[0];
    expect(g.bestFive[w].length).toBe(5);
    const five = g.bestFive[w].map((ci) => g.seats[w].cards[ci]);
    expect(compareHandValue(evaluate5(five), evaluate7(g.seats[w].cards))).toBe(0);
  });

  it('칩 증감: 리필 없는 한 판에서 (현재 칩 - 판 시작 칩)의 합은 0', () => {
    const rng = lcg(42);
    const g = createGame(rng);
    let guard = 0;
    while (g.phase !== 'hand-over' && guard++ < 2000) {
      if (g.phase === 'choose-reveal') {
        for (let i = 0; i < 4; i++) if (!g.revealPicked[i]) chooseReveal(g, i, aiChooseReveal(g, i));
      } else if (g.phase === 'betting') {
        const seat = g.turn;
        const { action } = aiTurn(g, seat, rng);
        applyAction(g, seat, action, rng);
      } else break;
    }
    expect(g.phase).toBe('hand-over');
    expect(g.seats.every((s) => !s.refilled)).toBe(true);
    const deltas = g.seats.map((s, i) => s.chips - g.handStartChips[i]);
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

  it('모두 다이로 끝난 판: 수상자만 표시되고 족보 공개는 없다(패 비공개)', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    let guard = 0;
    while (g.phase !== 'hand-over' && guard++ < 10) applyAction(g, g.turn, 'fold');
    expect(g.phase).toBe('hand-over');
    expect(g.winners.length).toBe(1);
    expect(Object.keys(g.bestFive).length).toBe(0);
    expect(g.showdownRevealed).toBe(false);
  });

  it('직전 판 요약: 새 판을 시작하면 지난 판 결과가 lastResult에 보존된다', () => {
    const g = createGame(() => 0.5);
    for (let i = 0; i < 4; i++) chooseReveal(g, i, 0);
    let guard = 0;
    while (g.phase !== 'hand-over' && guard++ < 10) applyAction(g, g.turn, 'fold');
    expect(g.phase).toBe('hand-over');
    const prev = g.resultText;
    expect(prev.length).toBeGreaterThan(0);
    startHand(g);
    expect(g.lastResult).toBe(prev);
    expect(g.resultText).toBe('');
  });
