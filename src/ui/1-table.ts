// 대국 화면 렌더링과 조작. 모바일 한 화면 구성(390x844) 우선.
// 테이블 구성: 펠트 위 상대 3인 + 중앙 덱/팟, 아래 내 자리. 딜링·뒤집기 연출 포함.
import { Card, rankLabel, SUIT_LABEL } from '../engine/cards';
import { GameState, legalActions, needsAction, chooseReveal, applyAction, startHand, BET_UNITS } from '../engine/game';
import { aiChooseReveal, aiDecide } from '../engine/ai';

const AVATARS = ['', 'avatars/avatar-1.png', 'avatars/avatar-2.png', 'avatars/avatar-3.png'];
const AI_DELAY = 650;
const NEXT_HAND_DELAY = 2500; // 위임 중 결과를 읽을 시간
const FLY_MS = 550; // 딜링 비행 시간

export interface UI {
  el: HTMLElement;
  render(): void;
}

export function mountTable(root: HTMLElement, state: GameState): UI {
  const el = document.createElement('div');
  root.appendChild(el);

  let delegated = false; // 위임 중 (확정: 직접 돌아올 때까지 계속)
  let busy = false;

  // 연출용 이전 상태 (자리별 카드 수, 공개 여부)
  let prevCounts = [0, 0, 0, 0];
  let prevVis: boolean[][] = [[], [], [], []];

  function cardEl(card: Card | null, opts: { big?: boolean; mini?: boolean; pickable?: boolean; flip?: boolean; onPick?: () => void } = {}) {
    const d = document.createElement(opts.onPick ? 'button' : 'div');
    d.className = 'pk-card' + (opts.big ? ' big' : '') + (opts.mini ? ' mini' : '') + (opts.onPick ? ' pickable' : '') + (opts.flip ? ' pk-flipin' : '');
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

  function act(action: 'fold' | 'check' | 'call' | 'raise') {
    if (busy) return;
    applyAction(state, 0, action);
    saveChips();
    render();
    pump();
  }

  function saveChips() {
    try {
      localStorage.setItem('sevenpoker2026.chips', JSON.stringify(state.seats.map((s) => s.chips)));
      localStorage.setItem('sevenpoker2026.hands', String(state.handNumber));
    } catch { /* 저장 실패는 무시 */ }
  }

  function pump() {
    // AI 자리와 위임 중 내 자리를 자동 진행
    if (busy) return;
    const step = () => {
      let acted = false;
      if (state.phase === 'choose-reveal') {
        for (let i = 0; i < 4; i++) {
          if (i === 0 && !delegated) continue; // 위임 중이면 내 공개 패도 AI가 선택
          if (!state.revealPicked[i]) {
            chooseReveal(state, i, aiChooseReveal(state, i));
            acted = true;
            break;
          }
        }
      } else if (state.phase === 'betting') {
        const need = needsAction(state);
        if (need === 'ai' || (need === 'player' && delegated)) {
          const seat = state.turn;
          const action = aiDecide(state, seat);
          applyAction(state, seat, action);
          acted = true;
        }
      } else if (state.phase === 'hand-over' && delegated) {
        acted = true; // 결과를 잠시 보여 준 뒤 아래 타임아웃에서 다음 판 자동 시작
      }
      render();
      if (acted) {
        saveChips();
        busy = true;
        const delay = state.phase === 'hand-over' ? NEXT_HAND_DELAY : AI_DELAY;
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

  // 딜링 연출: 덱에서 해당 자리의 새 카드 위치로 카드 뒷면이 날아감
  function animateDeals(newBySeat: { seat: number; els: HTMLElement[] }[]) {
    const deck = el.querySelector('.pk-deck');
    if (!deck) return;
    const dr = deck.getBoundingClientRect();
    const cx = dr.left + dr.width / 2;
    const cy = dr.top + dr.height / 2;
    for (const { els } of newBySeat) {
      els.forEach((target, k) => {
        const tr = target.getBoundingClientRect();
        const fly = document.createElement('div');
        fly.className = 'pk-card mini back pk-fly';
        fly.style.left = `${cx - 12}px`;
        fly.style.top = `${cy - 17}px`;
        document.body.appendChild(fly);
        target.style.visibility = 'hidden';
        setTimeout(() => {
          fly.style.transform = `translate(${tr.left + tr.width / 2 - cx}px, ${tr.top + tr.height / 2 - cy}px) rotate(${(k % 2 ? -1 : 1) * 8}deg)`;
        }, 30 + k * 120);
        setTimeout(() => {
          target.style.visibility = '';
          fly.remove();
        }, FLY_MS + 60 + k * 120);
      });
    }
  }

  function render() {
    const me = state.seats[0];
    const myTurn = needsAction(state) === 'player';
    const legal = legalActions(state, 0);
    const toCall = state.currentBet - me.bet;
    const unit = BET_UNITS[state.street];

    const streetLabel =
      state.phase === 'choose-reveal' ? '공개할 카드 선택'
      : state.phase === 'betting' ? `${state.street + 4}번째 카드`
      : state.phase === 'showdown' ? '승부 공개'
      : '판 정리';

    el.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'pk-title';
    title.innerHTML = `<span>세븐포커2026 <small>자유 대국 · ${state.handNumber}번째 판</small></span>`;
    el.appendChild(title);

    // 펠트 테이블
    const felt = document.createElement('div');
    felt.className = 'pk-felt';
    el.appendChild(felt);

    // 상대 3인: 테이블 상단 아치 배치
    for (let i = 1; i < 4; i++) {
      const s = state.seats[i];
      const seat = document.createElement('div');
      seat.className = `pk-opp pk-opp-${i}` + (s.folded ? ' pk-folded' : '') + (state.phase === 'betting' && state.turn === i ? ' pk-active' : '');
      const top = document.createElement('div');
      top.className = 'pk-opp-top';
      const ava = document.createElement('img');
      ava.className = 'pk-ava';
      ava.src = AVATARS[i];
      ava.alt = s.name;
      top.appendChild(ava);
      const info = document.createElement('div');
      info.className = 'pk-opp-info';
      info.innerHTML = `<span class="pk-name">${s.name}</span><span class="pk-chips">${s.chips.toLocaleString()}칩${s.folded ? ' · 다이' : ''}</span>`;
      top.appendChild(info);
      seat.appendChild(top);
      const cards = document.createElement('div');
      cards.className = 'pk-cards';
      const allShown = state.phase === 'showdown' || state.phase === 'hand-over';
      const order = s.cards.map((c, ci) => ({ c, ci }))
        .sort((a, b) => Number(allShown || s.revealed[b.ci]) - Number(allShown || s.revealed[a.ci]));
      order.forEach(({ c, ci }) => {
        const visible = allShown || s.revealed[ci];
        const wasVisible = prevVis[i][ci] === true;
        cards.appendChild(cardEl(visible ? c : null, { mini: true, flip: visible && !wasVisible && prevCounts[i] >= s.cards.length }));
      });
      seat.appendChild(cards);
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
    center.appendChild(potbar);
    felt.appendChild(center);

    // 내 자리
    const meBox = document.createElement('div');
    meBox.className = 'pk-me' + (delegated ? ' pk-delegated' : '');
    const head = document.createElement('div');
    head.className = 'pk-me-head';
    head.innerHTML = `<span class="pk-me-name">나${delegated ? ' · <span class="pk-badge">위임 중</span>' : ''}${me.folded ? ' · 다이' : ''}</span>`;
    const side = document.createElement('div');
    side.className = 'pk-me-side';
    side.innerHTML = `<span>${me.chips.toLocaleString()}칩</span>`;
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
      const wasVisible = prevVis[0][ci] === true;
      const flip = ci < prevVis[0].length && prevCounts[0] >= me.cards.length && !wasVisible;
      if (picking) {
        target.appendChild(cardEl(c, { big: true, onPick: () => {
          chooseReveal(state, 0, ci);
          render();
          pump();
        } }));
      } else {
        target.appendChild(cardEl(c, { big: true, flip }));
      }
    });
    openCol.appendChild(openRow);
    hidCol.appendChild(hidRow);
    cardsWrap.appendChild(openCol);
    const divider = document.createElement('div');
    divider.className = 'pk-divider';
    cardsWrap.appendChild(divider);
    cardsWrap.appendChild(hidCol);
    meBox.appendChild(cardsWrap);
    el.appendChild(meBox);

    // 조작 영역
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
      el.appendChild(back);
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
        call.textContent = `콜 ${toCall.toLocaleString()}`;
        call.onclick = () => act('call');
        bar.appendChild(call);
      }
      if (legal.includes('raise')) {
        const raise = document.createElement('button');
        raise.className = 'pk-raise';
        raise.textContent = `레이즈 +${unit}`;
        raise.onclick = () => act('raise');
        bar.appendChild(raise);
      }
      el.appendChild(bar);
    }

    if (state.phase === 'hand-over') {
      const res = document.createElement('div');
      res.className = 'pk-result';
      res.textContent = state.resultText;
      el.appendChild(res);
      if (!delegated) {
        const bar = document.createElement('div');
        bar.className = 'pk-actions';
        const next = document.createElement('button');
        next.className = 'pk-next';
        next.textContent = '다음 판';
        next.onclick = () => {
          startHand(state);
          saveChips();
          render();
          pump();
        };
        bar.appendChild(next);
        el.appendChild(bar);
      }
    }

    // 최근 로그 한 줄
    const log = document.createElement('div');
    log.className = 'pk-log';
    log.textContent = state.log.length ? state.log[state.log.length - 1].text : '';
    el.appendChild(log);

    // 딜링 연출: 새로 늘어난 카드들을 덱에서 날려 보냄
    const newBySeat: { seat: number; els: HTMLElement[] }[] = [];
    state.seats.forEach((s, i) => {
      const grown = s.cards.length - prevCounts[i];
      if (grown > 0) {
        const seatEl = i === 0 ? meBox : felt.children[i - 1];
        const cardEls = Array.from(seatEl.querySelectorAll('.pk-card')).slice(-grown) as HTMLElement[];
        if (cardEls.length) newBySeat.push({ seat: i, els: cardEls });
      }
      prevCounts[i] = s.cards.length;
      prevVis[i] = s.cards.map((_, ci) => state.phase === 'showdown' || state.phase === 'hand-over' || s.revealed[ci] === true);
    });
    if (newBySeat.length) requestAnimationFrame(() => animateDeals(newBySeat));
  }

  render();
  pump();
  return { el, render };
}

export function restoreChips(state: GameState) {
  try {
    const raw = localStorage.getItem('sevenpoker2026.chips');
    if (!raw) return;
    const chips = JSON.parse(raw);
    if (Array.isArray(chips) && chips.length === 4 && chips.every((n) => Number.isFinite(n) && n >= 0)) {
      state.seats.forEach((s, i) => (s.chips = chips[i]));
    }
  } catch { /* 깨진 저장은 기본값 */ }
}
