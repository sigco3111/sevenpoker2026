import './styles.css';
import { createGame } from './engine/game';
import { mountTable, loadProgress } from './ui/table';

const app = document.getElementById('app')!;
// 저장된 칩·판 번호를 첫 판 시작(앤티/리필 판정) 전에 복원
const state = createGame(Math.random, loadProgress());
mountTable(app, state);
