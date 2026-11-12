// 화면 라우터: 메뉴 ↔ 자유대국 ↔ 스토리(장면·대국). 화면 전환은 상태뿐, 저장은 각 모드 규칙을 따른다.
// 자유대국만 save2에 진행을 저장하고, 스토리는 열린 챕터만 story1에 저장한다.
import './styles.css';
import { createGame } from './engine/game';
import { mountTable, loadProgress } from './ui/table';
import { mountMenu } from './ui/menu';
import { mountScene } from './ui/scene';
import { STORY_CHAPTERS, loadStory, saveStory, judgeHand } from './story';
import { TOURNAMENT_STAGES, bindCharacters, stageSeats, stageOutcome, loadTournament, saveTournament } from './tournament';
import { CHARACTERS } from './characters';

bindCharacters(CHARACTERS);

const app = document.getElementById('app')!;

let current: { unmount(): void } | null = null;
// mount는 화면을 만드는 함수. 비우기보다 먼저 mount되면 방금 그린 화면이 지워지므로 반드시 비운 뒤에 호출한다.
function show(mount: () => { unmount(): void }) {
  current?.unmount(); // 테이블은 자동 진행 타이머까지 멈춘다
  app.innerHTML = '';
  current = mount();
}

function showMenu() {
  show(() =>
    mountMenu(app, loadStory(localStorage), loadTournament(), {
      onFree: showFree,
      onStory: showChapterIntro,
      onTournament: showStageIntro,
    }),
  );
}

function showFree() {
  // 저장된 칩·판 번호를 첫 판 시작(앤티/리필 판정) 전에 복원
  const state = createGame(Math.random, loadProgress());
  show(() => mountTable(app, state, { onExit: showMenu }));
}

function showChapterIntro(index: number) {
  const chapter = STORY_CHAPTERS[index];
  show(() =>
      mountScene(app, {
      kicker: '스토리 · 리조트 클럽의 초대',
      title: chapter.title,
      illustration: chapter.illustration,
      lines: chapter.intro,
      actions: [
        { label: '대국 시작', primary: true, onClick: () => startChapter(index) },
        { label: '메뉴로', onClick: showMenu },
      ],
    }),
  );
}

function startChapter(index: number) {
  const chapter = STORY_CHAPTERS[index];
  const state = createGame(Math.random, undefined, { opponents: chapter.opponents, startChips: chapter.startChips });
  show(() =>
      mountTable(app, state, {
      title: chapter.title,
      goalChips: chapter.goalChips,
      persist: false, // 스토리 대국 중의 칩은 저장하지 않는다(자유대국 저장 보존)
      onExit: showMenu,
      onHandOver: (st) => {
        const outcome = judgeHand(chapter, st.seats[0].chips);
        if (outcome === 'clear') showChapterClear(index);
        else if (outcome === 'fail') showChapterFail(index);
      },
    }),
  );
}

function showChapterClear(index: number) {
  const chapter = STORY_CHAPTERS[index];
  const progress = loadStory(localStorage);
  if (index + 1 > progress.unlocked) saveStory(localStorage, index + 1); // 다음 챕터 개방
  const last = index + 1 >= STORY_CHAPTERS.length;
  show(() =>
      mountScene(app, {
      kicker: '스토리 · 리조트 클럽의 초대',
      title: last ? '엔딩 · 새 챔피언' : `${chapter.title} 클리어`,
      illustration: chapter.illustration,
      lines: chapter.clear,
      actions: [
        ...(last ? [] : [{ label: '다음 챕터', primary: true, onClick: () => showChapterIntro(index + 1) }]),
        { label: '메뉴로', primary: last, onClick: showMenu },
      ],
    }),
  );
}

function showChapterFail(index: number) {
  const chapter = STORY_CHAPTERS[index];
  show(() =>
      mountScene(app, {
      kicker: chapter.title,
      title: '칩이 다 떨어졌습니다',
      illustration: chapter.illustration,
      lines: ['이번 테이블은 여기까지. 다음 기회를 노려보세요.'],
      actions: [
        { label: '다시 도전', primary: true, onClick: () => showChapterIntro(index) },
        { label: '메뉴로', onClick: showMenu },
      ],
    }),
  );
}

function showStageIntro(index: number) {
  const stage = TOURNAMENT_STAGES[index];
  show(() =>
      mountScene(app, {
      kicker: '토너먼트 · 선셋 컵',
      title: `${stage.name} · ${stage.hands}판`,
      illustration: stage.image,
      lines: [...stage.introLines, `상대: ${stage.opponents.map((c) => c.name).join(' · ')} / 시작 ${stage.startChips}칩 / 앤티 ${stage.ante}칩`],
      actions: [
        { label: '대국 시작', primary: true, onClick: () => startStage(index) },
        { label: '메뉴로', onClick: showMenu },
      ],
    }),
  );
}

function startStage(index: number) {
  const stage = TOURNAMENT_STAGES[index];
  const state = createGame(Math.random, undefined, {
    opponents: stageSeats(stage),
    startChips: stage.startChips,
    ante: stage.ante,
    betUnits: stage.betUnits,
  });
  show(() =>
      mountTable(app, state, {
      title: `선셋 컵 ${stage.name}`,
      tourTotalHands: stage.hands,
      persist: false, // 토너먼트 대국 중의 칩은 저장하지 않는다(자유대국 저장 보존)
      onExit: showMenu,
      onHandOver: (st) => {
        const outcome = stageOutcome(st, stage);
        if (outcome === 'clear') showStageClear(index);
        else if (outcome === 'fail') showStageFail(index);
      },
    }),
  );
}

function showStageClear(index: number) {
  const stage = TOURNAMENT_STAGES[index];
  const progress = loadTournament();
  const last = index + 1 >= TOURNAMENT_STAGES.length;
  saveTournament({ v: 1, stage: last ? index : index + 1, won: progress.won || last });
  show(() =>
      mountScene(app, {
      kicker: '토너먼트 · 선셋 컵',
      title: last ? '우승!' : `${stage.name} 통과`,
      illustration: stage.image,
      lines: stage.clearLines,
      actions: [
        ...(last ? [] : [{ label: '다음 스테이지', primary: true, onClick: () => showStageIntro(index + 1) }]),
        { label: '메뉴로', primary: last, onClick: showMenu },
      ],
    }),
  );
}

function showStageFail(index: number) {
  const stage = TOURNAMENT_STAGES[index];
  show(() =>
      mountScene(app, {
      kicker: `토너먼트 · ${stage.name}`,
      title: '탈락',
      illustration: stage.image,
      lines: stage.failLines,
      actions: [
        { label: '다시 도전', primary: true, onClick: () => showStageIntro(index) },
        { label: '메뉴로', onClick: showMenu },
      ],
    }),
  );
}

showMenu();
