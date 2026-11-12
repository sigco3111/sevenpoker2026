// AI 3인과 위임 시 내 자리를 대신하는 정책.
// 성향(연륜=신중, 관찰=균형, 직관=공격)과 대사는 캐릭터 설정(미확정)에 맞춘 제안 구현.
// 정보 위생: AI는 자기 카드 전부와 상대의 '공개된' 카드만 본다.
//   상대 히든 패는 읽지 않는다(회귀 테스트가 이를 검증).

import { Card, SUIT_ORDER, evaluate7 } from './cards';
import { GameState, Action, legalActions, upcardsOf, activeSeats } from './game';

type Personality = 'tight' | 'balanced' | 'loose';
const PERSONALITY: Personality[] = ['balanced', 'tight', 'balanced', 'loose']; // seat 0은 위임 시 사용

// 성향별 행동 수치 (제안 기본값 — 미확정 캐릭터 설정)
interface Model {
  needMargin: number; // '강하다'고 판단할 상대 공개 패 대비 여유 점수
  openRaise: number; // 체크 상황에서 강한 패로 레이즈할 확률
  valueRaise: number; // 콜 비용이 있을 때 강한 패로 레이즈할 확률
  monsterRaise: number; // 트리플 이상일 때 레이즈할 확률
  bluffRaise: number; // 약한 패로 레이즈(허세)할 확률
  bluffCatch: number; // 약한 패로 콜하며 끌고갈 확률
}
const MODEL: Record<Personality, Model> = {
  tight: { needMargin: 50, openRaise: 0.35, valueRaise: 0.2, monsterRaise: 0.6, bluffRaise: 0.02, bluffCatch: 0.05 },
  balanced: { needMargin: 0, openRaise: 0.5, valueRaise: 0.35, monsterRaise: 0.7, bluffRaise: 0.06, bluffCatch: 0.15 },
  loose: { needMargin: -60, openRaise: 0.7, valueRaise: 0.5, monsterRaise: 0.85, bluffRaise: 0.18, bluffCatch: 0.35 },
};

export type Situation = 'reveal' | 'raise' | 'bluff' | 'fold' | 'call' | 'win' | 'lose';

// 대사 초안 (미확정 캐릭터 설정 — 사용자 확정 전 제안)
const LINES: Record<Personality, Record<Situation, string[]>> = {
  tight: {
    reveal: ['이걸 보여주지.'],
    raise: ['이 정도면 밀어볼 만하네.', '확실할 때 가는 거야.'],
    bluff: ['…한 번쯤은.'],
    fold: ['여기서 물러나지.', '무리는 금물이야.'],
    call: ['일단 따라가 보세.'],
    win: ['서두르지 않은 결과지.', '경험이 이기는 법이라네.'],
    lose: ['허험, 이럴 수도 있지.'],
  },
  balanced: {
    reveal: ['이 카드로 갈게요.'],
    raise: ['지금이 기회네요.', '흐름이 이쪽이에요.'],
    bluff: ['분위기를 바꿔볼까요?'],
    fold: ['이 판은 넘길게요.', '상대 패가 더 좋아 보여요.'],
    call: ['조금 더 지켜볼게요.'],
    win: ['읽은 대로네요.', '흐름을 탔어요.'],
    lose: ['오, 예상이 빗나갔네요.'],
  },
  loose: {
    reveal: ['이거지!'],
    raise: ['느낌이 왔어!', '간다, 레이즈!'],
    bluff: ['이것도 승부야!', '밀어붙여!'],
    fold: ['앗, 이번엔 아닌가?', '흐름이 아니네.'],
    call: ['끝까지 가보자고!'],
    win: ['역시 직감이야!', '될 때는 되는 법!'],
    lose: ['크으, 아깝다!'],
  },
};

// 자리의 실제 성향: 상태에 지정된 캐릭터 성향을 우선하고, 없으면 자리별 기본값
export function seatPersonality(state: GameState, seat: number): Personality {
  const p = state.seats[seat]?.personality as Personality | undefined;
  return p && p in MODEL ? p : PERSONALITY[seat] ?? 'balanced';
}

// 상황별 대사 한 줄 (제안 초안). seat 0(나)은 캐릭터가 없어 쓰지 않는다.
export function aiLine(seat: number, situation: Situation, rng: () => number = Math.random, personality?: Personality): string {
  const bank = LINES[personality ?? PERSONALITY[seat] ?? 'balanced'][situation];
  return bank[Math.floor(rng() * bank.length)];
}

export function aiChooseReveal(state: GameState, seat: number): number {
  const cards = state.seats[seat].cards.slice(0, 3);
  let best = 0;
  for (let i = 1; i < 3; i++) {
    if (
      cards[i].rank > cards[best].rank ||
      (cards[i].rank === cards[best].rank && SUIT_ORDER[cards[i].suit] > SUIT_ORDER[cards[best].suit])
    ) {
      best = i;
    }
  }
  return best;
}

interface Strength {
  score: number; // 클수록 강함
}

function myStrength(state: GameState, seat: number): Strength {
  const cards = state.seats[seat].cards;
  if (cards.length >= 7) {
    const v = evaluate7(cards);
    return { score: v.category * 100 + (v.tiebreak[0] ?? 0) };
  }
  // 7장 미만: 페어 구성과 최고 숫자로 근사
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const top = Math.max(...cards.map((c) => c.rank));
  let category = 0;
  if (groups[0][1] === 4) category = 7;
  else if (groups[0][1] === 3 && groups[1]?.[1] === 2) category = 6;
  else if (groups[0][1] === 3) category = 3;
  else if (groups[0][1] === 2 && groups[1]?.[1] === 2) category = 2;
  else if (groups[0][1] === 2) category = 1;
  return { score: category * 100 + groups[0][0] + top / 100 };
}

function bestVisibleOpponent(state: GameState, me: number): number {
  // 상대 공개 패에서 보이는 최고 페어 수준을 근사 (히든 패는 보지 않음)
  let worst = 0;
  for (const i of activeSeats(state)) {
    if (i === me) continue;
    const up: Card[] = upcardsOf(state, i);
    const counts = new Map<number, number>();
    for (const c of up) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    const maxCount = Math.max(0, ...counts.values());
    const top = Math.max(0, ...up.map((c) => c.rank));
    const score = (maxCount >= 2 ? 100 : 0) + top;
    worst = Math.max(worst, score);
  }
  return worst;
}

export interface AIDecision {
  action: Action;
  line: string | null; // 이번 행동과 함께 보여 줄 대사(제안 초안). 없으면 null
}

export function aiTurn(state: GameState, seat: number, rng: () => number = Math.random): AIDecision {
  const legal = legalActions(state, seat);
  const s = state.seats[seat];
  const toCall = state.currentBet - s.bet;
  const me = myStrength(state, seat).score;
  const opp = bestVisibleOpponent(state, seat);
  const p = seatPersonality(state, seat);
  const m = MODEL[p];
  const roll = rng();

  const monster = me >= 300; // 트리플 이상
  const strong = me >= 100 && me - opp >= m.needMargin; // 페어 이상 + 성향별 여유

  if (toCall === 0) {
    if (legal.includes('raise')) {
      if (monster && roll < m.monsterRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng) };
      if (strong && roll < m.openRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng) };
      if (roll < m.bluffRaise) return { action: 'raise', line: aiLine(seat, 'bluff', rng) };
    }
    return { action: 'check', line: null };
  }
  // 콜 비용이 있는 경우
  if (!strong && !monster) {
    if (legal.includes('raise') && roll < m.bluffRaise) return { action: 'raise', line: aiLine(seat, 'bluff', rng) };
    if (roll >= m.bluffCatch) return { action: 'fold', line: aiLine(seat, 'fold', rng) };
    return { action: legal.includes('call') ? 'call' : 'fold', line: legal.includes('call') ? aiLine(seat, 'call', rng) : aiLine(seat, 'fold', rng) };
  }
  if (legal.includes('raise') && monster && roll < m.monsterRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng) };
  if (legal.includes('raise') && strong && me >= 150 && roll < m.valueRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng) };
  return { action: legal.includes('call') ? 'call' : 'fold', line: legal.includes('call') ? aiLine(seat, 'call', rng) : aiLine(seat, 'fold', rng) };
}

export function aiDecide(state: GameState, seat: number, rng: () => number = Math.random): Action {
  return aiTurn(state, seat, rng).action;
}
