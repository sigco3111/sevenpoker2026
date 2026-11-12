// 진행 저장 경로.
// 저장은 버전 붙은 단일 레코드(save2) 한 키에 쓴다. 한 키의 setItem은
// 중간에 찢어지지 않으므로, 쓰기 도중 실패해도 오래된 온전한 레코드가 남는다.
// 구형 번들 롤백 호환용으로 칩/판 번호 미러 키를 뒤이어 쓰되, 미러 실패는
// save2가 이미 기록된 뒤이므로 무시한다. 복원은 save2를 우선 읽고 구형 키를 본다.
// 복수 탭 판정(canSaveProgress)의 읽기-쓰기 직렬화는 호출자가 보장한다
// (브라우저: Web Locks API. 미지원 브라우저: storage 이벤트 감시로 다른 탭의
// 기록이 보이는 순간 이 탭의 저장을 막는 보수적 차단 — 완전한 직렬화는 아니다).
import { SavedProgress, SaveOwner, canSaveProgress } from './game';

export interface StoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORE_KEYS = {
  save: 'sevenpoker2026.save2',
  chips: 'sevenpoker2026.chips', // 구형 미러
  hands: 'sevenpoker2026.hands', // 구형 미러
} as const;

const SAVE_VERSION = 2;

interface SaveRecordV2 extends SaveOwner {
  v: number;
  chips: number[];
}

export type SaveVerdict = 'saved' | 'blocked-foreign';

function readRecord(store: StoreLike): SaveRecordV2 | null {
  try {
    const raw = store.getItem(STORE_KEYS.save);
    if (!raw) return null;
    const rec = JSON.parse(raw) as SaveRecordV2;
    if (rec && rec.v === SAVE_VERSION && typeof rec.tabId === 'string' && Number.isFinite(rec.hands) && Array.isArray(rec.chips)) return rec;
    return null;
  } catch {
    return null; // 깨진 레코드는 없는 것으로 간주
  }
}

// 저장된 진행을 읽는다. save2를 우선, 없으면 구형 키를 본다.
export function readProgress(store: StoreLike): { chips?: number[]; hands?: number } {
  const rec = readRecord(store);
  if (rec) {
    return {
      chips: rec.chips.length === 4 && rec.chips.every((n) => Number.isFinite(n) && n >= 0) ? rec.chips : undefined,
      hands: rec.hands >= 0 ? rec.hands : undefined,
    };
  }
  try {
    const raw = store.getItem(STORE_KEYS.chips);
    const chips = raw ? JSON.parse(raw) : undefined;
    const rawHands = store.getItem(STORE_KEYS.hands);
    const hands = rawHands == null ? NaN : Number(rawHands); // 없는 키는 0판이 아니라 없음
    return {
      chips: Array.isArray(chips) && chips.length === 4 && chips.every((n: unknown) => Number.isFinite(n) && (n as number) >= 0) ? chips : undefined,
      hands: Number.isFinite(hands) && hands >= 0 ? hands : undefined,
    };
  } catch { /* 깨진 저장은 기본값 */
    return {};
  }
}

// 임계 구역 안에서만 호출할 것(Web Locks, 또는 테스트 뮤텍스).
// 다른 탭의 레코드가 같은 판 이상이면 쓰지 않고 차단한다.
export function writeProgress(store: StoreLike, snap: SavedProgress, tabId: string): SaveVerdict {
  const rec = readRecord(store);
  const owner: SaveOwner | null = rec ? { tabId: rec.tabId, hands: rec.hands } : null;
  const rawHands = store.getItem(STORE_KEYS.hands);
  const storedHands = rawHands == null ? null : Number(rawHands);
  if (!canSaveProgress(owner, storedHands, snap, tabId)) return 'blocked-foreign';
  const record: SaveRecordV2 = { v: SAVE_VERSION, tabId, hands: snap.hands ?? 0, chips: snap.chips ?? [] };
  store.setItem(STORE_KEYS.save, JSON.stringify(record)); // 단일 레코드
  // 구형 롤백 호환 미러: 실패해도 save2는 이미 온전하게 기록됐다
  try { store.setItem(STORE_KEYS.chips, JSON.stringify(snap.chips)); } catch { /* 미러 실패 무시 */ }
  try { store.setItem(STORE_KEYS.hands, String(snap.hands)); } catch { /* 미러 실패 무시 */ }
  return 'saved';
}
