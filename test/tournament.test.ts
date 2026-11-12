import { describe, it, expect } from 'vitest';
import { createGame } from '../src/engine/game';
import { TOURNAMENT_STAGES, bindCharacters, stageOutcome, stageIntroLines } from '../src/tournament';
import { CHARACTERS } from '../src/characters';

bindCharacters(CHARACTERS);
const stage = TOURNAMENT_STAGES[0];

describe('토너먼트 스테이지 판정', () => {
  it('판 수 전에는 ongoing', () => {
    const s = createGame(() => 0.5, undefined, { opponents: [ { name: 'A', personality: 'tight', avatar: '' }, { name: 'B', personality: 'tight', avatar: '' }, { name: 'C', personality: 'tight', avatar: '' } ], startChips: 1500, ante: stage.ante, betUnits: stage.betUnits });
    s.handNumber = 3;
    expect(stageOutcome(s, stage)).toBe('ongoing');
  });
  it('판 수를 채우고 칩 1위면 clear (동률 포함)', () => {
    const s = createGame(() => 0.5);
    s.handNumber = stage.hands;
    s.seats[0].chips = 2000;
    expect(stageOutcome(s, stage)).toBe('clear');
    s.seats[1].chips = 2000; // 동률
    expect(stageOutcome(s, stage)).toBe('clear');
  });
  it('판 수를 채웠지만 1위가 아니면 fail', () => {
    const s = createGame(() => 0.5);
    s.handNumber = stage.hands;
    s.seats[0].chips = 1000;
    s.seats[1].chips = 2000;
    expect(stageOutcome(s, stage)).toBe('fail');
  });
  it('진행 중 파산(앤티 미만)이면 fail', () => {
    const s = createGame(() => 0.5);
    s.handNumber = 2;
    s.seats[0].chips = stage.ante - 1;
    expect(stageOutcome(s, stage)).toBe('fail');
  });
});

describe('토너먼트 인트로 본문 판수', () => {
  it('본문 판수가 각 스테이지 설정 hands와 일치하고 자리표시자가 남지 않는다', () => {
    for (const st of TOURNAMENT_STAGES) {
      const lines = stageIntroLines(st);
      expect(lines.join(' ')).toContain(`${st.hands}판`);
      expect(lines.join(' ')).not.toContain('{hands}');
    }
  });
  it('설정 hands를 바꾸면 본문도 따라간다(회귀: 하드코딩 금지)', () => {
    const custom = { ...TOURNAMENT_STAGES[0], hands: 2 };
    expect(stageIntroLines(custom).join(' ')).toContain('2판을 치른 뒤');
    expect(stageIntroLines(custom).join(' ')).not.toContain('8판');
  });
});
