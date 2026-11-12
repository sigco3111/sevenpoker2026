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

// ---- 저장 오케스트레이션: Web Locks 유무에 따른 두 경로를 그대로 실행해 검증 ----
import { createProgressSaver, LocksLike, StorageSourceLike } from '../src/engine/persist';

// 실제로 직렬화하는 모의 Web Locks: 콜백을 체인에 쌓아 한 번에 하나씩 실행한다.
function makeLocks() {
  const calls: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const locks: LocksLike = {
    request: (name, cb) => {
      calls.push(name);
      const run = tail.then(() => cb());
      tail = run.catch(() => {});
      return run;
    },
  };
  return { locks, calls };
}

// storage 이벤트를 흉내 내는 모의 이벤트 소스(미지원 경로의 window 역할)
function makeEvents() {
  const listeners: ((e: { key: string | null }) => void)[] = [];
  const events: StorageSourceLike = {
    addEventListener: (_type, l) => { listeners.push(l); },
  };
  return { events, fire: (key: string | null) => listeners.forEach((l) => l({ key })) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('저장 오케스트레이션(createProgressSaver)', () => {
  it('Web Locks 경로: 잠금 이름으로 직렬화 요청하고 저장한다', async () => {
    const { store, data } = makeStore();
    const { locks, calls } = makeLocks();
    const saver = createProgressSaver({ store, tabId: 'tabA', locksApi: locks });
    saver.save(snap(5));
    await tick();
    expect(calls).toEqual(['sevenpoker2026.save']);
    expect(JSON.parse(data.get(STORE_KEYS.save)!).tabId).toBe('tabA');
    expect(saver.blocked).toBe(false);
  });

  it('Web Locks 경로: 두 탭의 동일 판 동시 저장이 직렬화되어 나중 탭만 차단된다', async () => {
    // 같은 저장소를 공유하는 두 saver가 같은 시점에 save를 호출한다.
    // 모의 잠금이 콜백을 직렬화하므로, 먼저 임계 구역에 들어간 탭만 기록되고
    // 나중 탭은 이미 기록된 같은 판을 보고 차단된다.
    const { store, data } = makeStore();
    const { locks } = makeLocks();
    const blockedBy: string[] = [];
    const saverA = createProgressSaver({ store, tabId: 'tabA', locksApi: locks, onBlocked: () => blockedBy.push('A') });
    const saverB = createProgressSaver({ store, tabId: 'tabB', locksApi: locks, onBlocked: () => blockedBy.push('B') });
    saverA.save(snap(301));
    saverB.save(snap(301));
    await tick();
    await tick();
    expect(JSON.parse(data.get(STORE_KEYS.save)!).tabId).toBe('tabA'); // 덮어쓰기 없음
    expect(saverA.blocked).toBe(false);
    expect(saverB.blocked).toBe(true);
    expect(blockedBy).toEqual(['B']); // 차단 콜백은 B에서만
  });

  it('미지원 경로: 외부 기록이 없으면 정상 저장하고 차단되지 않는다', () => {
    const { store, data } = makeStore();
    const { events } = makeEvents();
    const saver = createProgressSaver({ store, tabId: 'tabA', locksApi: null, events });
    saver.save(snap(5));
    expect(JSON.parse(data.get(STORE_KEYS.save)!).tabId).toBe('tabA');
    expect(saver.blocked).toBe(false);
  });

  it('미지원 경로: 다른 탭의 save2 기록이 보이면 차단하고 이후 저장하지 않는다', () => {
    const { store, data } = makeStore();
    const { events, fire } = makeEvents();
    let blockedCalls = 0;
    const saver = createProgressSaver({ store, tabId: 'tabA', locksApi: null, events, onBlocked: () => blockedCalls++ });
    saver.save(snap(5)); // 첫 저장으로 가드가 켜진다
    fire('sevenpoker2026.save2'); // 다른 탭의 기록 감지
    expect(saver.blocked).toBe(true);
    expect(blockedCalls).toBe(1);
    saver.save(snap(6)); // 차단 뒤 저장 시도
    expect(JSON.parse(data.get(STORE_KEYS.save)!).hands).toBe(5); // 그대로
    // 무관한 키의 storage 이벤트는 무시한다
  });

  it('미지원 경로: 무관한 키의 storage 이벤트는 차단하지 않는다', () => {
    const { store } = makeStore();
    const { events, fire } = makeEvents();
    const saver = createProgressSaver({ store, tabId: 'tabA', locksApi: null, events });
    saver.save(snap(5));
    fire('sevenpoker2026.chips');
    fire(null);
    expect(saver.blocked).toBe(false);
  });

  it('미지원 경로: 같은 판을 다른 탭이 먼저 저장했으면 차단 콜백이 호출된다', () => {
    const { store, data } = makeStore({ [STORE_KEYS.save]: rec('tabB', 301) });
    const { events } = makeEvents();
    let blockedCalls = 0;
    const saver = createProgressSaver({ store, tabId: 'tabA', locksApi: null, events, onBlocked: () => blockedCalls++ });
    saver.save(snap(301));
    expect(saver.blocked).toBe(true);
    expect(blockedCalls).toBe(1);
    expect(JSON.parse(data.get(STORE_KEYS.save)!).tabId).toBe('tabB'); // 덮어쓰기 없음
  });
});

describe('Web Locks 지원 판정(resolveLocksApi)', () => {
  it('request 함수가 있는 객체만 지원으로 본다', async () => {
    const { resolveLocksApi } = await import('../src/engine/persist');
    const good = { request: () => Promise.resolve() };
    expect(resolveLocksApi(good)).toBe(good);
    expect(resolveLocksApi(undefined)).toBeNull();
    expect(resolveLocksApi(null)).toBeNull();
    expect(resolveLocksApi({})).toBeNull();
    expect(resolveLocksApi({ request: 5 })).toBeNull();
  });

  it('형태가 다른 locks 객체는 미지원 경로(가드)로 처리한다', () => {
    const { store } = makeStore();
    const { events, fire } = makeEvents();
    const saver = createProgressSaver({ store, tabId: 'tabA', locksApi: {} as never, events });
    saver.save(snap(5));
    fire('sevenpoker2026.save2');
    expect(saver.blocked).toBe(true); // 가드가 켜져 있었다는 증거
  });
});
