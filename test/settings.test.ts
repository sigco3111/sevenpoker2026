import { describe, it, expect } from 'vitest';
import { loadSpeed, saveSpeed, pace, PACE_NORMAL, PACE_FAST } from '../src/settings';

// localStorage 대체용 인메모리 저장소
function mem(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  } as Storage;
}

describe('진행 속도 설정', () => {
  it('저장값이 없으면 기본(기존 속도)', () => {
    expect(loadSpeed(mem())).toBe('normal');
  });
  it('기본 속도는 이전 고정값과 같다(회귀: 기본 체감 유지)', () => {
    expect(PACE_NORMAL).toEqual({ aiDelay: 650, nextHandDelay: 3500, flyMs: 550 });
  });
  it('빠르게는 모든 수치가 기본보다 짧다', () => {
    expect(PACE_FAST.aiDelay).toBeLessThan(PACE_NORMAL.aiDelay);
    expect(PACE_FAST.nextHandDelay).toBeLessThan(PACE_NORMAL.nextHandDelay);
    expect(PACE_FAST.flyMs).toBeLessThan(PACE_NORMAL.flyMs);
  });
  it('저장·읽기 왕복과 잘못된 값 폴백', () => {
    const s = mem();
    saveSpeed('fast', s);
    expect(loadSpeed(s)).toBe('fast');
    saveSpeed('normal', s);
    expect(loadSpeed(s)).toBe('normal');
    s.setItem('sevenpoker2026.settings1', 'not-json');
    expect(loadSpeed(s)).toBe('normal');
    s.setItem('sevenpoker2026.settings1', JSON.stringify({ v: 1, speed: 'ludicrous' }));
    expect(loadSpeed(s)).toBe('normal');
  });
  it('pace()는 매 호출 시 최신 설정을 반영한다(플레이 중 전환)', () => {
    const s = mem();
    expect(pace(s)).toEqual(PACE_NORMAL);
    saveSpeed('fast', s);
    expect(pace(s)).toEqual(PACE_FAST); // 재시작 없이 다음 읽기부터 반영
    saveSpeed('normal', s);
    expect(pace(s)).toEqual(PACE_NORMAL);
  });
});
