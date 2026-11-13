// 대국 화면 렌더링과 조작. 모바일 한 화면 구성(390x844) 우선.
// 테이블 구성: 펠트 위 상대 3인 + 중앙 덱/팟, 아래 내 자리. 딜링·뒤집기 연출 포함.
import { Card, rankLabel, SUIT_LABEL } from '../engine/cards';
import { GameState, legalActions, needsAction, chooseReveal, applyAction, startHand, progressSnapshot } from '../engine/game';
import { readProgress, createProgressSaver, resolveLocksApi } from '../engine/persist';
import { aiChooseReveal, aiTurn, aiLine, seatPersonality } from '../engine/ai';
import { loadSpeed, saveSpeed, pace } from '../settings';

const AVATARS = ['', 'avatars/avatar-1.png', 'avatars/avatar-2.png', 'avatars/avatar-3.png'];
// 진행 속도 수치는 settings.ts로 이동(기본값 동일). 매 대기·비행 시작 시점에 pace()로 읽어
// 플레이 중 속도 전환이 다음 턴·비행부터 자연 적용되게 한다(진행 중 연출은 유지).

export interface UI {
  el: HTMLElement;
  render(): void;
  state: GameState;
  unmount(): void; // 자동 진행 타이머를 멈추고 DOM에서 제거
}

export interface TableOptions {
  title?: string; // 기본 '자유 대국'
  persist?: boolean; // 기본 true. false면 진행 저장을 끈다(스토리 등 별도 저장 모드)
  onExit?: () => void; // 주어지면 '메뉴로' 버튼을 표시
  onHandOver?: (state: GameState) => void; // 판이 끝나 hand-over에 진입할 때마다 호출
  goalChips?: number; // 스토리 챕터 목표 칩. 주어지면 제목 줄에 목표까지 남은 칩을 함께 표시
  tourTotalHands?: number; // 토너먼트 스테이지 총 판 수. 주어지면 제목 줄에 진행(n/N판)과 현재 순위를 표시
}

export function mountTable(root: HTMLElement, state: GameState, opts?: TableOptions): UI {
  const el = document.createElement('div');
  el.className = 'pk-table';
  root.appendChild(el);
  const persist = opts?.persist !== false;

  let delegated = false; // 위임 중 (확정: 직접 돌아올 때까지 계속)
  let busy = false;
  let stopped = false; // unmount 후 자동 진행 중단

  // 연출용 이전 상태 (자리별 카드 수, 공개 여부)
  let prevCounts = [0, 0, 0, 0];
  let prevVis: boolean[][] = [[], [], [], []];
  // 최신 렌더의 카드 요소. 딜링 비행이 리렌더 후에도 현재 DOM을 다시 찾을 수 있게 렌더 밖에서 유지한다.
  const cardEls: (HTMLElement | undefined)[][] = [[], [], [], []];

  // AI 대사(제안 초안): 자리별 최근 한 줄. 새 판이 시작되면 지운다.
  let lines: (string | null)[] = [null, null, null, null];
  let lineHand = 0;
  let prevPhase = '';

  function cardEl(card: Card | null, opts: { big?: boolean; mini?: boolean; mid?: boolean; hole?: boolean; pickable?: boolean; flip?: boolean; flipDelay?: number; five?: boolean; onPick?: () => void } = {}) {
    const d = document.createElement(opts.onPick ? 'button' : 'div');
    d.className = 'pk-card' + (opts.big ? ' big' : '') + (opts.mini ? ' mini' : '') + (opts.mid ? ' mid' : '') + (opts.hole ? ' pk-hole' : '') + (opts.onPick ? ' pickable' : '') + (opts.flip ? ' pk-flipin' : '') + (opts.five ? ' pk-five' : '');
    if (opts.flip && opts.flipDelay) d.style.animationDelay = `${opts.flipDelay}ms`;
    if (!card) {
      d.classList.add('back');
      d.setAttribute('aria-label', '뒷면 카드');
      return d;
    }
    const red = card.suit === 'h' || card.suit === 'd';
    d.classList.add(red ? 'red' : 'black');
    d.innerHTML = `<span>${rankLabel(card.rank)}</span><span class="suit">${SUIT_LABEL[card.suit]}</span>`;
    d.setAttribute('aria-label', `${rankLabel(card.rank)} ${SUIT_LABEL[card.suit]}`);
    if (opts.onPick) (d as HTMLButtonElement).onclick = opts.onPick;
    return d;
  }

  // 판 종료 시 칩 증감(베팅·수상·미콜 반환을 합산한 순변화)
  function deltaHtml(i: number, chips: number): string {
    if (state.phase !== 'hand-over') return '';
    const start = state.handStartChips?.[i];
    if (start === undefined) return '';
    const d = chips - start;
    if (d === 0) return '';
    return ` <span class="pk-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d.toLocaleString()}</span>`;
  }

  function act(action: 'fold' | 'check' | 'call' | 'raise') {
    if (busy) return;
    applyAction(state, 0, action);
    saveChips();
    render();
    pump();
  }

  // 이 탭의 저장 소유권 id. 페이지를 열 때마다 새로 만든다.
  const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  // 다른 탭의 저장과 한 번이라도 충돌하면 saver.blocked가 켜진다. 차단된 탭은 이후
  // 판을 더 진행해도 저장하지 않는다(따라잡은 뒤 덮어쓰는 것도 막기 위해).
  // 새로고침하면 최신 진행을 이어간다.
  // persist=false(스토리 등)면 저장 장치를 만들지 않는다. 자유대국 저장(save2)을
  // 다른 모드의 진행으로 덮어쓰지 않기 위함이며, 이 경우 Web Locks 안내도 띄우지 않는다.
  const locksApi = persist ? resolveLocksApi((navigator as { locks?: unknown }).locks) : null;
  const locksSupported = locksApi !== null;
  const saver = persist
    ? createProgressSaver({
        store: localStorage,
        tabId: TAB_ID,
        locksApi,
        events: window,
        onBlocked: () => render(),
      })
    : null;

  function saveChips() {
    // 저장은 판 종료 시점에만 한다. 판 도중(베팅이 팟에 묶인 상태) 저장하면
    // 앱을 닫았다 열었을 때 진행 중이던 팟이 사라져 전체 칩이 새는 문제가 있다.
    if (!saver) return;
    const snap = progressSnapshot(state);
    if (!snap) return;
    saver.save(snap);
  }

  function pump() {
    // AI 자리와 위임 중 내 자리를 자동 진행
    if (busy || stopped) return;
    const step = () => {
      if (stopped) return;
      let acted = false;
      if (state.phase === 'choose-reveal') {
        for (let i = 0; i < 4; i++) {
          if (i === 0 && !delegated) continue; // 위임 중이면 내 공개 패도 AI가 선택
          if (!state.revealPicked[i]) {
            chooseReveal(state, i, aiChooseReveal(state, i));
            if (i >= 1) lines[i] = aiLine(i, 'reveal', Math.random, seatPersonality(state, i), state.seats[i].name);
            acted = true;
            break;
          }
        }
      } else if (state.phase === 'betting') {
        const need = needsAction(state);
        if (need === 'ai' || (need === 'player' && delegated)) {
          const seat = state.turn;
          const { action, line } = aiTurn(state, seat);
          applyAction(state, seat, action);
          if (seat >= 1) lines[seat] = line;
          acted = true;
        }
      } else if (state.phase === 'hand-over' && delegated) {
        acted = true; // 결과를 잠시 보여 준 뒤 아래 타임아웃에서 다음 판 자동 시작
      }
      render();
      if (acted) {
        saveChips();
        busy = true;
        const delay = state.phase === 'hand-over' ? pace().nextHandDelay : pace().aiDelay;
        setTimeout(() => {
          busy = false;
          if (state.phase === 'hand-over') {
            if (!delegated) { render(); return; } // 그 사이 '직접 하기'로 복귀
            startHand(state);
            saveChips();
          }
          step();
        }, delay);
      }
    };
    step();
  }

  // 딜링 연출: 덱에서 해당 자리의 새 카드 위치로 카드 뒷면이 날아감.
  // 렌더마다 DOM이 통째로 갈려 이전 캡처 요소가 끊기면 비행이 지워져
  // '첫 배분에만 날아오는' 문제가 있었다. 덱·목표 카드를 매 프레임 다시 찾아
  // 리렌더가 있어도 비행이 끝까지 이어지게 한다. 목표가 교체되면 새 요소를 숨기고
  // 그 위치로 이어서 날아간다.
  function animateDeals(newBySeat: { seat: number; cis: number[] }[]) {
    const flyMs = pace().flyMs;
    for (const { seat, cis } of newBySeat) {
      cis.forEach((ci, k) => {
        const deck0 = el.querySelector('.pk-deck');
        if (!deck0) return;
        const fly = document.createElement('div');
        fly.className = 'pk-card mini back pk-fly';
        const dr0 = deck0.getBoundingClientRect();
        fly.style.left = `${dr0.left + dr0.width / 2 - 12}px`;
        fly.style.top = `${dr0.top + dr0.height / 2 - 17}px`;
        document.body.appendChild(fly);
        let hidden: HTMLElement | undefined = cardEls[seat][ci];
        if (hidden) hidden.style.visibility = 'hidden';
        const startAt = performance.now() + 40 + k * 120;
        const rot = (k % 2 ? -1 : 1) * 8;
        const tick = () => {
          if (!fly.isConnected) return;
          const deck = el.querySelector('.pk-deck');
          if (!deck || !deck.isConnected) { if (hidden) hidden.style.visibility = ''; fly.remove(); return; }
          const target = cardEls[seat][ci];
          if (!target) { if (hidden) hidden.style.visibility = ''; fly.remove(); return; } // 새 판 시작 등으로 카드가 사라지면 비행 종료
          if (target !== hidden) {
            if (hidden) hidden.style.visibility = '';
            target.style.visibility = 'hidden';
            hidden = target;
          }
          const t = Math.min(1, Math.max(0, (performance.now() - startAt) / flyMs));
          const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
          const dr = deck.getBoundingClientRect();
          const sx = dr.left + dr.width / 2;
          const sy = dr.top + dr.height / 2;
          const tr = (hidden ?? deck).getBoundingClientRect();
          fly.style.left = `${sx + (tr.left + tr.width / 2 - sx) * e - 12}px`;
          fly.style.top = `${sy + (tr.top + tr.height / 2 - sy) * e - 17}px`;
          fly.style.transform = `rotate(${rot * e}deg)`;
          if (t < 1) requestAnimationFrame(tick);
          else { if (hidden) hidden.style.visibility = ''; fly.remove(); }
        };
        requestAnimationFrame(tick);
      });
    }
  }

  function render() {
    if (state.handNumber !== lineHand) {
      lines = [null, null, null, null]; // 새 판: 대사 초기화
      lineHand = state.handNumber;
    }
    if (state.phase === 'hand-over' && prevPhase !== 'hand-over') {
      opts?.onHandOver?.(state);
      // 승부 결과에 맞춰 승자·패자 대사(제안 초안)
      for (let i = 1; i < 4; i++) {
        if (state.winners.includes(i)) lines[i] = aiLine(i, 'win', Math.random, seatPersonality(state, i), state.seats[i].name);
        else if (!state.seats[i].folded) lines[i] = aiLine(i, 'lose', Math.random, seatPersonality(state, i), state.seats[i].name);
      }
    }
    prevPhase = state.phase;
    const me = state.seats[0];
    const myTurn = needsAction(state) === 'player';
    const legal = legalActions(state, 0);
    const toCall = state.currentBet - me.bet;
    const unit = state.betUnits[state.street];

    const streetLabel =
      state.phase === 'choose-reveal' ? '공개할 카드 선택'
      : state.phase === 'betting' ? `${state.street + 4}번째 카드`
      : state.phase === 'showdown' ? '승부 공개'
      : '판 정리';

    el.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'pk-title';
    const goal = opts?.goalChips;
    const remain = goal !== undefined ? goal - state.seats[0].chips : 0;
    const goalText = goal !== undefined ? (remain > 0 ? ` · 목표까지 ${remain}칩` : ' · 목표 달성') : '';
    const total = opts?.tourTotalHands;
    // 토너먼트: 판 진행(n/N)과 칩 기준 현재 순위(동점이면 상위 공동)를 제목 줄에 표시
    const rank = total !== undefined ? 1 + state.seats.filter((s) => s.chips > state.seats[0].chips).length : 0;
    const handText = total !== undefined ? `${Math.min(state.handNumber, total)}/${total}판 · 현재 ${rank}위` : `${state.handNumber}번째 판`;
    title.innerHTML = `<span>세븐포커2026 <small>${opts?.title ?? '자유 대국'} · ${handText}${goalText}</small></span>`;
    {
      const speedBtn = document.createElement('button');
      speedBtn.className = 'pk-speed';
      const fast = loadSpeed() === 'fast';
      speedBtn.textContent = `빠르게 ${fast ? '켜짐' : '꺼짐'}`;
      speedBtn.title = '대국 진행 속도를 바꿉니다. 비행 연출과 규칙은 그대로입니다.';
      speedBtn.setAttribute('aria-pressed', String(fast));
      speedBtn.onclick = () => {
        saveSpeed(fast ? 'normal' : 'fast');
        render();
      };
      title.appendChild(speedBtn);
    }
    if (opts?.onExit) {
      const exit = document.createElement('button');
      exit.className = 'pk-exit';
      exit.textContent = '메뉴로';
      exit.onclick = () => opts.onExit!();
      title.appendChild(exit);
    }
    el.appendChild(title);

    // Web Locks 미지원 브라우저: 시작부터 복수 탭 저장 보호 한계를 알린다.
    // (아래 충돌 후 경고와는 별개의 상시 안내)
    if (persist && !locksSupported) { // 저장하지 않는 모드(스토리·토너먼트)에서는 안내 불필요
      const note = document.createElement('div');
      note.className = 'pk-last';
      note.textContent = '이 브라우저에서는 여러 탭의 동시 저장을 보호하지 못합니다. 한 탭에서만 플레이해 주세요.';
      el.appendChild(note);
    }

    // 다른 탭이 더 앞선 진행을 저장 중이면 알림 (이 탭의 진행은 저장되지 않음)
    if (saver?.blocked) {
      const warn = document.createElement('div');
      warn.className = 'pk-last';
      warn.textContent = '다른 탭에서 저장된 진행이 있어 이 탭의 진행은 저장되지 않습니다. 새로고침하면 최신 진행을 이어갑니다.';
      el.appendChild(warn);
    }

    // 직전 판 결과 요약 (족보 이름과 칩만, 숨김 패 내용은 포함하지 않음)
    if (state.lastResult && state.phase !== 'hand-over') {
      const last = document.createElement('div');
      last.className = 'pk-last';
      last.textContent = `직전 판: ${state.lastResult}`;
      el.appendChild(last);
    }

    // 카드 index → 렌더된 요소 (딜링 연출의 정확한 목표 지점 추적용)
    cardEls[0].length = 0; cardEls[1].length = 0; cardEls[2].length = 0; cardEls[3].length = 0;

    // 펠트 테이블
    const felt = document.createElement('div');
    felt.className = 'pk-felt';
    el.appendChild(felt);

    // 승부 공개 연출: 새로 공개되는 카드의 뒤집기를 순서대로 조금씩 늦춘다
    let flipSeq = 0;

    // 상대 3인: 테이블 상단 아치 배치
    for (let i = 1; i < 4; i++) {
      const s = state.seats[i];
      const seat = document.createElement('div');
      seat.className =
        `pk-opp pk-opp-${i}` +
        (s.folded ? ' pk-folded' : '') +
        (state.phase === 'betting' && state.turn === i ? ' pk-active' : '') +
        (state.phase === 'hand-over' && state.winners.includes(i) ? ' pk-winner' : '');
      const top = document.createElement('div');
      top.className = 'pk-opp-top';
      // 아바타 + 이니셜 폴백: 이미지 로딩 중·실패 시에도 이름 첫 글자로 누구인지 식별 가능하게 한다.
      const wrap = document.createElement('span');
      wrap.className = 'pk-ava-wrap';
      const fb = document.createElement('span');
      fb.className = 'pk-ava-fallback';
      fb.textContent = s.name.replace(/·.*/, '').trim().charAt(0) || s.name.charAt(0);
      wrap.appendChild(fb);
      const ava = document.createElement('img');
      ava.className = 'pk-ava';
      ava.src = s.avatar ?? AVATARS[i];
      ava.onerror = () => ava.remove(); // 로드 실패 시 이니셜 폴백이 남는다
      ava.alt = s.name;
      wrap.appendChild(ava);
      top.appendChild(wrap);
      const info = document.createElement('div');
      info.className = 'pk-opp-info';
      info.innerHTML = `<span class="pk-name">${s.name}</span><span class="pk-chips">${s.chips.toLocaleString()}칩${deltaHtml(i, s.chips)}${s.folded ? ' · 다이' : ''}${!s.folded && s.chips === 0 && state.phase !== 'hand-over' ? ' · 올인' : ''}</span>`;
      top.appendChild(info);
      seat.appendChild(top);
      const lineEl = document.createElement('div');
      lineEl.className = 'pk-line';
      lineEl.textContent = lines[i] ?? '';
      seat.appendChild(lineEl);
      const cards = document.createElement('div');
      cards.className = 'pk-cards';
      // 승부 공개까지 간 판만, 생존한 자리만 전체 공개. 다이한 자리의 숨김 패와 다이 종료 판은 비공개 유지.
      const allShown = (state.phase === 'showdown' || state.phase === 'hand-over') && state.showdownRevealed && !s.folded;
      const order = s.cards.map((c, ci) => ({ c, ci }))
        .sort((a, b) => Number(allShown || s.revealed[b.ci]) - Number(allShown || s.revealed[a.ci]));
      // 숨김 패(뒷면)와 공개 패를 구획 분리. 넓은 화면에서는 display:contents로 기존 한 행 배치와 동일하고,
      // 좁은 화면(≤360px)에서는 뒷면을 컴팩트 스택으로 접어 공개 4장의 랭크·무늬 전면 식별을 지킨다.
      const backs = document.createElement('div');
      backs.className = 'pk-backs';
      const opens = document.createElement('div');
      opens.className = 'pk-opens';
      cards.appendChild(backs);
      cards.appendChild(opens);
      order.forEach(({ c, ci }) => {
        const visible = allShown || s.revealed[ci];
        const wasVisible = prevVis[i][ci] === true;
        const flip = visible && !wasVisible && prevCounts[i] >= s.cards.length;
        const ce = cardEl(visible ? c : null, { mid: true, flip, flipDelay: flip && state.phase !== 'betting' ? flipSeq++ * 120 : 0, five: state.phase === 'hand-over' && (state.bestFive[i] ?? []).includes(ci) });
        cardEls[i][ci] = ce;
        (visible ? opens : backs).appendChild(ce);
      });
      seat.appendChild(cards);
      // 승부 공개된 자리의 족보 이름(생존 자리만, 다이·비공개 판은 표시 없음)
      if (allShown && state.handNames[i]) {
        const hn = document.createElement('div');
        hn.className = 'pk-hand';
        hn.textContent = state.handNames[i];
        seat.appendChild(hn);
      }
      felt.appendChild(seat);
    }

    // 중앙 덱 + 팟
    const center = document.createElement('div');
    center.className = 'pk-center';
    const deck = document.createElement('div');
    deck.className = 'pk-deck';
    center.appendChild(deck);
    const potbar = document.createElement('div');
    potbar.className = 'pk-potbar';
    potbar.innerHTML = `<span>${streetLabel}</span><span>팟 <strong>${state.pot.toLocaleString()}칩</strong></span>`;
    // 스트리트 진행 점(3~7번째 카드): 현재 위치 인지용. 중앙 여백에 상태 정보만 추가
    const streetIdx = state.phase === 'choose-reveal' ? 0 : Math.max(0, Math.min(4, state.street + 1));
    const dots = document.createElement('div');
    dots.className = 'pk-street-dots';
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('i');
      if (i <= streetIdx) d.className = 'on';
      dots.appendChild(d);
    }
    potbar.appendChild(dots);
    center.appendChild(potbar);
    felt.appendChild(center);

    // 내 자리
    const meBox = document.createElement('div');
    meBox.className =
      'pk-me' + (delegated ? ' pk-delegated' : '') + (state.phase === 'hand-over' && state.winners.includes(0) ? ' pk-winner' : '') +
      (!delegated && state.phase === 'betting' && state.turn === 0 ? ' pk-active' : '');
    const head = document.createElement('div');
    head.className = 'pk-me-head';
    head.innerHTML = `<span class="pk-me-name">나${delegated ? ' · <span class="pk-badge">위임 중</span>' : ''}${me.folded ? ' · 다이' : ''}${!me.folded && me.chips === 0 && state.phase !== 'hand-over' ? ' · 올인' : ''}</span>`;
    const side = document.createElement('div');
    side.className = 'pk-me-side';
    side.innerHTML = `<span>${me.chips.toLocaleString()}칩${deltaHtml(0, me.chips)}</span>`;
    if (!delegated && (state.phase === 'betting' || state.phase === 'choose-reveal')) {
      const d = document.createElement('button');
      d.className = 'pk-delegate';
      d.textContent = '위임';
      d.title = 'AI가 내 자리를 대신 플레이합니다';
      d.onclick = () => {
        delegated = true;
        render();
        pump();
      };
      side.appendChild(d);
    }
    head.appendChild(side);
    meBox.appendChild(head);

    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'pk-me-cards';
    const openCol = document.createElement('div');
    openCol.className = 'pk-col';
    openCol.innerHTML = '<span class="pk-me-label">공개 패</span>';
    const openRow = document.createElement('div');
    openRow.className = 'pk-row';
    const hidCol = document.createElement('div');
    hidCol.className = 'pk-col';
    hidCol.innerHTML = '<span class="pk-me-label">나만 보는 패</span>';
    const hidRow = document.createElement('div');
    hidRow.className = 'pk-row';

    const picking = state.phase === 'choose-reveal' && !state.revealPicked[0] && !delegated;
    me.cards.forEach((c, ci) => {
      const target = me.revealed[ci] ? openRow : hidRow;
      const hole = !me.revealed[ci];
      // 내 패에는 등장 플립 연출을 쓰지 않는다(사용자 요청: '나만 보는 패' 애니메이션 제거)
      if (picking) {
        const ce = cardEl(c, { big: true, hole, onPick: () => {
          chooseReveal(state, 0, ci);
          render();
          pump();
        } });
        cardEls[0][ci] = ce;
        target.appendChild(ce);
      } else {
        const ce = cardEl(c, { big: true, hole, five: state.phase === 'hand-over' && (state.bestFive[0] ?? []).includes(ci) });
        cardEls[0][ci] = ce;
        target.appendChild(ce);
      }
    });
    openCol.appendChild(openRow);
    hidCol.appendChild(hidRow);
    const hasOpen = openRow.childElementCount > 0;
    const hasHid = hidRow.childElementCount > 0;
    if (hasOpen) cardsWrap.appendChild(openCol);
    if (hasOpen && hasHid) {
      const divider = document.createElement('div');
      divider.className = 'pk-divider';
      cardsWrap.appendChild(divider);
    }
    if (hasHid) cardsWrap.appendChild(hidCol);
    meBox.appendChild(cardsWrap);

    // 베팅 안내: 콜 금액과 콜 후 팟 (엔진 정의: pot은 지불 즉시 합산, 콜 = currentBet - 내 기여금)
    if (state.phase === 'betting' && !me.folded && toCall > 0) {
      const bl = document.createElement('div');
      bl.className = 'pk-betline';
      bl.innerHTML = `내 콜 <b>${toCall.toLocaleString()}칩</b> · 콜하면 팟 <b>${(state.pot + toCall).toLocaleString()}칩</b>`;
      meBox.appendChild(bl);
    }
    if ((state.phase === 'showdown' || state.phase === 'hand-over') && state.showdownRevealed && !me.folded && state.handNames[0]) {
      const hn = document.createElement('div');
      hn.className = 'pk-hand';
      hn.textContent = state.handNames[0];
      meBox.appendChild(hn);
    }
    felt.appendChild(meBox);

    // 조작 영역: 하단 월넛 밴드
    const band = document.createElement('div');
    band.className = 'pk-actions-band';
    let bandUsed = false;
    if (delegated) {
      const note = document.createElement('div');
      note.className = 'pk-delegated-note';
      note.textContent = 'AI가 대신 플레이하고 있습니다';
      el.appendChild(note);
      const back = document.createElement('button');
      back.className = 'pk-btn-block';
      back.textContent = '직접 하기';
      back.onclick = () => {
        delegated = false;
        render();
      };
      band.appendChild(back);
      bandUsed = true;
    } else if (state.phase === 'choose-reveal') {
      const hint = document.createElement('div');
      hint.className = 'pk-hint';
      hint.textContent = state.revealPicked[0] ? '상대가 공개 패를 고르는 중…' : '공개할 카드 1장을 눌러 고르세요. 나머지 2장은 숨겨집니다.';
      el.appendChild(hint);
    } else if (state.phase === 'betting' && myTurn && !me.folded) {
      const bar = document.createElement('div');
      bar.className = 'pk-actions';
      const fold = document.createElement('button');
      fold.className = 'pk-fold';
      fold.textContent = '다이';
      fold.onclick = () => act('fold');
      bar.appendChild(fold);
      if (legal.includes('check')) {
        const check = document.createElement('button');
        check.className = 'pk-call';
        check.textContent = '체크';
        check.onclick = () => act('check');
        bar.appendChild(check);
      } else if (legal.includes('call')) {
        const call = document.createElement('button');
        call.className = 'pk-call';
        call.textContent = `콜 ${toCall.toLocaleString()}칩`; // 로그 '콜 N칩'·레이즈 버튼과 단위 표기 통일
        call.onclick = () => act('call');
        bar.appendChild(call);
      }
      if (legal.includes('raise')) {
        const raise = document.createElement('button');
        raise.className = 'pk-raise';
        // 버튼은 이번에 실제로 내는 칩(콜분 toCall + 레이즈분 unit)을 표시한다.
        // 현재 룰에서는 레이즈 가능 상태면 항상 me.bet === 0이라 도달 베팅액(currentBet + unit)과 같지만,
        // 규칙이 바뀌어도 버튼 금액과 실제 차감이 어긋나지 않게 지출 기준으로 계산한다.
        // 로그의 '레이즈 N칩'은 도달 베팅액(엔진 currentBet)이라 버튼과 의미가 다를 수 있음에 유의.
        raise.textContent = `레이즈 ${(toCall + unit).toLocaleString()}칩`;
        raise.onclick = () => act('raise');
        bar.appendChild(raise);
      }
      band.appendChild(bar);
      bandUsed = true;
    }

    if (state.phase === 'hand-over') {
      // 결과는 고정 팝업으로 보여 준다. 인라인 블록은 페이지가 길어지며
      // 화면이 밀리는 문제가 있었다(사용자 보고). 팝업은 레이아웃을 바꾸지 않는다.
      const overlay = document.createElement('div');
      overlay.className = 'pk-result-pop';
      const pop = document.createElement('div');
      pop.className = 'pk-result-card';
      const popTitle = document.createElement('div');
      popTitle.className = 'pk-result-title';
      popTitle.textContent = state.winners.includes(0)
        ? '이겼습니다!'
        : state.winners.length > 0
          ? `${state.winners.map((w) => state.seats[w].name).join(', ')} 승리`
          : '판 정리';
      pop.appendChild(popTitle);
      const popBody = document.createElement('div');
      popBody.className = 'pk-result-body';
      popBody.textContent = state.resultText;
      pop.appendChild(popBody);
      const start0 = state.handStartChips?.[0];
      const d0 = start0 === undefined ? 0 : state.seats[0].chips - start0;
      if (d0 !== 0) {
        const dd = document.createElement('div');
        dd.className = `pk-result-delta ${d0 > 0 ? 'up' : 'down'}`;
        dd.textContent = `내 칩 ${d0 > 0 ? '+' : ''}${d0.toLocaleString()}`;
        pop.appendChild(dd);
      }
      if (!delegated) {
        const next = document.createElement('button');
        next.className = 'pk-next';
        next.textContent = '다음 판';
        next.onclick = () => {
          startHand(state);
          saveChips();
          render();
          pump();
        };
        pop.appendChild(next);
      }
      overlay.appendChild(pop);
      el.appendChild(overlay);
    }
    if (bandUsed) el.appendChild(band);

    // 최근 로그 한 줄
    const log = document.createElement('div');
    log.className = 'pk-log';
    // 최근 3줄: 칩 재지급·승부 공개 같은 알림이 바로 다음 한 줄에 묻히지 않게 한다
    for (const entry of state.log.slice(-3)) {
      const d = document.createElement('div');
      d.textContent = entry.text;
      log.appendChild(d);
    }
    el.appendChild(log);

    // 딜링 연출: 새로 늘어난 카드들을 덱에서 날려 보냄. 내 패(0번 자리)도 비행은 유지(사용자 요청: 날아오는 연출 유지, 플립만 제거).
    const newBySeat: { seat: number; cis: number[] }[] = [];
    state.seats.forEach((s, i) => {
      const grown = s.cards.length - prevCounts[i];
      if (grown > 0) {
        // 새로 받은 카드 index를 기억해 두고, 비행 중에는 매 프레임 현재 DOM 요소를 다시 찾는다(리렌더 대비)
        const cis = s.cards.map((_, ci) => ci).slice(-grown);
        if (cis.length) newBySeat.push({ seat: i, cis });
      }
      prevCounts[i] = s.cards.length;
      prevVis[i] = s.cards.map((_, ci) => state.phase === 'showdown' || state.phase === 'hand-over' || s.revealed[ci] === true);
    });
    if (newBySeat.length) requestAnimationFrame(() => animateDeals(newBySeat));
  }

  render();
  pump();
  return {
    el,
    render,
    state,
    unmount: () => {
      stopped = true;
      el.remove();
    },
  };
}

// 저장된 진행(칩·판 번호)을 읽는다. 복원 적용은 createGame이 시작 전에 수행.
export function loadProgress(): { chips?: number[]; hands?: number } {
  return readProgress(localStorage);
}
