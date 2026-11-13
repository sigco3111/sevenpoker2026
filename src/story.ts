// 스토리 모드: 리조트 클럽의 초대(제안 기본값 — 챕터 구성·목표 칩·대사는 사용자 미확정).
// 각 챕터는 장면(일러스트+대사) → 자유대국과 같은 규칙의 대국 → 목표 칩 달성/파산 판정이다.
// 진행(열린 챕터)만 sevenpoker2026.story1 한 키에 원자적으로 저장하고,
// 대국 중의 칩은 저장하지 않는다(자유대국 저장 save2와 분리).

import { OpponentSpec, ANTE } from './engine/game';
import { byId } from './characters';

export interface StoryChapter {
  id: string;
  title: string;
  illustration: string; // 인트로 장면 아트
  clearIllustration: string; // 클리어 장면 아트(장면 전환에 맞춘 별도 일러스트)
  opponents: OpponentSpec[];
  startChips: number;
  goalChips: number;
  intro: string[]; // 장면 대사/내레이션
  clear: string[]; // 챕터 클리어 장면
}

// 장면 전환 전용 아트: 엔딩(마지막 챕터 클리어)과 칩 소진 장면은 챕터와 무관하게 한 종씩 쓴다.
export const STORY_ENDING_ART = 'illust/story-ending.png';
export const STORY_FAIL_ART = 'illust/story-fail.png';

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 'ch1',
    title: '1장 · 첫 초대',
    illustration: 'illust/story-ch1.png',
    clearIllustration: 'illust/story-ch1-clear.png',
    opponents: [byId('haru'), byId('miro'), byId('rocky')],
    startChips: 1500,
    goalChips: 2000,
    intro: [
      '휴양지 소셜클럽에서 초대장이 도착했다.',
      '"이번 주말, 클럽의 포커 테이블에 당신을 초대합니다."',
      '첫 상대는 딜러 출신 하루, 수학 선생 미로, 그리고 분위기 메이커 록키.',
      `${2000}칩을 모으면 본선 테이블에 오를 수 있다.`,
    ],
    clear: ['첫 테이블을 넘겼다.', '록키가 박수를 친다. "역시 초대하길 잘했네!"'],
  },
  {
    id: 'ch2',
    title: '2장 · 본선 테이블',
    illustration: 'illust/story-ch2.png',
    clearIllustration: 'illust/story-ch2-clear.png',
    opponents: [byId('seonu'), byId('rocky'), byId('bolt')],
    startChips: 2000,
    goalChips: 2600,
    intro: [
      '본선 테이블의 조명이 켜진다.',
      '프로 지망생 선우와 자칭 승부사 번개가 기다리고 있다.',
      '선우가 미소 짓는다. "흐름은 언제든 바뀌어요."',
      `${2600}칩을 모으면 챔피언 테이블이다.`,
    ],
    clear: ['본선을 통과했다.', '번개가 혀를 찬다. "다음엔 안 봐준다?"'],
  },
  {
    id: 'ch3',
    title: '3장 · 클럽 챔피언',
    illustration: 'illust/story-ch3.png',
    clearIllustration: STORY_ENDING_ART, // 마지막 챕터 클리어는 곧 엔딩
    opponents: [byId('soyeon'), byId('seonu'), byId('bolt')],
    startChips: 2500,
    goalChips: 3200,
    intro: [
      '마지막 테이블. 클럽의 최고참 소연이 앉아 있다.',
      '"오랜만에 보는 얼굴이네. 즐겁게 해보세."',
      `${3200}칩을 모으면 이 클럽의 새 챔피언이다.`,
    ],
    clear: ['챔피언 트로피가 주인을 찾았다.', '소연이 고개를 끄덕인다. "서두르지 않은 결과야."'],
  },
];

export interface StoryProgress {
  v: number;
  unlocked: number; // 도전 가능한 최대 챕터 index (0-based). CHAPTERS.length면 전부 클리어
}

export const STORY_KEY = 'sevenpoker2026.story1';

export function loadStory(store: { getItem(k: string): string | null }): StoryProgress {
  try {
    const raw = store.getItem(STORY_KEY);
    if (!raw) return { v: 1, unlocked: 0 };
    const rec = JSON.parse(raw) as StoryProgress;
    if (rec && rec.v === 1 && Number.isFinite(rec.unlocked) && rec.unlocked >= 0) {
      return { v: 1, unlocked: Math.min(rec.unlocked, STORY_CHAPTERS.length) };
    }
  } catch { /* 깨진 저장은 처음부터 */ }
  return { v: 1, unlocked: 0 };
}

// 단일 키 setItem은 찢어지지 않으므로 그대로 원자적 기록
export function saveStory(store: { setItem(k: string, v: string): void }, unlocked: number): void {
  store.setItem(STORY_KEY, JSON.stringify({ v: 1, unlocked }));
}

export type HandOutcome = 'playing' | 'clear' | 'fail';

// 판 종료 시점의 내 칩으로 챕터 계속/클리어/실패를 판정한다.
// 실패는 다음 판의 리필(파산 재지급)이 필요한 수준 — 엔진 리필 전에 판정해야 한다.
export function judgeHand(chapter: StoryChapter, myChips: number): HandOutcome {
  if (myChips >= chapter.goalChips) return 'clear';
  if (myChips < ANTE) return 'fail';
  return 'playing';
}
