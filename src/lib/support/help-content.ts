/**
 * Documentation shown on /help. One shared set of articles covering both
 * products, grouped so a merchant can jump straight to the part they use.
 *
 * Kept as data rather than JSX so the page can search and filter it.
 */

export type HelpCategoryId =
  | "getting-started"
  | "loyalty"
  | "queue"
  | "billing"
  | "account";

export interface HelpArticle {
  id: string;
  question: string;
  /** Leading paragraphs, rendered before the lists. */
  body: string[];
  /** Optional unordered points (brand-coloured dots). */
  bullets?: string[];
  /** Optional ordered walkthrough (brand-coloured number badges). */
  steps?: string[];
}

export interface HelpCategory {
  id: HelpCategoryId;
  label: string;
  blurb: string;
  articles: HelpArticle[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    label: "Getting started",
    blurb: "Set up your business, your branches and your team.",
    articles: [
      {
        id: "what-is-froq",
        question: "What is Froq, and how do the two products fit together?",
        body: [
          "Froq is a customer platform for restaurants and cafés with two products that run from one dashboard.",
          "They are billed separately but share one business account. Your branches, your team and your customer list are common to both, so a guest who joins your queue and a customer who collects stamps are the same person on the Customers page.",
        ],
        bullets: [
          "Loyalty Stamps — a digital stamp card that brings people back.",
          "Smart Queue — a live waitlist that calls guests on WhatsApp when their table is ready.",
        ],
      },
      {
        id: "first-setup",
        question: "How do I set up my business for the first time?",
        body: [
          "After you subscribe, Froq walks you through a short setup wizard for the product you bought. You can change any of it later under Business settings.",
        ],
        steps: [
          "Enter your business name, address and contact details.",
          "Upload your logo and pick a brand colour — these appear on your customer-facing screens.",
          "Configure the product: your stamp card and reward for Loyalty, or your estimated wait time for Queue.",
          "Print or display your QR code so customers can scan it.",
        ],
      },
      {
        id: "install-app",
        question: "Should I install Froq on my counter device?",
        body: [
          "Yes. Froq runs in the browser but installs to your home screen like a normal app, which keeps it full-screen and lets it receive alerts when it isn't open.",
          "Open the prompt from Settings, or use your browser menu and choose Add to Home Screen. Turn on notifications at the same time so you don't miss stamp approvals or guests joining the queue.",
        ],
      },
      {
        id: "branches",
        question: "How do branches work?",
        body: [
          "Each branch has its own QR code, its own queue and its own customer activity. The branch switcher in the header controls what you're looking at, and owners can view all branches at once.",
          "How many branches you can create depends on your plan. Because branches are shared between products, you get whichever allowance is more generous across the plans you hold.",
        ],
      },
    ],
  },
  {
    id: "loyalty",
    label: "Loyalty Stamps",
    blurb: "Stamps, approvals, rewards and redemption.",
    articles: [
      {
        id: "how-stamping-works",
        question: "How does a customer collect a stamp?",
        body: [
          "Customers scan your QR code, which opens their card in the browser. No app to install and nothing to carry.",
        ],
        steps: [
          "The customer scans your QR code and taps to request a stamp.",
          "The request appears under Home on your dashboard, with the customer's name and current stamp count.",
          "Approve it and the stamp lands on their card immediately.",
          "When they reach the full card, the reward unlocks and they get a WhatsApp message.",
        ],
      },
      {
        id: "approvals",
        question: "Why do stamps need approving?",
        body: [
          "Approval is what stops customers stamping themselves from the car park. The request only becomes a stamp once someone on your team confirms the visit was real.",
          "Any role can approve. Every approval records who did it, so you can see the staff member against each stamp in History.",
        ],
      },
      {
        id: "redeem",
        question: "How does a customer redeem a reward?",
        body: [
          "When a card is complete the customer gets a redeem code. Enter it from the Scan action on your dashboard and the reward is marked claimed.",
        ],
        steps: [
          "The customer shows you the redeem code on their card.",
          "Tap Scan on your dashboard and enter or scan the code.",
          "Confirm the reward — the card resets and a new cycle begins.",
        ],
      },
      {
        id: "loyalty-history",
        question: "Where can I see what my staff have been doing?",
        body: [
          "History lists every stamp and redemption in date order, with the date and time, whether it was a stamp or a reward, and which staff member performed it. Filter by branch with the switcher in the header.",
        ],
      },
    ],
  },
  {
    id: "queue",
    label: "Smart Queue",
    blurb: "Sessions, calling guests and WhatsApp alerts.",
    articles: [
      {
        id: "start-session",
        question: "How do I open the queue for the day?",
        body: [
          "Guests can only join while a session is live. Start one from the Queue home screen when you open, pause it if you need to stop taking names for a while, and end it when you close.",
          "Ending a session archives it to History, where you can review how many guests you served and what your average wait was.",
        ],
      },
      {
        id: "guest-join",
        question: "How do guests join the queue?",
        body: [
          "They scan the queue QR code at your entrance and fill in their name, mobile number and party size. There is nothing for them to install.",
          "They immediately get a WhatsApp confirmation with their position and estimated wait, and a link they can reopen any time to check where they are. You can also add a guest yourself from the dashboard if they'd rather not scan.",
        ],
      },
      {
        id: "calling",
        question: "What happens when I call a guest?",
        body: [
          "Calling sends one WhatsApp message straight away and starts the accept window — the time they have to reach you before you move on.",
          "Froq then sends up to three reminders during that window, at 7 minutes, 3 minutes and 1 minute remaining. Reminders stop the moment you mark the guest seated or left, and the guest's card on your board shows how many have gone out.",
        ],
      },
      {
        id: "seating",
        question: "Seated, left, and what each one does",
        body: [
          "Marking a guest Seated confirms they arrived, sends them a short confirmation, and feeds their actual wait back into your estimates. Marking them Left removes them from the queue and lets them know they've been passed over.",
          "Either action stops all further reminders for that guest.",
        ],
      },
      {
        id: "wait-estimates",
        question: "How is the estimated wait calculated?",
        body: [
          "You set a starting estimate per party in Queue settings. From then on Froq learns from how long guests actually wait before being seated and refines the number automatically, so the estimate your guests see gets more accurate the more you use it.",
        ],
      },
    ],
  },
  {
    id: "billing",
    label: "Plans & billing",
    blurb: "Trials, upgrades, cancellation and refunds.",
    articles: [
      {
        id: "free-trial",
        question: "How does the free trial work?",
        body: [
          "Smart Queue comes with a 7-day free trial. No card is required to start it, and it converts to nothing — if you don't pick a plan, the product simply locks at the end of the week.",
          "Your sessions, guests and history are kept, so choosing a plan later picks up exactly where you left off. The trial is available once per business.",
        ],
      },
      {
        id: "what-counts",
        question: "What counts towards my plan limits?",
        body: [
          "Loyalty plans are limited by branches and the number of customers on your list. Queue plans are limited by branches and the number of queue tickets in a calendar month — one ticket is one guest joining the queue, whether they scanned or you added them.",
          "You can see your current ticket usage for the month on the Queue History screen.",
        ],
      },
      {
        id: "change-plan",
        question: "How do I upgrade or downgrade?",
        body: [
          "Open Manage plan from your product settings and choose a tier. Upgrades are charged and applied immediately so higher limits unlock right away. Downgrades are scheduled for your next renewal, so you keep what you've already paid for until that date.",
          "Only the account owner can change plans.",
        ],
      },
      {
        id: "cancel",
        question: "What happens if I cancel?",
        body: [
          "Cancelling stops future renewals. You keep full access until the end of the period you've already paid for. After that the product locks — subscribe again to reopen it.",
          "Your data is not deleted when you cancel. You can resubscribe and carry on.",
        ],
      },
      {
        id: "refunds",
        question: "Can I get a refund?",
        body: [
          "First-time subscriptions are covered by a 7-day money-back guarantee. If it isn't right for you, raise a ticket within seven days of your first payment and we'll refund it.",
          "Renewals are outside the guarantee, but if something went wrong we'd still rather hear about it — tell us what happened and we'll take a look.",
        ],
      },
    ],
  },
  {
    id: "account",
    label: "Account & team",
    blurb: "Roles, access and your login.",
    articles: [
      {
        id: "roles",
        question: "What can each role do?",
        body: [
          "Owners can do everything, including billing, plans and adding products. Managers run day-to-day operations across the branches they're assigned to but can't touch billing. Staff work the counter — stamping, approvals and the queue — for their own branch.",
          "Every action records who performed it, whatever their role.",
        ],
      },
      {
        id: "invite-team",
        question: "How do I add someone to my team?",
        body: [
          "Owners can invite team members from Business settings. Choose their role and which branches they should see, and they'll get an email invitation to set up their own login.",
          "Invitations expire after 7 days. Send a new one if it lapses.",
        ],
      },
      {
        id: "login-trouble",
        question: "I can't log in",
        body: [
          "Use the reset link on the login screen to set a new password — the email is valid for 24 hours. Check your spam folder if it doesn't arrive within a few minutes.",
          "If you're told your email isn't registered as a Froq merchant, you may be trying to log in with a different address from the one you subscribed with. Raise a ticket and we'll find your account.",
        ],
      },
      {
        id: "delete-data",
        question: "How do I remove a customer's data?",
        body: [
          "Open the customer from the Customers page and choose Delete. This removes them from both products at once, including their loyalty card, visit history and any queue records, and it can't be undone.",
        ],
      },
    ],
  },
];

/** Ticket subjects, aligned with how we triage the inbox. */
export const TICKET_CATEGORIES = [
  "Billing & refunds",
  "Loyalty Stamps",
  "Smart Queue",
  "WhatsApp notifications",
  "Account & login",
  "Something else",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export function getCategory(id: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((category) => category.id === id);
}

export function categoryHref(categoryId: HelpCategoryId) {
  return `/help/${categoryId}`;
}

export function articleHref(categoryId: HelpCategoryId, articleId: string) {
  return `/help/${categoryId}/${articleId}`;
}

export interface HelpArticleRef {
  article: HelpArticle;
  category: HelpCategory;
  href: string;
}

/**
 * Every article in reading order, so an article page can offer the next one
 * without caring which section it falls in.
 */
export const HELP_READING_ORDER: HelpArticleRef[] = HELP_CATEGORIES.flatMap((category) =>
  category.articles.map((article) => ({
    article,
    category,
    href: articleHref(category.id, article.id),
  })),
);

export function getArticle(
  categoryId: string,
  articleId: string,
): HelpArticleRef | undefined {
  return HELP_READING_ORDER.find(
    (entry) => entry.category.id === categoryId && entry.article.id === articleId,
  );
}

/** Previous and next article in reading order, crossing section boundaries. */
export function articleNeighbours(categoryId: string, articleId: string) {
  const index = HELP_READING_ORDER.findIndex(
    (entry) => entry.category.id === categoryId && entry.article.id === articleId,
  );
  if (index === -1) return { previous: null, next: null };

  return {
    previous: index > 0 ? HELP_READING_ORDER[index - 1] : null,
    next: index < HELP_READING_ORDER.length - 1 ? HELP_READING_ORDER[index + 1] : null,
  };
}

/** First sentence of an article, used as the teaser in section listings. */
export function articleSummary(article: HelpArticle) {
  const [first = ""] = article.body;
  const match = first.match(/^.*?[.!?](?=\s|$)/);
  return (match?.[0] ?? first).trim();
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "to", "of", "in", "on", "for", "with", "my", "our", "it", "its", "i", "we",
  "how", "do", "does", "did", "can", "cant", "not", "no", "why", "what", "when",
  "isnt", "doesnt", "wont", "have", "has", "get", "got", "any", "all", "you",
]);

function tokenize(value: string): Set<string> {
  const words = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  return new Set(words);
}

/**
 * Loose word match so "reminders" finds "reminder" and "called" finds "call".
 * Prefix comparison in both directions is crude, but it beats exact matching
 * for a vocabulary this small and never needs a stemming dependency.
 */
function wordsMatch(query: string, candidate: string) {
  if (query === candidate) return true;
  if (query.length >= 4 && candidate.startsWith(query)) return true;
  return candidate.length >= 4 && query.startsWith(candidate);
}

export interface HelpSearchHit {
  articleId: string;
  question: string;
  categoryId: HelpCategoryId;
  categoryLabel: string;
  href: string;
  /** Lowercased question + body + steps, for substring search. */
  haystack: string;
  titleWords: Set<string>;
  bodyWords: Set<string>;
}

/** Flattened once at module load; both search and suggestions read from it. */
export const HELP_INDEX: HelpSearchHit[] = HELP_CATEGORIES.flatMap((category) =>
  category.articles.map((article) => {
    const body = [
      ...article.body,
      ...(article.bullets ?? []),
      ...(article.steps ?? []),
      category.label,
    ].join(" ");
    return {
      articleId: article.id,
      question: article.question,
      categoryId: category.id,
      categoryLabel: category.label,
      href: articleHref(category.id, article.id),
      haystack: `${article.question} ${body}`.toLowerCase(),
      titleWords: tokenize(article.question),
      bodyWords: tokenize(body),
    };
  }),
);

/** Categories with non-matching articles stripped out. Empty query = everything. */
export function searchHelp(query: string): HelpCategory[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return HELP_CATEGORIES;

  const matched = new Set(
    HELP_INDEX.filter((hit) => hit.haystack.includes(needle)).map((hit) => hit.articleId),
  );

  return HELP_CATEGORIES.map((category) => ({
    ...category,
    articles: category.articles.filter((article) => matched.has(article.id)),
  })).filter((category) => category.articles.length > 0);
}

/**
 * Article suggestions for the ticket subject field — a chance to answer the
 * question before it becomes a ticket.
 *
 * A word in the title counts for much more than the same word buried in the
 * body, and anything scoring well below the best hit is dropped rather than
 * padded in, so a vague subject shows two good articles instead of four weak
 * ones.
 */
export function suggestArticles(query: string, limit = 4): HelpSearchHit[] {
  const words = [...tokenize(query)];
  if (words.length === 0) return [];

  const scored = HELP_INDEX.map((hit) => {
    let score = 0;

    for (const word of words) {
      if ([...hit.titleWords].some((candidate) => wordsMatch(word, candidate))) {
        score += 3;
      } else if ([...hit.bodyWords].some((candidate) => wordsMatch(word, candidate))) {
        score += 1;
      }
    }

    return { hit, score };
  }).filter((entry) => entry.score > 0);

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);
  const cutoff = Math.max(2, scored[0].score * 0.4);

  return scored
    .filter((entry) => entry.score >= cutoff)
    .slice(0, limit)
    .map((entry) => entry.hit);
}
