// Runs in the Feedback intake workflow. Uses only the workflow's own GITHUB_TOKEN.
import { readFileSync } from "node:fs";
import { decide, labels, parseAllowlist } from "./intake.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const repo = process.env.GITHUB_REPOSITORY;
const allowlist = parseAllowlist(readFileSync(new URL("../../.github/feedback-allowlist.txt", import.meta.url), "utf8"));

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
}

const { issue } = event;
const author = issue.user.login;
const others = await gh(
  "GET",
  `/issues?state=open&labels=${labels.pending}&creator=${encodeURIComponent(author)}&per_page=100`,
);
const d = decide({
  issue: { title: issue.title, body: issue.body, state: issue.state, labels: issue.labels.map((l) => l.name) },
  author,
  owner: event.repository.owner.login,
  invited: allowlist,
  openPending: others.filter((o) => !o.pull_request && o.number !== issue.number).length,
  action: event.action,
});

const n = issue.number;
if (d.comment) await gh("POST", `/issues/${n}/comments`, { body: d.comment });
for (const l of d.remove) await gh("DELETE", `/issues/${n}/labels/${encodeURIComponent(l)}`);
if (d.add.length) await gh("POST", `/issues/${n}/labels`, { labels: d.add });
if (d.close) await gh("PATCH", `/issues/${n}`, { state: "closed", state_reason: "not_planned" });
console.log(`#${n} by ${author}: add [${d.add}] remove [${d.remove}]${d.close ? " closed" : ""}${d.comment ? " commented" : ""}`);
