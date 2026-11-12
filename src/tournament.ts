// 토너먼트 '선셋 컵' — 단계(스테이지) 구성·판정·진행 저장.
// 상대 조합·시작 칩·판 수·앤티/베팅 단위는 전부 작업 기본안(제안 기본값)으로, 사용자 최종확정 전입니다.
import { Character } from './characters';
import { GameState, OpponentSpec } from './engine/game';

export interface TournamentStage {
  id: string;
  name: string;
  opponents: [Character, Character, Character];
  startChips: number;
  hands: number; // 이 판 수를 치른 뒤 칩 1위(동률 포함)면 통과
  ante: number;
  betUnits: number[];
  image: string;
  introLines: string[];
  clearLines: string[];
  failLines: string[];
}

const seat = (c: Character): OpponentSpec => ({ name: c.name, personality: c.personality, avatar: c.avatar });

export const TOURNAMENT_STAGES: TournamentStage[] = [
  {
    id: 'qualifier',
    name: '예선',
    opponents: [null as unknown as Character, null as unknown as Character, null as unknown as Character], // 아래에서 채움
    startChips: 1500,
    hands: 8,
    ante: 10,
    betUnits: [50, 50, 100, 100],
    // 아트 자산 8종: 메뉴 타일과 같은 매핑으로 스토리 챕터 아트와 구분
    image: 'illust/tour-qual.png',
    introLines: ['선셋 컵 예선이 시작됩니다.', '{hands}판을 치른 뒤 칩이 가장 많으면 통과입니다.'],
    clearLines: ['예선 통과! 준결승 테이블이 열렸습니다.'],
    failLines: ['아쉽게 탈락했습니다. 다시 도전해 보세요.'],
  },
  {
    id: 'semi',
    name: '준결승',
    opponents: [null as unknown as Character, null as unknown as Character, null as unknown as Character],
    startChips: 2500,
    hands: 8,
    ante: 20,
    betUnits: [100, 100, 200, 200],
    image: 'illust/tour-semi.png',
    introLines: ['준결승입니다. 판돈이 두 배로 커졌습니다.', '역시 {hands}판, 1위만 결승에 갑니다.'],
    clearLines: ['결승 진출! 마지막 테이블이 기다립니다.'],
    failLines: ['준결승에서 멈췄습니다. 한 번 더!'],
  },
  {
    id: 'final',
    name: '결승',
    opponents: [null as unknown as Character, null as unknown as Character, null as unknown as Character],
    startChips: 3500,
    hands: 10,
    ante: 30,
    betUnits: [150, 150, 300, 300],
    image: 'illust/1-tour-final.png',
    introLines: ['선셋 컵 결승. 클럽의 강자들이 모였습니다.', '{hands}판 뒤 1위가 우승 트로피를 가져갑니다.'],
    clearLines: ['우승! 선셋 컵 챔피언입니다.'],
    failLines: ['준우승에 머물렀습니다. 결승에서 다시 도전하세요.'],
  },
];

// 순환 참조 없이 opponents를 채운다(모듈 로드 시 characters를 import한 쪽에서 호출)
export function bindCharacters(chars: Character[]): void {
  const by = (id: string): Character => {
    const c = chars.find((x) => x.id === id);
    if (!c) throw new Error(`unknown character: ${id}`);
    return c;
  };
  TOURNAMENT_STAGES[0].opponents = [by('haru'), by('miro'), by('rocky')];
  TOURNAMENT_STAGES[1].opponents = [by('seonu'), by('miro'), by('bolt')];
  TOURNAMENT_STAGES[2].opponents = [by('soyeon'), by('seonu'), by('bolt')];
}

// 인트로 문구의 {hands} 자리표시자를 실제 설정 판 수로 치환(본문 판수가 설정값을 따라가게 한다)
export function stageIntroLines(stage: TournamentStage): string[] {
  return stage.introLines.map((line) => line.replaceAll('{hands}', String(stage.hands)));
}

export function stageSeats(stage: TournamentStage): OpponentSpec[] {
  return stage.opponents.map(seat);
}

export type StageOutcome = 'ongoing' | 'clear' | 'fail';

// 판 종료 시점 판정: 판 수를 채웠으면 칩 1위(동률 포함) 여부로 clear/fail, 진행 중 파산(앤티 미만)이면 fail
export function stageOutcome(state: GameState, stage: TournamentStage): StageOutcome {
  const you = state.seats[0]; // 플레이어는 항상 0번 자리
  if (!you || you.chips < state.ante) return 'fail';
  if (state.handNumber < stage.hands) return 'ongoing';
  const top = Math.max(...state.seats.map((s) => s.chips));
  return you.chips >= top ? 'clear' : 'fail';
}

const KEY = 'sevenpoker2026.tour1'; // v1 저장 형식
export interface TournamentProgress { v: 1; stage: number; won: boolean } // stage: 열린 스테이지 index(0~2)

export function loadTournament(): TournamentProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { v: 1, stage: 0, won: false };
    const p = JSON.parse(raw) as TournamentProgress;
    if (p && p.v === 1 && p.stage >= 0 && p.stage <= 2) return { v: 1, stage: p.stage, won: !!p.won };
  } catch { /* 깨진 저장은 무시 */ }
  return { v: 1, stage: 0, won: false };
}

export function saveTournament(p: TournamentProgress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 저장 실패는 진행만 휘발 */ }
}
