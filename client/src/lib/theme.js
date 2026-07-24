export const APP_TITLE = 'The Ledger';

export const ASSETS = {
  sidebarBottom: '/art/cuties.png',
  emptyColumn: '/art/peace.png',
};

export const GUS_FACES = {
  idle: '/gus/idle.png',
  blinking: '/gus/blinking.png',
  thinking: '/gus/thinking.png',
  smiling: '/gus/smiling.png',
  curious: '/gus/curious.png',
};

export const GUS_PERSONA = { name: 'Augustus "Gus"', role: 'Filing Clerk', status: 'On Duty', nameplate: 'Augustus' };

export const LEVEL_TITLES = ['Intern', 'Filing Clerk', 'Junior Archivist', 'Archivist', 'Senior Archivist', 'Records Officer', 'Chief of Records', 'Ledger Master', 'Bureau Director', 'Grand Archivist'];

export const STATUS_LABELS = { BACKLOG: 'Backlog', TODO: 'To Do', IN_PROGRESS: 'In Progress', REVIEW: 'Review', DONE: 'Done' };

export const GUS_QUOTES = {
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
};
