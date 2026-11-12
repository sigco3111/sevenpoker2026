// 한국식 세븐포커 한 판의 진행 엔진.
// 확정 룰: 4인(나+AI 3), 3장 중 1장 선택 공개, 4~6번째 공개+베팅, 7번째 히든+최종 베팅,
//          가상 칩만, 파산 시 기본 칩 재지급, 위임(계속 대리 + 직접 복귀).
// 제안 기본값(사용자 미확정): 앤티 10, 시작 칩 1500, 리필 1000, 베팅 단위 50/50/100/100,
//          스트리트당 레이즈 최대 2회, 무늬 서열 스다하크, 팟은 단독 승자에게(무늬 서열로 동률 해소).

import { Card, newDeck, shuffle, evaluate7, compareHandValue, compareUpcards, HandValue, CATEGORY_NAME } from './cards';

export const ANTE = 10; // 제안 기본값
export const START_CHIPS = 1500; // 제안 기본값
export const REFILL_CHIPS = 1000; // 제안 기본값
export const BET_UNITS = [50, 50, 100, 100]; // 4구·5구·6구·7구 (제안 기본값)
export const MAX_RAISES_PER_STREET = 2; // 제안 기본값

export type Action = 'fold' | 'check' | 'call' | 'raise';
export type Phase = 'choose-reveal' | 'betting' | 'showdown' | 'hand-over';

export interface Seat {
  name: string;
  chips: number;
  cards: Card[];
  revealed: boolean[]; // others에게 공개된 카드
  folded: boolean;
  bet: number; // 이번 스트리트 베팅액
  committed: number; // 이번 판 총 투입
  refilled: boolean; // 이번 판 시작 시 리필 여부
}

export interface LogEntry {
  text: string;
}

export interface GameState {
  seats: Seat[];
  dealer: number;
  phase: Phase;
  street: number; // 0..3
  pot: number;
  currentBet: number;
  raisesUsed: number;
  turn: number; // 현재 행동할 자리
  acted: boolean[]; // 이번 베팅 라운드에서 행동 완료
  revealPicked: boolean[];
  deck: Card[];
  log: LogEntry[];
  winners: number[];
  resultText: string;
  handNumber: number;
}

export function createGame(rng: () => number = Math.random): GameState {
  const seats: Seat[] = ['나', 'AI 1 · 연륜', 'AI 2 · 관찰', 'AI 3 · 직관'].map((name) => ({
    name,
    chips: START_CHIPS,
    cards: [],
    revealed: [],
    folded: false,
    bet: 0,
    committed: 0,
    refilled: false,
  }));
  const state: GameState = {
    seats,
    dealer: 0,
    phase: 'choose-reveal',
    street: 0,
    pot: 0,
    currentBet: 0,
    raisesUsed: 0,
    turn: 0,
    acted: [false, false, false, false],
    revealPicked: [false, false, false, false],
    deck: [],
    log: [],
    winners: [],
    resultText: '',
    handNumber: 0,
  };
  startHand(state, rng);
  return state;
}

function say(state: GameState, text: string) {
  state.log.push({ text });
}

export function activeSeats(state: GameState): number[] {
  return state.seats.map((s, i) => (s.folded ? -1 : i)).filter((i) => i >= 0);
}

export function upcardsOf(state: GameState, seat: number): Card[] {
  const s = state.seats[seat];
  return s.cards.filter((_, i) => s.revealed[i]);
}

function pay(state: GameState, seat: number, amount: number) {
  const s = state.seats[seat];
  const paid = Math.min(amount, s.chips);
  s.chips -= paid;
  s.bet += paid;
  s.committed += paid;
  state.pot += paid;
  return paid;
}

export function startHand(state: GameState, rng: () => number = Math.random) {
  state.handNumber += 1;
  state.deck = shuffle(newDeck(), rng);
  state.pot = 0;
  state.street = 0;
  state.currentBet = 0;
  state.raisesUsed = 0;
  state.winners = [];
  state.resultText = '';
  state.acted = [false, false, false, false];
  state.revealPicked = [false, false, false, false];
  for (const s of state.seats) {
    // 파산 시 기본 칩 재지급(확정). 수치는 제안 기본값.
    if (s.chips < ANTE) {
      s.chips = REFILL_CHIPS;
      s.refilled = true;
    } else {
      s.refilled = false;
    }
    s.cards = [];
    s.revealed = [];
    s.folded = false;
    s.bet = 0;
    s.committed = 0;
  }
  say(state, `— ${state.handNumber}번째 판 —`);
  for (let i = 0; i < state.seats.length; i++) {
    pay(state, i, ANTE);
    if (state.seats[i].refilled) say(state, `${state.seats[i].name}의 칩이 다 떨어져 기본 칩 ${REFILL_CHIPS}칩을 다시 지급했습니다.`);
  }
  say(state, `앤티 ${ANTE}칩씩 걸었습니다.`);
  // 3장씩 배분
  for (let r = 0; r < 3; r++) {
    for (const s of state.seats) {
      s.cards.push(state.deck.pop()!);
      s.revealed.push(false);
    }
  }
  state.phase = 'choose-reveal';
  say(state, '카드 3장을 받았습니다. 공개할 1장을 고르세요.');
}

// 공개할 카드 선택(0..2). AI는 ai.ts가 고른다.
export function chooseReveal(state: GameState, seat: number, index: number) {
  if (state.phase !== 'choose-reveal') return;
  const s = state.seats[seat];
  if (state.revealPicked[seat]) return;
  s.revealed[index] = true;
  state.revealPicked[seat] = true;
  if (state.revealPicked.every(Boolean)) {
    state.street = 0;
    dealStreetCard(state); // 4번째 카드(공개)
    beginStreet(state);
  }
}

function beginStreet(state: GameState) {
  state.phase = 'betting';
  state.currentBet = 0;
  state.raisesUsed = 0;
  for (const s of state.seats) s.bet = 0;
  state.acted = state.seats.map((s) => s.folded);
  // 베팅 시작자: 공개 패가 가장 강한 자리(동률은 무늬 서열, 제안 기본값)
  let opener = -1;
  for (const i of activeSeats(state)) {
    if (opener < 0 || compareUpcards(upcardsOf(state, i), upcardsOf(state, opener)) > 0) opener = i;
  }
  state.turn = opener;
}

function dealStreetCard(state: GameState) {
  const faceUp = state.street < 3; // 7번째 카드(7구)는 히든
  for (const s of state.seats) {
    if (s.folded) continue;
    s.cards.push(state.deck.pop()!);
    s.revealed.push(faceUp);
  }
}

function nextBettor(state: GameState, from: number): number {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (!state.seats[i].folded && !state.acted[i] && state.seats[i].chips > 0) return i;
  }
  return -1;
}

function bettingRoundDone(state: GameState): boolean {
  // 올인(칩 0)한 자리는 더 행동할 수 없으므로 행동 여부와 무관하게 완료로 간주
  return activeSeats(state).every((i) => state.seats[i].chips === 0 || (state.acted[i] && state.seats[i].bet === state.currentBet));
}

export function legalActions(state: GameState, seat: number): Action[] {
  if (state.phase !== 'betting' || state.turn !== seat || state.seats[seat].folded) return [];
  const s = state.seats[seat];
  const toCall = state.currentBet - s.bet;
  const actions: Action[] = ['fold'];
  if (toCall === 0) actions.push('check');
  else if (s.chips >= toCall) actions.push('call');
  const unit = BET_UNITS[state.street];
  if (state.raisesUsed < MAX_RAISES_PER_STREET && s.chips >= toCall + unit) actions.push('raise');
  // 콜할 칩이 부족하면 올인 콜 허용
  if (toCall > 0 && s.chips > 0 && !actions.includes('call')) actions.push('call');
  return actions;
}

export function applyAction(state: GameState, seat: number, action: Action, rng: () => number = Math.random) {
  if (!legalActions(state, seat).includes(action)) return;
  const s = state.seats[seat];
  const toCall = state.currentBet - s.bet;
  const unit = BET_UNITS[state.street];
  if (action === 'fold') {
    s.folded = true;
    say(state, `${s.name} 다이.`);
  } else if (action === 'check') {
    say(state, `${s.name} 체크.`);
  } else if (action === 'call') {
    const paid = pay(state, seat, toCall);
    say(state, `${s.name} 콜 ${paid}칩.`);
  } else if (action === 'raise') {
    pay(state, seat, toCall + unit);
    state.currentBet = s.bet;
    state.raisesUsed += 1;
    say(state, `${s.name} 레이즈 ${state.currentBet}칩.`);
    // 레이즈하면 다른 사람들은 다시 행동
    for (const i of activeSeats(state)) if (i !== seat) state.acted[i] = false;
  }
  state.acted[seat] = true;

  const alive = activeSeats(state);
  if (alive.length === 1) {
    // 기권승
    awardPot(state, alive, '상대가 모두 다이 했습니다.');
    return;
  }
  if (bettingRoundDone(state)) {
    if (state.street < 3) {
      state.street += 1;
      dealStreetCard(state);
      beginStreet(state);
      say(state, `${state.street + 4}번째 카드를 받았습니다.`);
    } else {
      showdown(state);
    }
    return;
  }
  const next = nextBettor(state, seat);
  if (next >= 0) state.turn = next;
}

function awardPot(state: GameState, winners: number[], reason: string) {
  state.phase = 'hand-over';
  state.winners = winners;
  const potWon = state.pot;
  const share = Math.floor(potWon / winners.length);
  for (const w of winners) state.seats[w].chips += share;
  state.pot = 0; // 팟 전액 분배 완료 (단독 수상, 제안 기본값)
  state.resultText = `${winners.map((w) => state.seats[w].name).join(', ')} 승리 — 팟 ${potWon}칩. ${reason}`;
  say(state, state.resultText);
}

function showdown(state: GameState) {
  state.phase = 'showdown';
  const alive = activeSeats(state);
  const values = new Map<number, HandValue>();
  for (const i of alive) values.set(i, evaluate7(state.seats[i].cards));
  let best = alive[0];
  for (const i of alive.slice(1)) {
    if (compareHandValue(values.get(i)!, values.get(best)!) > 0) best = i;
  }
  const v = values.get(best)!;
  say(state, `승부 공개: ${state.seats[best].name} ${CATEGORY_NAME[v.category]}.`);
  awardPot(state, [best], `${CATEGORY_NAME[v.category]}로 승리.`);
}

// UI 편의: 내 차례인지, AI 자동 진행이 필요한지
export function needsAction(state: GameState): 'player' | 'ai' | 'none' {
  if (state.phase === 'choose-reveal') {
    return state.revealPicked[0] ? 'none' : 'player';
  }
  if (state.phase !== 'betting') return 'none';
  return state.turn === 0 ? 'player' : 'ai';
}
