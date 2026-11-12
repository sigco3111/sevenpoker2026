// 리조트 클럽의 캐릭터 명부.
// 이름·설정·조합은 전부 제안 기본값(사용자 미확정). 성향은 AI 모델 키와 같다.
import { OpponentSpec } from './engine/game';

export interface Character extends OpponentSpec {
  id: string;
  role: string; // 한 줄 설정
}

export const CHARACTERS: Character[] = [
  { id: 'soyeon', name: '소연 · 연륜', personality: 'tight', avatar: 'avatars/avatar-1.png', role: '클럽의 최고참. 서두르지 않는다.' },
  { id: 'seonu', name: '선우 · 관찰', personality: 'balanced', avatar: 'avatars/avatar-2.png', role: '프로 지망생. 흐름을 읽는다.' },
  { id: 'rocky', name: '록키 · 직관', personality: 'loose', avatar: 'avatars/avatar-3.png', role: '분위기 메이커. 느낌으로 승부한다.' },
  { id: 'haru', name: '하루 · 딜러', personality: 'tight', avatar: 'avatars/avatar-4.png', role: '신입 딜러 출신. 실수가 없다.' },
  { id: 'miro', name: '미로 · 계산', personality: 'balanced', avatar: 'avatars/avatar-5.png', role: '수학 선생. 확률로 말한다.' },
  { id: 'bolt', name: '번개 · 승부', personality: 'loose', avatar: 'avatars/avatar-6.png', role: '자칭 승부사. 물러서지 않는다.' },
];

export function byId(id: string): Character {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown character: ${id}`);
  return c;
}
