const STORAGE_KEY = 'ledger_daily_quest';

const QUEST_TEMPLATES = [
  { id: 'clear_3', text: 'Complete 3 tickets today', target: 3, type: 'complete' },
  { id: 'clear_5', text: 'Complete 5 tickets today', target: 5, type: 'complete' },
  { id: 'clear_1_critical', text: 'Slay a Critical ticket', target: 1, type: 'complete_critical' },
  { id: 'clear_1_high', text: 'Finish a High priority entry', target: 1, type: 'complete_high' },
  { id: 'file_2', text: 'File 2 new entries', target: 2, type: 'create' },
  { id: 'file_3', text: 'File 3 new entries', target: 3, type: 'create' },
  { id: 'move_5', text: 'Move 5 tickets forward', target: 5, type: 'move' },
  { id: 'clear_backlog_2', text: 'Clear 2 from the Backlog', target: 2, type: 'clear_backlog' },
];

function getToday() {
  return new Date().toISOString().split('T')[0];
}

export function getDailyQuest() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const today = getToday();

    if (stored.date === today && stored.quest) {
      return stored;
    }

    // Pick a new quest deterministically based on date
    const seed = today.split('-').join('');
    const index = parseInt(seed) % QUEST_TEMPLATES.length;
    const quest = { ...QUEST_TEMPLATES[index] };

    const newState = { date: today, quest, progress: 0, completed: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    return newState;
  } catch {
    return { date: getToday(), quest: QUEST_TEMPLATES[0], progress: 0, completed: false };
  }
}

export function updateQuestProgress(eventType, priority) {
  try {
    const state = getDailyQuest();
    if (state.completed) return state;

    const quest = state.quest;
    let shouldIncrement = false;

    switch (quest.type) {
      case 'complete':
        shouldIncrement = eventType === 'complete';
        break;
      case 'complete_critical':
        shouldIncrement = eventType === 'complete' && priority === 'CRITICAL';
        break;
      case 'complete_high':
        shouldIncrement = eventType === 'complete' && (priority === 'HIGH' || priority === 'CRITICAL');
        break;
      case 'create':
        shouldIncrement = eventType === 'create';
        break;
      case 'move':
        shouldIncrement = eventType === 'move';
        break;
      case 'clear_backlog':
        shouldIncrement = eventType === 'clear_backlog';
        break;
    }

    if (shouldIncrement) {
      state.progress = Math.min(state.progress + 1, quest.target);
      if (state.progress >= quest.target) {
        state.completed = true;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    return state;
  } catch {
    return getDailyQuest();
  }
}
