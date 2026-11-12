import { describe, it, expect } from 'vitest';
import { writeProgress, readProgress, STORE_KEYS, StoreLike } from '../src/engine/persist';
import { SavedProgress } from '../src/engine/game';

// 메모리 저장소: 두 '탭'이 공유하는 localStorage 역할
function makeStore(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const store: StoreLike = {
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, v); },
  };
  return { store, data };
}

const snap = (hands: number, chips = [100, 200, 300, 400]): SavedProgress => ({ hands, chips });
const rec = (tabId: string, hands: number, chips = [9, 9, 9, 9]) =>
  JSON.stringify({ v: 2, tabId, hands, chips });

describe('진행 저장 임계 구역(writeProgress)', () => {
  it('빈 저장소에 첫 저장: 단일 레코드와 구형 미러가 기록된다', () => {
    const { store, data } = makeStore();
    expect(writeProgress(store, snap(5), 'tabA')).toBe('saved');
    const saved = JSON.parse(data.get(STORE_KEYS.save)!);
    expect(saved).toEqual({ v: 2, tabId: 'tabA', hands: 5, chips: [100, 200, 300, 400] });
    expect(data.get(STORE_KEYS.chips)).toBe('[100,200,300,400]');
    expect(data.get(STORE_KEYS.hands)).toBe('5');
  });

  it('다른 탭이 같은 판을 먼저 저장했으면 차단하고 아무것도 쓰지 않는다', () => {
    const { store, data } = makeStore({ [STORE_KEYS.save]: rec('tabB', 5) });
    expect(writeProgress(store, snap(5), 'tabA')).toBe('blocked-foreign');
    expect(JSON.parse(data.get(STORE_KEYS.save)!).tabId).toBe('tabB'); // 덮어쓰기 없음
  });

  it('다른 탭의 더 앞선 판이면 차단한다(역행 방지)', () => {
    const { store } = makeStore({ [STORE_KEYS.save]: rec('tabB', 7) });
    expect(writeProgress(store, snap(5), 'tabA')).toBe('blocked-foreign');
  });

  it('내 소유권 기록 위에서는 같은 판도 이어 쓸 수 있다', () => {
    const { store } = makeStore({ [STORE_KEYS.save]: rec('tabA', 5) });
    expect(writeProgress(store, snap(5), 'tabA')).toBe('saved');
  });

  it('구형 저장(번호만)은 번호 비교로 동일하게 동작한다', () => {
    const { store } = makeStore({ [STORE_KEYS.hands]: '5' });
    expect(writeProgress(store, snap(5), 'tabA')).toBe('blocked-foreign');
    expect(writeProgress(store, snap(6), 'tabA')).toBe('saved');
  });

  it('깨진 레코드는 없는 것으로 간주한다', () => {
    const { store } = makeStore({ [STORE_KEYS.save]: '{oops' });
    expect(writeProgress(store, snap(1), 'tabA')).toBe('saved');
  });

  it('미러 키 쓰기가 실패해도 단일 레코드는 온전하게 남는다', () => {
    const { store, data } = makeStore();
    const flaky: StoreLike = {
      getItem: store.getItem,
      setItem: (k, v) => { if (k !== STORE_KEYS.save) throw new Error('quota'); store.setItem(k, v); },
    };
    expect(writeProgress(flaky, snap(5), 'tabA')).toBe('saved');
    expect(JSON.parse(data.get(STORE_KEYS.save)!).hands).toBe(5);
    expect(data.has(STORE_KEYS.chips)).toBe(false);
  });

  it('직렬화 없이 두 탭이 엇갈리면 둘 다 통과할 수 있다(경쟁 존재 입증)', () => {
    const { store } = makeStore();
    const readPhase = () => ({
      rec: store.getItem(STORE_KEYS.save),
      hands: store.getItem(STORE_KEYS.hands),
    });
    const a = readPhase();
    const b = readPhase(); // A가 쓰기 전에 B도 검사
    expect(a.rec).toBeNull();
    expect(b.rec).toBeNull();
  });

  it('임계 구역으로 직렬화하면 동시 종료도 한 탭만 저장된다', async () => {
    const { store, data } = makeStore();
    let chain: Promise<unknown> = Promise.resolve();
    const withLock = <T>(fn: () => T): Promise<T> => {
      const p = chain.then(fn);
      chain = p;
      return p;
    };
    const results = await Promise.all([
      withLock(() => writeProgress(store, snap(5, [1, 1, 1, 1]), 'tabA')),
      withLock(() => writeProgress(store, snap(5, [2, 2, 2, 2]), 'tabB')),
    ]);
    expect(results.filter((r) => r === 'saved')).toHaveLength(1);
    expect(results.filter((r) => r === 'blocked-foreign')).toHaveLength(1);
    const saved = JSON.parse(data.get(STORE_KEYS.save)!);
    expect(saved.hands).toBe(5);
    expect(saved.chips).toEqual(saved.tabId === 'tabA' ? [1, 1, 1, 1] : [2, 2, 2, 2]);
  });
});

describe('진행 복원(readProgress)', () => {
  it('save2 레코드를 우선 읽는다', () => {
    const { store } = makeStore({
      [STORE_KEYS.save]: rec('tabA', 8, [1, 2, 3, 4]),
      [STORE_KEYS.hands]: '3',
      [STORE_KEYS.chips]: '[7,7,7,7]',
    });
    expect(readProgress(store)).toEqual({ chips: [1, 2, 3, 4], hands: 8 });
  });

  it('save2가 없으면 구형 키를 읽는다(이전 버전 저장 호환)', () => {
    const { store } = makeStore({ [STORE_KEYS.hands]: '12', [STORE_KEYS.chips]: '[5,6,7,8]' });
    expect(readProgress(store)).toEqual({ chips: [5, 6, 7, 8], hands: 12 });
  });

  it('깨진 save2는 무시하고 구형 키로 넘어간다', () => {
    const { store } = makeStore({ [STORE_KEYS.save]: '{oops', [STORE_KEYS.hands]: '4', [STORE_KEYS.chips]: '[1,1,1,1]' });
    expect(readProgress(store)).toEqual({ chips: [1, 1, 1, 1], hands: 4 });
  });

  it('아무것도 없으면 빈 객체(기본값 시작)', () => {
    const { store } = makeStore();
    expect(readProgress(store)).toEqual({});
  });

  it('칩 배열이 4개가 아니거나 음수면 칩만 버린다', () => {
    const { store } = makeStore({ [STORE_KEYS.save]: rec('tabA', 8, [1, -2, 3]) });
    expect(readProgress(store)).toEqual({ chips: undefined, hands: 8 });
  });
});
