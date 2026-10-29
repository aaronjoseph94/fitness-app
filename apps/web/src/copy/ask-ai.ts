// Owns: Ask AI's "dump or ask" words in one place — the composer's invitation and helper lines, the attach flow (the
// four tags and what each does with a photo, the AI confirm and the black-out check), the Logged card (receipts with
// Undo), the "What changed" line, the offline note on a queued message, the "Still working on the answer…" line, and the
// "How you feel" card on Train. Climb words come from ./index (the summit), never typed
// here. Words only: callers hand over dates and numbers already formatted.
import { copy } from './index'

export const askAiCopy = {
  /** The empty thread's note and the ⌘K hint: what a dump does. */
  invite: "Tell me anything — food, weight, sleep, training, how you feel. I'll log it and update your plan.",
  /** After the invite on the empty thread: what comes back. */
  inviteAfter: 'Every log comes back with an Undo; plan and goal changes wait for your tap.',
  /** The AI tab hero's line. */
  pageNote: 'Logs save at once, each with an Undo. Plan changes pass the rails and wait for your tap.',
  /** The composer's placeholder (one line; it ends in an ellipsis where it doesn't fit). */
  placeholder: 'Tell me anything — food, weight, sleep, training, how you feel…',
  listening: 'Listening…',
  /** The helper line under the composer. */
  helper: 'Enter to send · Shift + Enter for a new line · photos of you never go to the AI',
  /** The helper line while offline: a message waits on this device. */
  offlineHelper: "You're offline: a message waits here and sends when you're back. Photos need a connection.",
  /** The ⌘K palette's "Ask AI here" hint. */
  paletteHint: 'Dump or ask: food, weight, sleep, how you feel',

  // The attach flow.
  attach: 'Attach photos',
  attachTitle: 'What is this photo?',
  attachOf: (n: number, total: number) => `Photo ${n} of ${total}`,
  tags: {
    meal: { label: 'Meal', hint: 'Logged as a photo meal and analysed' },
    screenshot: { label: 'Screenshot', hint: 'Watch summary, gym app, a label: black out anything private' },
    scan: { label: 'Scan sheet', hint: 'An Evolt result sheet: your name is blacked out first' },
    progress: { label: 'Progress photo', hint: 'Saved privately to Photos, never sent' },
  },
  screenshotsFull: (max: number) => `Up to ${max} screenshots per message`,
  attachmentsFull: (max: number) => `Up to ${max} attachments per message; the rest were left out.`,
  blackoutTitle: 'Black out anything private',
  blackoutHelp:
    'Drag across your name, a face or anything else private to paint a black box over it. Only the blacked-out copy is uploaded.',
  blackoutClear: 'Clear boxes',
  blackoutBox: (n: number) => `Remove black box ${n}`,
  /** The keyboard way to add a box: one in the middle, to resize and move with the arrow keys. */
  blackoutAdd: 'Add a box',
  blackoutKeys: 'Arrow keys move the last box; Shift + arrows resize it.',
  /** The check before a screenshot or a scan sheet is added: it must be ticked. */
  coveredCheck: 'Your name, face and email are covered',
  /** The confirm before a photo goes to the AI (a meal photo; a scan sheet after its name is hidden). */
  toAiTitle: 'Send to the AI?',
  toAi: {
    meal: 'This photo goes to the AI to read the food. Only the food should be in it.',
    scan: 'This sheet goes to the AI to read the numbers, with your name blacked out.',
  },
  send: 'Send',
  maskTitle: 'Hide your name',
  maskHelp:
    'Drag the black box over your name; drag a corner to resize it. Only the masked image is uploaded.',
  poseTitle: 'Which pose?',
  progressSaved: 'Saved privately — photos of you never go to the AI.',
  progressQueued:
    'Saved privately on this device; it uploads when you are back online. It never goes to the AI.',
  addToMessage: 'Add to message',
  logMeal: 'Log the meal',
  savePhoto: 'Save privately',
  skip: 'Skip this photo',
  back: 'Back',
  opening: 'Opening the photo…',
  working: {
    meal: 'Logging the meal…',
    scan: 'Uploading the sheet…',
    screenshot: 'Uploading…',
    progress: 'Saving…',
  },
  chip: {
    meal: 'Meal photo',
    scan: 'Scan sheet',
    screenshot: (n: number) => `Screenshot ${n}`,
  },
  /** The remove button of an attached chip; a meal or a scan stays logged. */
  chipRemove: (label: string, kept: boolean) =>
    kept ? `Remove ${label} from the message (it stays logged)` : `Remove ${label}`,

  // The reply.
  loggedTitle: 'Logged',
  undo: 'Undo',
  undone: 'Undone',
  undoQueued: 'Undo waits for a connection',
  undoLabel: (summary: string) => `Undo: ${summary}`,
  /** "Projected summit Nov 30 → Dec 4 · −0.6 kg/wk" (or "… no date yet"). */
  projected: (from: string | null, to: string, rate: string) =>
    `Projected ${copy.goalLabel} ${from === null ? '' : `${from} → `}${to} · ${rate} kg/wk`,
  noDate: 'no date yet',
  whatChanged: 'What changed',

  // A message queued offline.
  queuedNote: "Will send when you're back online",

  // A turn whose answer is still coming (the message was cut off while the turn ran on, or just left the queue).
  stillWorking: 'Still working on the answer…',
  stillWorkingLate:
    'The answer is taking a while. It shows here once it is ready; reopen this chat to check.',

  // Train's "How you feel" card.
  bodyNotesTitle: 'How you feel',
  bodyNotesSubtitle: 'From what you told Ask AI. Generated workouts go easy on these.',
  betterNow: 'Better now',
  betterLabel: (what: string) => `Better now: ${what}`,
  since: (day: string) => `Since ${day}`,
} as const
