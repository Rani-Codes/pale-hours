// Feedback intake rules. Pure: an issue goes in, the actions to take come out.
// The issue text is a friend's words. It is parsed, never rewritten or run.

export const limits = {
  maxOpenPerUser: 5, // open needs-approval issues one person may have
  maxTitle: 120,
  maxDetails: 5000,
};

export const labels = {
  pending: "needs-approval",
  needsInfo: "needs-info",
  notInvited: "not-invited",
  overLimit: "over-limit",
  types: { Bug: "bug", Idea: "idea" },
};

// The headings GitHub writes for each field of .github/ISSUE_TEMPLATE/feedback.yml.
export const fields = {
  type: "Bug or idea",
  details: "What happened, or what you want",
  role: "Which role were you playing?",
};

const empty = "_No response_";

/** Splits a form-rendered body into { heading: value }. */
export function parseForm(body) {
  const out = {};
  for (const part of (body ?? "").split(/^### /m).slice(1)) {
    const nl = part.indexOf("\n");
    const heading = (nl < 0 ? part : part.slice(0, nl)).trim();
    const value = nl < 0 ? "" : part.slice(nl + 1).trim();
    out[heading] = value === empty ? "" : value;
  }
  return out;
}

/** What is missing or wrong with a submission, as sentences for the comment. */
export function problems(title, form) {
  const out = [];
  const titleText = title.trim();
  if (!titleText) out.push("The title is empty. Give it a short title.");
  else if (titleText.length > limits.maxTitle) out.push(`The title is over ${limits.maxTitle} characters. Shorten it.`);
  if (!(form[fields.type] in labels.types)) out.push(`Pick Bug or Idea under "${fields.type}".`);
  const details = form[fields.details] ?? "";
  if (!details) out.push(`Fill in "${fields.details}".`);
  else if (details.length > limits.maxDetails) out.push(`"${fields.details}" is over ${limits.maxDetails} characters. Shorten it.`);
  return out;
}

/**
 * @param {object} p
 * @param {{ title: string, body: string|null, state: string, labels: string[] }} p.issue
 * @param {string} p.author
 * @param {string} p.owner        the repository owner, always invited
 * @param {string[]} p.invited    usernames from .github/feedback-allowlist.txt
 * @param {number} p.openPending  the author's other open needs-approval issues
 * @param {"opened"|"edited"} p.action
 * @returns {{ add: string[], remove: string[], comment?: string, close?: boolean }}
 */
export function decide({ issue, author, owner, invited, openPending, action }) {
  const none = { add: [], remove: [] };
  if (issue.state !== "open") return none;
  const form = parseForm(issue.body);
  const fromForm = fields.type in form || fields.details in form;
  const isOwner = author.toLowerCase() === owner.toLowerCase();
  // The owner's own issues that skip the form are ordinary tracking issues.
  if (isOwner && !fromForm) return none;
  // An edit only matters while intake is waiting on a fix.
  if (action === "edited" && !issue.labels.includes(labels.needsInfo)) return none;

  const allowed = isOwner || invited.some((u) => u.toLowerCase() === author.toLowerCase());
  if (!allowed) {
    return {
      add: [labels.notInvited],
      remove: [],
      close: true,
      comment:
        "Thanks for the interest in Pale Hours. Feedback here is invite-only for now, so this issue is closed. " +
        "If you know the developer, ask them to add you to the feedback list.",
    };
  }

  const wrong = problems(issue.title, form);
  if (wrong.length) {
    if (issue.labels.includes(labels.needsInfo)) return none;
    return {
      add: [labels.needsInfo],
      remove: [],
      comment:
        "Thanks! This is missing something before it can be reviewed:\n\n" +
        wrong.map((w) => `- ${w}`).join("\n") +
        "\n\nEdit the issue to fix it and it will be picked up automatically.",
    };
  }

  if (openPending >= limits.maxOpenPerUser) {
    return {
      add: [labels.overLimit],
      remove: [labels.needsInfo].filter((l) => issue.labels.includes(l)),
      close: true,
      comment:
        `Thanks! You already have ${openPending} open suggestions waiting for review, and the limit is ${limits.maxOpenPerUser}. ` +
        "This one is closed for now. Open it again once one of the others is handled.",
    };
  }

  return {
    add: [labels.pending, labels.types[form[fields.type]]],
    remove: [labels.needsInfo].filter((l) => issue.labels.includes(l)),
  };
}

/** Reads the allowlist: one username per line, # starts a comment. */
export function parseAllowlist(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim().replace(/^@/, ""))
    .filter(Boolean);
}
