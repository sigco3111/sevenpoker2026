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

// 캐릭터별 어조 은행 (제안 기본값 — 미확정 캐릭터 설정).
// 같은 성향이라도 캐릭터마다 다른 목소리를 쓴다. 없는 상황은 성향 은행으로 폴백.
const CHARACTER_LINES: Record<string, Partial<Record<Situation, string[]>>> = {
  '소연': { // 최고참. 느긋하고 여유 있는 어조
    reveal: ['자, 첫 패는 이렇게 가보지.'],
    raise: ['밀 때를 알면 늙지 않지.', '이쯤에서 슬쩍 올려볼까.'],
    bluff: ['가끔은 연기도 필요하네.'],
    fold: ['오늘은 이쯤에서 물러나지.', '무리하지 않는 것도 실력이야.'],
    call: ['천천히 가 보세.'],
    win: ['역시 기다림이 답이야.', '허허, 운이 따라줬군.'],
    lose: ['젊은이가 제법이군.', '이런 날도 있는 법이지.'],
  },
  '하루': { // 딜러 출신. 정확하고 공손한 어조
    reveal: ['이 카드로 시작하겠습니다.'],
    raise: ['계산은 끝났습니다.', '정확히 올리겠습니다.'],
    bluff: ['딜러도 때로는 흔듭니다.'],
    fold: ['이 핸드는 접겠습니다.', '무리하지 않겠습니다.'],
    call: ['콜하겠습니다.'],
    win: ['실수 없이 마무리했습니다.', '테이블 매너가 결과를 냅니다.'],
    lose: ['배울 점이 있네요.'],
  },
  '선우': { // 프로 지망생. 흐름을 읽는 어조
    reveal: ['이 카드, 눈여겨봐 주세요.'],
    raise: ['흐름은 이미 읽었어요.', '지금 몰아야 해요.'],
    bluff: ['읽히는 건 당신이에요.'],
    fold: ['여긴 제 판이 아니에요.', '흐름이 아니면 접습니다.'],
    call: ['한 수 더 봅시다.'],
    win: ['프로의 길은 멀지 않네요.', '읽은 대로 흘렀어요.'],
    lose: ['다음엔 제가 읽습니다.'],
  },
  '미로': { // 수학 선생. 확률·수치 어조
    reveal: ['확률은 이쪽이에요.'],
    raise: ['기댓값이 나왔어요.', '수치가 올리라고 하네요.'],
    bluff: ['이 변수는 예상 못 했죠?'],
    fold: ['승산이 없네요.', '기댓값이 마이너스예요.'],
    call: ['아직 표본이 부족해요.'],
    win: ['계산대로예요.', '확률은 거짓말하지 않아요.'],
    lose: ['분산이 컸네요.'],
  },
  '록키': { // 분위기 메이커. 유쾌한 어조
    reveal: ['짜잔, 이 카드 어때요?'],
    raise: ['분위기 타면 못 멈춰요!', '자, 판을 키워봅시다!'],
    bluff: ['속여볼게요, 깜짝이야!'],
    fold: ['에이, 오늘은 쉬어갑니다.', '이 판은 패스, 다음에 크게!'],
    call: ['끝까지 놀아봅시다!'],
    win: ['파티 시작이에요!', '이맛에 포커 하지요!'],
    lose: ['아이고, 김 빠졌다!'],
  },
  '번개': { // 자칭 승부사. 과격하고 자신감 넘치는 어조
    reveal: ['봤지? 이게 승부사의 패야.'],
    raise: ['전부 걸어도 이긴다!', '물러서면 승부가 아니지!'],
    bluff: ['내 눈을 봐, 떨리지?'],
    fold: ['잠깐 숨 고르는 거야.', '이번만 봐준다.'],
    call: ['도망은 안 가!'],
    win: ['번개가 치는 건 한 번이야!', '이게 승부다!'],
    lose: ['다음 판 두고 보자!'],
  },
};

// 좌석 이름('소연 · 연륜' 형식)에서 캐릭터 어조 은행을 찾는다
function characterBank(name?: string): Partial<Record<Situation, string[]>> | null {
  if (!name) return null;
  const key = Object.keys(CHARACTER_LINES).find((k) => name.startsWith(k));
  return key ? CHARACTER_LINES[key] : null;
}

// 자리의 실제 성향: 상태에 지정된 캐릭터 성향을 우선하고, 없으면 자리별 기본값
export function seatPersonality(state: GameState, seat: number): Personality {
  const p = state.seats[seat]?.personality as Personality | undefined;
  return p && p in MODEL ? p : PERSONALITY[seat] ?? 'balanced';
}

// 상황별 대사 한 줄 (제안 초안). seat 0(나)은 캐릭터가 없어 쓰지 않는다.
// 캐릭터 이름이 주어지면 캐릭터 어조를 우선 쓰고, 없는 상황은 성향 은행으로 폴백한다.
export function aiLine(seat: number, situation: Situation, rng: () => number = Math.random, personality?: Personality, charName?: string): string {
  const bank = characterBank(charName)?.[situation] ?? LINES[personality ?? PERSONALITY[seat] ?? 'balanced'][situation];
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
      if (monster && roll < m.monsterRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng, undefined, s.name) };
      if (strong && roll < m.openRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng, undefined, s.name) };
      if (roll < m.bluffRaise) return { action: 'raise', line: aiLine(seat, 'bluff', rng, undefined, s.name) };
    }
    return { action: 'check', line: null };
  }
  // 콜 비용이 있는 경우
  if (!strong && !monster) {
    if (legal.includes('raise') && roll < m.bluffRaise) return { action: 'raise', line: aiLine(seat, 'bluff', rng, undefined, s.name) };
    if (roll >= m.bluffCatch) return { action: 'fold', line: aiLine(seat, 'fold', rng, undefined, s.name) };
    return { action: legal.includes('call') ? 'call' : 'fold', line: legal.includes('call') ? aiLine(seat, 'call', rng, undefined, s.name) : aiLine(seat, 'fold', rng, undefined, s.name) };
  }
  if (legal.includes('raise') && monster && roll < m.monsterRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng, undefined, s.name) };
  if (legal.includes('raise') && strong && me >= 150 && roll < m.valueRaise) return { action: 'raise', line: aiLine(seat, 'raise', rng, undefined, s.name) };
  return { action: legal.includes('call') ? 'call' : 'fold', line: legal.includes('call') ? aiLine(seat, 'call', rng, undefined, s.name) : aiLine(seat, 'fold', rng, undefined, s.name) };
}

export function aiDecide(state: GameState, seat: number, rng: () => number = Math.random): Action {
  return aiTurn(state, seat, rng).action;
}
