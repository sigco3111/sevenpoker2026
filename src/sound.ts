// 효과음 (제안 기본값). 외부 오디오 자산 없이 WebAudio로 만든다.
// 설정(settings1 키의 sound)이 꺼짐이면 아무 소리도 내지 않는다.
// 브라우저 자동재생 정책상 AudioContext는 사용자 제스처 이후에만 소리가 나므로,
// 매 호출 때 suspended면 resume을 시도한다(제스처 없는 시점이면 무음으로 지나감).
import { loadSound } from './settings';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (loadSound() === 'off') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0): void {
  const c = ac();
  if (!c) return;
  try {
    const t0 = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur);
  } catch {
    // 재생 실패는 게임 진행과 무관하게 무시
  }
}

export const sfx = {
  deal(): void { tone(880, 0.06, 'triangle', 0.12); },
  chip(): void { tone(1400, 0.05, 'square', 0.06); tone(1900, 0.07, 'square', 0.05, 0.05); },
  win(): void { tone(660, 0.12, 'triangle', 0.13); tone(880, 0.12, 'triangle', 0.13, 0.12); tone(1320, 0.22, 'triangle', 0.13, 0.24); },
  lose(): void { tone(330, 0.18, 'sine', 0.11); tone(220, 0.26, 'sine', 0.09, 0.14); },
};
