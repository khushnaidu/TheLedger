const STORAGE_KEY = 'ledger_theme';

export const THEMES = {
  ledger: { id: 'ledger', label: 'The Ledger' },
  tome: { id: 'tome', label: 'The Tome' },
};

export const THEME_ASSETS = {
  ledger: {
    logo: '/art/ledgerlogo.jpg',
    sidebarBottom: '/art/sidebarbottom.jpg',
    emptyColumn: '/art/couchrandom.jpg',
    headerArt: '/art/handblack.jpg',
    soundtrack: '/audio/soundtrack.mp3',
  },
  tome: {
    logo: '/art/tome/tomelogo.png',
    sidebarBottom: '/art/tome/dungeon-bottom.png',
    emptyColumn: '/art/tome/empty-scroll.png',
    headerArt: '/art/tome/fortress-gate.png',
    soundtrack: '/audio/tome-soundtrack.mp3',
  },
};

export const GUS_FACES_MAP = {
  ledger: {
    idle: '/gus/idle.png',
    blinking: '/gus/blinking.png',
    thinking: '/gus/thinking.png',
    smiling: '/gus/smiling.png',
    curious: '/gus/curious.png',
  },
  tome: {
    idle: '/gus/tome/idle.png',
    blinking: '/gus/tome/blinking.png',
    thinking: '/gus/tome/thinking.png',
    smiling: '/gus/tome/smiling.png',
    curious: '/gus/tome/curious.png',
  },
};

export const GUS_PERSONA = {
  ledger: { name: 'Augustus "Gus"', role: 'Filing Clerk', status: 'On Duty', nameplate: 'Augustus' },
  tome: { name: 'Gus the Grey', role: 'Dungeon Scribe', status: 'At the Ready', nameplate: 'Gus the Grey' },
};

export const LEVEL_TITLES = {
  ledger: ['Intern', 'Filing Clerk', 'Junior Archivist', 'Archivist', 'Senior Archivist', 'Records Officer', 'Chief of Records', 'Ledger Master', 'Bureau Director', 'Grand Archivist'],
  tome: ['Apprentice', 'Squire', 'Acolyte', 'Knight', 'Battle Mage', 'Warden', 'Sentinel', 'Archmage', 'Dragon Slayer', 'Grand Wizard'],
};

export const STATUS_LABELS = {
  ledger: { BACKLOG: 'Backlog', TODO: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done' },
  tome: { BACKLOG: 'Quest Log', TODO: 'Preparing', IN_PROGRESS: 'In Battle', REVIEW: 'Inspecting', DONE: 'Vanquished' },
};

export const APP_TITLE = {
  ledger: 'The Ledger',
  tome: 'The Tome',
};

export const GUS_QUOTES = {
  ledger: {
    greetings: [
      "Right-o! Gus at your service. What needs filing today?",
      "The clerk is IN. Describe what you're working on and I'll sort the paperwork.",
      "Augustus reporting. Tell me about your task — or dump a whole project on me, I can handle it.",
      "Ah, a customer! What've we got today? Single task or a full operation?",
    ],
    pageQuotes: {
      '/': ["Reviewing the daily ledger...", "The numbers look good today.", "Your dashboard awaits, boss.", "Gus keeps the books balanced."],
      '/board': ["The filing cabinet awaits...", "Need something organized?", "Drag, drop, conquer.", "Paperwork never sleeps."],
      '/list': ["The full archives, at your service.", "Every entry, accounted for.", "Need to find something specific?", "The records don't lie."],
      '/canvas': ["Ah, the academic wing...", "School assignments incoming?", "Canvas sync standing by.", "I'll file those assignments for you."],
      '/tickets/new': ["Filing a new one by hand? Respect.", "I could do that for you, y'know.", "Manual entry — old school. I like it.", "The pen is mightier than the keyboard."],
    },
    defaultQuotes: ["Gus is on standby.", "Click to summon the clerk.", "Need something filed?"],
    moveQuotes: {
      DONE: ["Another one bites the dust!", "STAMPED. Filed. Beautiful.", "And THAT'S how it's done.", "Consider that entry closed, boss.", "The archives welcome another victory."],
      IN_PROGRESS: ["Now we're cooking with gas!", "Promoted to active duty. Excellent.", "In the trenches now. Good luck.", "Rolling up the sleeves on this one."],
      TODO: ["Queued up and ready to go.", "Added to the docket.", "On the list. It'll get its turn."],
      REVIEW: ["Under inspection. Very thorough.", "Sent for review — dotting the i's.", "Quality control in progress."],
      BACKLOG: ["Back to the pile it goes.", "Filed under 'later'. Classic.", "The backlog grows ever patient."],
      TRASH: ["Into the shredder! Goodbye.", "Incinerated. The paperwork gods demand sacrifice.", "Gone. Reduced to confetti.", "You won't be needing THAT anymore."],
    },
    worriedQuotes: ["You've got overdue entries...", "The deadlines aren't looking great.", "Boss, we need to talk about those overdue items.", "Some entries are past due. Just saying."],
    happyQuotes: ["All clear! Inbox zero!", "The ledger is spotless. Beautiful.", "Not a single active entry. Magnificent.", "Everything's filed and done. I could cry."],
  },
  tome: {
    greetings: [
      "Hail, adventurer! What quest brings you to the scribe's chamber?",
      "The scrolls are ready. Speak your quest and I shall inscribe it.",
      "Gus the Grey, at your command. Single quest or a full campaign?",
      "A visitor! The dungeon scribe awaits your orders, hero.",
    ],
    pageQuotes: {
      '/': ["The war room awaits, commander...", "Your quest log grows...", "Surveying the realm's progress.", "The kingdom prospers."],
      '/board': ["The battle map is spread before you...", "Quests await, brave one.", "Drag thy quests to victory.", "The realm needs your sword."],
      '/list': ["The ancient scrolls, unfurled...", "Every quest, chronicled.", "The archives of legend.", "History written in these pages."],
      '/canvas': ["The academy wing...", "Scrolls from the scholars?", "Academic quests incoming.", "Knowledge is the greatest weapon."],
      '/tickets/new': ["Inscribing a new quest by hand? Honorable.", "I could conjure that for you.", "The quill is mightier than the sword.", "Manual inscription — the old ways."],
    },
    defaultQuotes: ["The scribe awaits your command.", "Summon the wizard.", "A quest needs recording?"],
    moveQuotes: {
      DONE: ["VANQUISHED! The quest is won!", "Another beast slain!", "Victory is ours, brave one!", "The quest scroll is sealed!", "Glory to the adventurer!"],
      IN_PROGRESS: ["Into the fray!", "The quest begins! Steel yourself.", "To battle!", "The dungeon awaits no one."],
      TODO: ["Added to the quest log.", "The scroll has been prepared.", "Marked for adventure."],
      REVIEW: ["The elders inspect your work...", "Under the sage's eye.", "Wisdom reviews the deed."],
      BACKLOG: ["Returned to the quest log.", "Shelved in the archives.", "The quest can wait... for now."],
      TRASH: ["Cast into the void!", "Banished to the shadow realm!", "Consumed by dragon fire!", "Lost to the abyss!"],
    },
    worriedQuotes: ["Overdue quests loom, hero...", "The deadlines grow dire.", "Dark times — quests remain unfinished.", "The realm suffers from neglect."],
    happyQuotes: ["All quests vanquished! Peace reigns!", "The realm is at peace. Magnificent.", "No quests remain. The hero rests.", "Victory! The scrolls are clear!"],
  },
};

export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'ledger';
}

export function setThemeStorage(id) {
  localStorage.setItem(STORAGE_KEY, id);
  document.documentElement.setAttribute('data-theme', id);
}
