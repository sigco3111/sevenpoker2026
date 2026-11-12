// 한국식 세븐포커 한 판의 진행 엔진.
// 확정 룰: 4인(나+AI 3), 3장 중 1장 선택 공개, 4~6번째 공개+베팅, 7번째 히든+최종 베팅,
//          가상 칩만, 파산 시 기본 칩 재지급, 위임(계속 대리 + 직접 복귀).
// 제안 기본값(사용자 미확정): 앤티 10, 시작 칩 1500, 리필 1000, 베팅 단위 50/50/100/100,
//          스트리트당 레이즈 최대 2회, 무늬 서열 스다하크, 팟은 단독 승자에게(무늬 서열로 동률 해소).

import { Card, newDeck, shuffle, evaluate7, evaluate7Best, compareHandValue, compareUpcards, HandValue, CATEGORY_NAME } from './cards';

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
  handStartChips: number[]; // 판 시작(앤티 전) 칩 — 판 종료 시 증감 표시용
  lastResult: string; // 직전 판 결과 요약 (새 판 진행 중 표시)
  bestFive: { [seat: number]: number[] }; // 각 팟 수상자의 7장 중 족보를 이룬 5장 인덱스
  handNames: { [seat: number]: string }; // 승부 공개 판의 생존 자리별 족보 이름(다이·비공개 판은 없음)
  showdownRevealed: boolean; // 승부 공개까지 간 판이면 true (다이 종료 판은 패 비공개 유지)
}

export interface SavedProgress {
  chips?: number[];
  hands?: number;
}

// saved를 주면 시작 전에 칩·판 번호를 복원한다. 앤티/리필 판정은 복원된 값 기준.
export function createGame(rng: () => number = Math.random, saved?: SavedProgress): GameState {
  const chipsOk =
    saved && Array.isArray(saved.chips) && saved.chips.length === 4 && saved.chips.every((n) => Number.isFinite(n) && n >= 0);
  const seats: Seat[] = ['나', 'AI 1 · 연륜', 'AI 2 · 관찰', 'AI 3 · 직관'].map((name, i) => ({
    name,
    chips: chipsOk ? Math.floor(saved!.chips![i]) : START_CHIPS,
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
    handNumber: saved && Number.isFinite(saved.hands) && saved.hands! >= 0 ? Math.floor(saved.hands!) : 0,
    handStartChips: seats.map((x) => x.chips),
    lastResult: '',
    bestFive: {},
    handNames: {},
    showdownRevealed: false,
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
  if (state.resultText) state.lastResult = state.resultText;
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
  // 재지급 반영 후, 앤티 전 칩을 기준으로 기록
  state.handStartChips = state.seats.map((x) => x.chips);
  state.bestFive = {};
  state.handNames = {};
  state.showdownRevealed = false;
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
  state.showdownRevealed = true;
  for (const [i, hv] of values) state.handNames[i] = CATEGORY_NAME[hv.category];
  say(state, `승부 공개: ${state.seats[best].name} ${CATEGORY_NAME[v.category]}.`);
  settlePots(state, values);
}

// 기여금(committed) 구간별로 팟을 나눠 각 구간의 수상 자격자 중 최강 패가 가져간다.
// 적게 걸고 올인한 사람은 자기 기여금까지의 구간(메인팟)만 받을 수 있고,
// 다이한 사람의 기여금은 팟에 남되 수상 자격은 없다.
// 환불 구간(수상이 아니라 돌려받는 칩) 두 가지:
//  - 기여자가 본인뿐인 구간: 아무도 못 받은 미콜 베팅이므로 본인에게 반환
//  - 비폴드 자격자가 0명인 구간: 자발적 다이 등으로 발생 가능. 구간 기여분을 기여자 각자에게 반환
function settlePots(state: GameState, values: Map<number, HandValue>) {
  const levels = [...new Set(state.seats.map((s) => s.committed))].filter((c) => c > 0).sort((a, b) => a - b);
  const winnings = new Map<number, number>();
  const refunds = new Map<number, number>();
  const add = (m: Map<number, number>, i: number, amount: number) => m.set(i, (m.get(i) ?? 0) + amount);
  let prev = 0;
  for (const level of levels) {
    const contributors = state.seats.map((s, i) => ({ s, i })).filter((x) => x.s.committed >= level);
    const share = level - prev;
    prev = level;
    if (share <= 0 || contributors.length === 0) continue;
    if (contributors.length === 1) {
      add(refunds, contributors[0].i, share); // 미콜 베팅 반환
      continue;
    }
    // 이 구간 수상 자격: 다이하지 않았고 기여금이 이 구간 이상인 자리
    let winner = -1;
    for (const i of activeSeats(state)) {
      if (state.seats[i].committed < level) continue;
      if (winner < 0 || compareHandValue(values.get(i)!, values.get(winner)!) > 0) winner = i;
    }
    if (winner < 0) {
      for (const c of contributors) add(refunds, c.i, share); // 자격자 0명: 각자 반환
      continue;
    }
    add(winnings, winner, share * contributors.length);
  }
  state.phase = 'hand-over';
  // 각 구간(메인팟·사이드팟)의 실제 수상자 전원을 승자로 표시하고, 각자의 족보 5장을 계산
  state.winners = [...winnings.keys()];
  for (const w of state.winners) state.bestFive[w] = evaluate7Best(state.seats[w].cards).indices;
  const potWon = state.pot;
  for (const [i, amount] of winnings) state.seats[i].chips += amount;
  for (const [i, amount] of refunds) state.seats[i].chips += amount;
  state.pot = 0;
  const winPart = [...winnings.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([i, amount]) => `${state.seats[i].name} ${CATEGORY_NAME[values.get(i)!.category]} ${amount}칩`)
    .join(' / ');
  const refundPart = [...refunds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([i, amount]) => `${state.seats[i].name} 미콜 베팅 ${amount}칩 반환`)
    .join(' / ');
  state.resultText = `승부 공개 — 팟 ${potWon}칩: ${winPart}${refundPart ? ` / ${refundPart}` : ''}.`;
  say(state, state.resultText);
}

// 저장용 스냅샷: 판 종료 시점에만 만든다. 판 도중(null 반환 구간)에 저장하면
// 앱을 닫았을 때 팟에 묶인 칩이 사라지는 누수가 생긴다.
export function progressSnapshot(state: GameState): SavedProgress | null {
  if (state.phase !== 'hand-over') return null;
  return { chips: state.seats.map((s) => s.chips), hands: state.handNumber };
}

// 저장 소유권: 탭마다 무작위 tabId를 만들고, 저장 시 {tabId, hands}를 함께 기록한다.
// 다른 탭이 같은 판을 먼저 저장했거나 더 앞선 판을 저장했으면 이 탭의 저장은 차단한다.
export interface SaveOwner { tabId: string; hands: number }
export function canSaveProgress(owner: SaveOwner | null, storedHands: number | null, snap: SavedProgress, tabId: string): boolean {
  if (owner && owner.tabId === tabId) return true; // 이 탭이 이어 쓰는 저장
  const base = owner ? owner.hands : storedHands;
  if (base == null || !Number.isFinite(base)) return true; // 기록이 없으면 첫 저장
  return (snap.hands ?? 0) > base; // 같은 판 이중 종료·역행 모두 차단
}

// UI 편의: 내 차례인지, AI 자동 진행이 필요한지
export function needsAction(state: GameState): 'player' | 'ai' | 'none' {
  if (state.phase === 'choose-reveal') {
    return state.revealPicked[0] ? 'none' : 'player';
  }
  if (state.phase !== 'betting') return 'none';
  return state.turn === 0 ? 'player' : 'ai';
}
