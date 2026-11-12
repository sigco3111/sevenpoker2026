import './styles.css';
import { createGame } from './engine/game';
import { mountTable, restoreChips } from './ui/table';

const app = document.getElementById('app')!;
const state = createGame();
restoreChips(state);
mountTable(app, state);
