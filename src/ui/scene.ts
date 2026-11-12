// 장면 화면: 일러스트 + 내레이션/대사 + 버튼. 스토리 모드의 인트로·클리어·실패에 쓴다.

export interface SceneAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface SceneSpec {
  kicker?: string; // 위에 작게
  title: string;
  illustration?: string;
  lines: string[];
  actions: SceneAction[];
}

export function mountScene(root: HTMLElement, spec: SceneSpec): { el: HTMLElement; unmount(): void } {
  const el = document.createElement('div');
  el.className = 'pk-scene';
  if (spec.illustration) {
    const img = document.createElement('img');
    img.className = 'pk-scene-art';
    img.src = spec.illustration;
    img.alt = spec.title;
    img.onerror = () => img.remove(); // 에셋이 없으면 장면 배경만 표시
    el.appendChild(img);
  }
  const body = document.createElement('div');
  body.className = 'pk-scene-body';
  if (spec.kicker) {
    const k = document.createElement('div');
    k.className = 'pk-scene-kicker';
    k.textContent = spec.kicker;
    body.appendChild(k);
  }
  const h = document.createElement('div');
  h.className = 'pk-scene-title';
  h.textContent = spec.title;
  body.appendChild(h);
  for (const line of spec.lines) {
    const p = document.createElement('p');
    p.className = 'pk-scene-line';
    p.textContent = line;
    body.appendChild(p);
  }
  const bar = document.createElement('div');
  bar.className = 'pk-scene-actions';
  for (const a of spec.actions) {
    const b = document.createElement('button');
    b.className = a.primary ? 'pk-btn-primary' : 'pk-btn-block';
    b.textContent = a.label;
    b.onclick = a.onClick;
    bar.appendChild(b);
  }
  body.appendChild(bar);
  el.appendChild(body);
  root.appendChild(el);
  return { el, unmount: () => el.remove() };
}
