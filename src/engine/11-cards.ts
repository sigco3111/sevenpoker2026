// 카드와 족보 판정. 조커 없는 52장.
// 무늬 서열(스페이드 > 다이아 > 하트 > 클로버, 이른바 스다하크)은 "제안 기본값"이다.
// 아직 사용자 미확정 룰이며, 판정 동률 처리에만 쓰인다.

export type Suit = 's' | 'd' | 'h' | 'c';
export interface Card {
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
  suit: Suit;
}

export const SUIT_ORDER: Record<Suit, number> = { s: 3, d: 2, h: 1, c: 0 }; // 스다하크 (제안 기본값)
export const SUIT_LABEL: Record<Suit, string> = { s: '♠', d: '♦', h: '♥', c: '♣' };
export const SUIT_NAME: Record<Suit, string> = { s: '스페이드', d: '다이아', h: '하트', c: '클로버' };

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ['s', 'd', 'h', 'c'] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  }
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rankLabel(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

export interface HandValue {
  category: number; // 8 스트레이트플러시 .. 0 하이카드
  tiebreak: number[]; // 같은 족보 안 비교용 숫자 나열
  topCard: Card; // 무늬 서열 비교용 최고 카드
}

export const CATEGORY_NAME = [
  '하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트플러시',
];

function evaluate5(cards: Card[]): HandValue {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5 && unique[4] === 2) straightHigh = 5; // 백스트레이트(A-5)
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const topCard = cards.slice().sort((a, b) => b.rank - a.rank || SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit])[0];

  if (flush && straightHigh) return { category: 8, tiebreak: [straightHigh], topCard };
  if (groups[0][1] === 4) return { category: 7, tiebreak: [groups[0][0], groups[1][0]], topCard };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, tiebreak: [groups[0][0], groups[1][0]], topCard };
  if (flush) return { category: 5, tiebreak: ranks, topCard };
  if (straightHigh) return { category: 4, tiebreak: [straightHigh], topCard };
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map(([r]) => r).sort((a, b) => b - a);
    return { category: 3, tiebreak: [groups[0][0], ...kickers], topCard };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups.slice(0, 2).map(([r]) => r).sort((a, b) => b - a);
    return { category: 2, tiebreak: [...pairs, groups[2][0]], topCard };
  }
  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map(([r]) => r).sort((a, b) => b - a);
    return { category: 1, tiebreak: [groups[0][0], ...kickers], topCard };
  }
  return { category: 0, tiebreak: ranks, topCard };
}

// n장(5~7) 중 가장 강한 5장 조합
export function evaluate7(cards: Card[]): HandValue {
  const n = cards.length;
  let best: HandValue | null = null;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareHandValue(v, best) > 0) best = v;
          }
  if (!best) throw new Error('evaluate7 needs at least 5 cards');
  return best;
}

// 양수면 a가 강함. 족보 → 숫자 → 무늬 서열(제안 기본값) 순.
export function compareHandValue(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d) return d;
  }
  if (a.topCard.rank !== b.topCard.rank) return a.topCard.rank - b.topCard.rank;
  return SUIT_ORDER[a.topCard.suit] - SUIT_ORDER[b.topCard.suit];
}

// 공개 패만으로 오픈카드 서열(베팅 시작자 결정). 숫자 → 무늬 서열(제안 기본값).
export function compareUpcards(a: Card[], b: Card[]): number {
  const key = (cs: Card[]) =>
    cs.slice().sort((x, y) => y.rank - x.rank || SUIT_ORDER[y.suit] - SUIT_ORDER[x.suit]);
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    if (!ka[i]) return -1;
    if (!kb[i]) return 1;
    if (ka[i].rank !== kb[i].rank) return ka[i].rank - kb[i].rank;
    if (ka[i].suit !== kb[i].suit) return SUIT_ORDER[ka[i].suit] - SUIT_ORDER[kb[i].suit];
  }
  return 0;
}
