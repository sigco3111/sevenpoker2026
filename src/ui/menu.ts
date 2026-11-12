// 메뉴 화면: v5 로비 — 상태바 + 실제 아트 모드 타일. 모드별 구성은 제안 기본값(사용자 미확정).
import { STORY_CHAPTERS, StoryProgress } from '../story';
import { TOURNAMENT_STAGES, TournamentProgress } from '../tournament';
import { loadProgress } from './table';

export interface MenuHandlers {
  onFree: () => void;
  onStory: (chapterIndex: number) => void;
  onTournament: (stageIndex: number) => void;
  onStoryReplay?: () => void; // 전 챕터 클리어 시: 챕터/엔딩 다시 보기 장면
}

function artTile(btn: HTMLButtonElement, src: string, extraClass = '') {
  btn.className = `pk-mode ${extraClass}`.trim();
  const art = document.createElement('img');
  art.className = 'art';
  art.src = src;
  art.alt = '';
  art.onerror = () => art.remove(); // 에셋이 없어도 패널 색만으로 보이게
  btn.appendChild(art);
  const shade = document.createElement('div');
  shade.className = 'shade';
  btn.appendChild(shade);
  const inner = document.createElement('div');
  inner.className = 'in';
  btn.appendChild(inner);
  return inner;
}

export function mountMenu(root: HTMLElement, story: StoryProgress, tour: TournamentProgress, handlers: MenuHandlers): { el: HTMLElement; unmount(): void } {
  const el = document.createElement('div');
  el.className = 'pk-menu';

  // 상태바: 플레이어와 보유 칩(저장된 자유대국 진행이 있을 때만 표시)
  const progress = loadProgress();
  const top = document.createElement('div');
  top.className = 'pk-lobby-top';
  const pav = document.createElement('div');
  pav.className = 'pk-lobby-pav';
  pav.textContent = 'P';
  top.appendChild(pav);
  const who = document.createElement('div');
  who.className = 'pk-lobby-who';
  const name = document.createElement('span');
  name.className = 'pk-lobby-name';
  name.textContent = '플레이어';
  who.appendChild(name);
  if (progress.chips && progress.chips[0] !== undefined) {
    const chips = document.createElement('span');
    chips.className = 'pk-lobby-chips';
    chips.textContent = `${progress.chips[0].toLocaleString()}칩`;
    who.appendChild(chips);
  }
  top.appendChild(who);
  el.appendChild(top);

  const hero = document.createElement('div');
  hero.className = 'pk-menu-hero';
  const img = document.createElement('img');
  img.src = 'illust/menu-hero.png';
  img.alt = '리조트 포커 클럽';
  img.onerror = () => img.remove(); // 에셋이 없어도 히어로 배경만으로 보이게
  hero.appendChild(img);
  const overlay = document.createElement('div');
  overlay.className = 'pk-menu-hero-title';
  overlay.innerHTML = '<span>세븐포커2026</span><small>휴양지 소셜클럽의 한국식 세븐포커</small>';
  hero.appendChild(overlay);
  el.appendChild(hero);

  const modes = document.createElement('div');
  modes.className = 'pk-menu-modes';

  // 스토리: 현재 도전 챕터의 일러스트
  const storyBtn = document.createElement('button');
  const cleared = story.unlocked >= STORY_CHAPTERS.length;
  const chapterIndex = Math.min(story.unlocked, STORY_CHAPTERS.length - 1);
  const progress2 = cleared ? '전 챕터 클리어' : `챕터 ${chapterIndex + 1}/${STORY_CHAPTERS.length} · ${STORY_CHAPTERS[chapterIndex].title}`;
  const storyIn = artTile(storyBtn, `illust/story-ch${chapterIndex + 1}.png`);
  storyIn.innerHTML = `<strong>스토리</strong><span class="badge">${progress2}</span><span class="d">리조트 클럽의 초대 — 캐릭터들과 챕터를 진행합니다.</span>`;
  const storyGo = document.createElement('span');
  storyGo.className = 'go';
  storyGo.textContent = cleared || story.unlocked > 0 ? '이어하기' : '시작하기';
  storyBtn.appendChild(storyGo);
  storyBtn.onclick = () => (cleared && handlers.onStoryReplay ? handlers.onStoryReplay() : handlers.onStory(chapterIndex));
  modes.appendChild(storyBtn);

  // 토너먼트: 현재 스테이지의 일러스트
  const tourBtn = document.createElement('button');
  const stageIndex = Math.min(tour.stage, TOURNAMENT_STAGES.length - 1);
  const tourLabel = tour.won ? '우승 완료' : tour.stage === 0 ? `예선 · ${TOURNAMENT_STAGES[0].hands}판` : `${TOURNAMENT_STAGES[stageIndex].name} 진행 중`;
  // 승인 시안(v5) 기준: 토너먼트 타일은 스토리 타일과 다른 아트 사용 (자산 4종 한정으로 스테이지별 매핑)
  const TOUR_TILE_ART = ['illust/story-ch2.png', 'illust/story-ch3.png', 'illust/menu-hero.png'];
  const tourIn = artTile(tourBtn, TOUR_TILE_ART[stageIndex]);
  tourIn.innerHTML = `<strong>토너먼트</strong><span class="badge">${tourLabel}</span><span class="d">선셋 컵 — 예선·준결승·결승을 이겨 우승하세요.</span>`;
  const tourGo = document.createElement('span');
  tourGo.className = 'go';
  tourGo.textContent = '입장';
  tourBtn.appendChild(tourGo);
  tourBtn.onclick = () => handlers.onTournament(stageIndex);
  modes.appendChild(tourBtn);

  // 자유 대국: 저장된 진행(판 수)이 있으면 이어하기
  const free = document.createElement('button');
  const hands = progress.hands ?? 0;
  const freeIn = artTile(free, 'illust/menu-hero.png', 'free');
  freeIn.innerHTML = `<strong>자유 대국</strong><span class="badge">${hands > 0 ? `${hands + 1}번째 판 이어하기` : '언제든 한 판'}</span><span class="d">AI 3인과 제한 없는 대국. 진행은 저장됩니다.</span>`;
  const freeGo = document.createElement('span');
  freeGo.className = 'go';
  freeGo.textContent = hands > 0 ? '이어하기' : '시작하기';
  free.appendChild(freeGo);
  free.onclick = handlers.onFree;
  modes.appendChild(free);

  el.appendChild(modes);
  root.appendChild(el);
  return { el, unmount: () => el.remove() };
}
