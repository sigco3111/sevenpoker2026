// AI 3인과 위임 시 내 자리를 대신하는 간단한 정책.
// 성향(연륜=신중, 관찰=균형, 직관=공격)은 캐릭터 설정(미확정)에 맞춘 제 판단 구현.

import { Card, SUIT_ORDER, evaluate7 } from './cards';
import { GameState, Action, legalActions, upcardsOf, activeSeats } from './game';

type Personality = 'tight' | 'balanced' | 'loose';
const PERSONALITY: Personality[] = ['balanced', 'tight', 'balanced', 'loose']; // seat 0은 위임 시 사용

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
  // 상대 공개 패에서 보이는 최고 페어 수준을 근사
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

export function aiDecide(state: GameState, seat: number, rng: () => number = Math.random): Action {
  const legal = legalActions(state, seat);
  const s = state.seats[seat];
  const toCall = state.currentBet - s.bet;
  const me = myStrength(state, seat).score;
  const opp = bestVisibleOpponent(state, seat);
  const p = PERSONALITY[seat] ?? 'balanced';
  const roll = rng();

  const strong = me >= 100 && me >= opp; // 페어 이상 + 상대 공개 패보다 약하지 않음
  const monster = me >= 300; // 트리플 이상

  if (toCall === 0) {
    if (legal.includes('raise') && (monster || (strong && roll < (p === 'loose' ? 0.7 : p === 'tight' ? 0.35 : 0.5)))) return 'raise';
    return 'check';
  }
  // 콜 비용이 있는 경우
  if (!strong) {
    const bluffCatch = p === 'loose' ? 0.25 : p === 'tight' ? 0.05 : 0.12;
    if (roll >= bluffCatch) return 'fold';
  }
  if (legal.includes('raise') && monster && roll < (p === 'loose' ? 0.8 : 0.5)) return 'raise';
  if (legal.includes('raise') && strong && me >= 150 && roll < (p === 'loose' ? 0.45 : 0.2)) return 'raise';
  return legal.includes('call') ? 'call' : 'fold';
}
