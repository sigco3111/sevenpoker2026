import { describe, it, expect } from 'vitest';
import { createGame, ANTE, DEFAULT_OPPONENTS } from '../src/engine/game';
import { seatPersonality } from '../src/engine/ai';
import { STORY_CHAPTERS, STORY_ENDING_ART, STORY_FAIL_ART, judgeHand, loadStory, saveStory, STORY_KEY } from '../src/story';

const memStore = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    _m: m,
  };
};

describe('캐릭터·챕터 구성(제안 기본값)', () => {
  it('createGame은 지정한 상대의 이름·성향·아바타와 시작 칩을 쓴다', () => {
    const ch = STORY_CHAPTERS[0];
    const g = createGame(() => 0.5, undefined, { opponents: ch.opponents, startChips: ch.startChips });
    expect(g.seats[1].name).toBe('하루 · 딜러');
    expect(g.seats[2].name).toBe('미로 · 계산');
    expect(g.seats[3].name).toBe('록키 · 직관');
    expect(g.seats[1].avatar).toBe('avatars/avatar-4.png');
    expect(g.seats[0].chips).toBe(ch.startChips - ANTE); // 앤티 차감 후
    expect(seatPersonality(g, 1)).toBe('tight');
    expect(seatPersonality(g, 3)).toBe('loose');
  });

  it('기본 자유대국은 기존 3인 조합을 유지한다', () => {
    const g = createGame(() => 0.5);
    expect(g.seats.map((s) => s.name)).toEqual(['나', ...DEFAULT_OPPONENTS.map((o) => o.name)]);
    expect(seatPersonality(g, 1)).toBe('tight');
    expect(seatPersonality(g, 2)).toBe('balanced');
    expect(seatPersonality(g, 3)).toBe('loose');
  });

  it('챕터마다 상대 3명·목표 칩·일러스트가 비어 있지 않다', () => {
    for (const ch of STORY_CHAPTERS) {
      expect(ch.opponents.length).toBe(3);
      expect(ch.goalChips).toBeGreaterThan(ch.startChips);
      expect(ch.illustration.length).toBeGreaterThan(0);
      expect(ch.intro.length).toBeGreaterThan(0);
      expect(ch.clear.length).toBeGreaterThan(0);
    }
  });

  it('챕터마다 인트로와 다른 클리어 장면 아트가 있고, 마지막 챕터 클리어는 엔딩 아트다', () => {
    for (const ch of STORY_CHAPTERS) {
      expect(ch.clearIllustration.length).toBeGreaterThan(0);
    }
    for (const ch of STORY_CHAPTERS.slice(0, -1)) {
      expect(ch.clearIllustration).not.toBe(ch.illustration); // 장면 전환에 맞춘 별도 아트
    }
    expect(STORY_CHAPTERS[STORY_CHAPTERS.length - 1].clearIllustration).toBe(STORY_ENDING_ART);
    expect(STORY_FAIL_ART.length).toBeGreaterThan(0);
  });
});

describe('스토리 판정·진행 저장', () => {
  const ch = STORY_CHAPTERS[0]; // start 1500, goal 2000

  it('목표 도달 clear, 앤티 미만 fail, 그 사이 playing', () => {
    expect(judgeHand(ch, 2000)).toBe('clear');
    expect(judgeHand(ch, 2500)).toBe('clear');
    expect(judgeHand(ch, ANTE - 1)).toBe('fail');
    expect(judgeHand(ch, ANTE)).toBe('playing');
    expect(judgeHand(ch, 1500)).toBe('playing');
  });

  it('진행 저장은 왕복되고, 최대 챕터를 넘지 않는다', () => {
    const store = memStore();
    expect(loadStory(store).unlocked).toBe(0);
    saveStory(store, 2);
    expect(loadStory(store).unlocked).toBe(2);
    saveStory(store, 99);
    expect(loadStory(store).unlocked).toBe(STORY_CHAPTERS.length); // 상한 클램프
  });

  it('깨진 저장은 처음부터', () => {
    const store = memStore();
    store.setItem(STORY_KEY, '{broken');
    expect(loadStory(store).unlocked).toBe(0);
    store.setItem(STORY_KEY, JSON.stringify({ v: 0, unlocked: 5 })); // 다른 버전
    expect(loadStory(store).unlocked).toBe(0);
  });

  it('스토리 저장 키는 자유대국 저장 키와 다르다', () => {
    expect(STORY_KEY).not.toBe('sevenpoker2026.save2');
  });
});
