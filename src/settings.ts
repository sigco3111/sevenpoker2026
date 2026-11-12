// 대국 진행 속도 설정. 기본은 기존 속도 그대로(사용자 호평의 비행 연출 포함).
// '빠르게'는 AI 턴 간격·판 사이 대기·비행 시간만 짧게 한다.
// 저장 키는 대국 진행 저장(save2)·스토리/토너먼트 저장과 분리된 설정 전용 키다.
const KEY = 'sevenpoker2026.settings1';

export type Speed = 'normal' | 'fast';
export interface Pace {
  aiDelay: number; // AI 턴 사이 간격
  nextHandDelay: number; // 위임 중 결과를 읽을 시간(순차 뒤집기 완료 후 여유)
  flyMs: number; // 딜링 비행 시간
}

// 기본값은 이전 고정 상수(AI_DELAY 650 / NEXT_HAND_DELAY 3500 / FLY_MS 550)와 동일하게 유지
export const PACE_NORMAL: Pace = { aiDelay: 650, nextHandDelay: 3500, flyMs: 550 };
export const PACE_FAST: Pace = { aiDelay: 250, nextHandDelay: 1800, flyMs: 280 };

export function loadSpeed(storage: Pick<Storage, 'getItem'> = localStorage): Speed {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return 'normal';
    const parsed = JSON.parse(raw) as { speed?: unknown };
    return parsed.speed === 'fast' ? 'fast' : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveSpeed(speed: Speed, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify({ v: 1, speed }));
  } catch {
    // 저장 실패는 무시(현재 세션 설정은 유지됨)
  }
}

// 매 호출 시점의 현재 설정을 읽는다. 플레이 중 전환하면
// 이미 예약된 대기/진행 중인 비행은 그대로 끝나고 다음 턴·비행부터 새 속도가 적용된다.
export function pace(storage: Pick<Storage, 'getItem'> = localStorage): Pace {
  return loadSpeed(storage) === 'fast' ? PACE_FAST : PACE_NORMAL;
}
