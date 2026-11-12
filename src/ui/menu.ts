// 메뉴 화면: 대표 일러스트와 모드 선택. 모드별 구성은 제안 기본값(사용자 미확정).
import { STORY_CHAPTERS, StoryProgress } from '../story';
import { TOURNAMENT_STAGES, TournamentProgress } from '../tournament';

export interface MenuHandlers {
  onFree: () => void;
  onStory: (chapterIndex: number) => void;
  onTournament: (stageIndex: number) => void;
}

export function mountMenu(root: HTMLElement, story: StoryProgress, tour: TournamentProgress, handlers: MenuHandlers): { el: HTMLElement; unmount(): void } {
  const el = document.createElement('div');
  el.className = 'pk-menu';

  const hero = document.createElement('div');
  hero.className = 'pk-menu-hero';
  const img = document.createElement('img');
  img.src = 'illust/menu-hero.png';
  img.alt = '리조트 포커 클럽';
  img.onerror = () => img.remove(); // 에셋이 없어도 히어로 배경(그라디언트)만으로 보이게
  hero.appendChild(img);
  const overlay = document.createElement('div');
  overlay.className = 'pk-menu-hero-title';
  overlay.innerHTML = '<span>세븐포커2026</span><small>휴양지 소셜클럽의 한국식 세븐포커</small>';
  hero.appendChild(overlay);
  el.appendChild(hero);

  const modes = document.createElement('div');
  modes.className = 'pk-menu-modes';

  const free = document.createElement('button');
  free.className = 'pk-mode';
  free.innerHTML = '<strong>자유 대국</strong><span>AI 3인과 제한 없는 한 판 한 판. 진행은 저장됩니다.</span>';
  free.onclick = handlers.onFree;
  modes.appendChild(free);

  const storyBtn = document.createElement('button');
  storyBtn.className = 'pk-mode';
  const cleared = story.unlocked >= STORY_CHAPTERS.length;
  const progress = cleared ? '전 챕터 클리어' : `챕터 ${Math.min(story.unlocked + 1, STORY_CHAPTERS.length)}/${STORY_CHAPTERS.length}`;
  storyBtn.innerHTML = `<strong>스토리</strong><span>리조트 클럽의 초대 — 캐릭터들과 챕터를 진행합니다. (${progress})</span>`;
  storyBtn.onclick = () => handlers.onStory(Math.min(story.unlocked, STORY_CHAPTERS.length - 1));
  modes.appendChild(storyBtn);

  const tourBtn = document.createElement('button');
  tourBtn.className = 'pk-mode';
  const tourLabel = tour.won ? '우승 완료' : tour.stage === 0 ? '예선부터 도전' : `${TOURNAMENT_STAGES[Math.min(tour.stage, 2)].name} 진행 중`;
  tourBtn.innerHTML = `<strong>토너먼트</strong><span>선셋 컵 — 예선·준결승·결승을 이겨 우승하세요. (${tourLabel})</span>`;
  tourBtn.onclick = () => handlers.onTournament(Math.min(tour.stage, TOURNAMENT_STAGES.length - 1));
  modes.appendChild(tourBtn);

  el.appendChild(modes);
  root.appendChild(el);
  return { el, unmount: () => el.remove() };
}
