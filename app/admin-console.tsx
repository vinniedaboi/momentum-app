"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./icons";
import { apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";

/**
 * What every account has been doing, for whoever runs the service.
 *
 * Two questions, in the order an operator actually asks them: who is here and
 * are they coming back — then, what has been happening. The accounts table
 * answers the first, the feed the second, and clicking an account narrows the
 * feed to it so the two are one screen rather than two.
 *
 * The feed reports actions, not writing. Topic notes, session notes and task
 * titles never leave the database — see lib/admin-db.ts, which is where that
 * decision is enforced rather than here, so a change to this component cannot
 * quietly undo it.
 */

/** Declared here rather than imported: lib/history-db.ts is server-only. */
export type AdminKind = "review" | "status" | "note" | "session" | "paper" | "task";

export type AdminEvent = {
  id: string;
  kind: AdminKind;
  at: string;
  happenedOn: string | null;
  workspaceId: string;
  email: string | null;
  fullName: string | null;
  subject: string | null;
  title: string;
  detail: string | null;
};

export type AdminAccount = {
  workspaceId: string;
  email: string | null;
  fullName: string | null;
  createdAt: string | null;
  onboardedAt: string | null;
  lastActive: string | null;
  subjects: number;
  topics: number;
  sessions: number;
  minutes: number;
  activity: number;
  papers: number;
};

type Page = { events: AdminEvent[]; nextCursor: string | null };

const KINDS: Array<{ kind: AdminKind; label: string; icon: Parameters<typeof Icon>[0]["name"] }> = [
  { kind: "review", label: "Reviews", icon: "review" },
  { kind: "status", label: "Status changes", icon: "subjects" },
  { kind: "session", label: "Study time", icon: "hours" },
  { kind: "paper", label: "Papers", icon: "papers" },
  { kind: "task", label: "Tasks", icon: "tasks" },
  { kind: "note", label: "Notes", icon: "notes" },
];

/** An account counts as active if it has done anything in this many days. */
const ACTIVE_DAYS = 7;

const dayFormat = new Intl.DateTimeFormat("en-SG", { weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false });

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

/** Whole days between an ISO timestamp and now, or null when there is none. */
function daysSince(iso: string | null) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

/**
 * "Today", "3 days ago", or the date once it is far enough back that counting
 * days stops being how anyone thinks about it.
 */
function since(iso: string | null) {
  const days = daysSince(iso);
  if (days == null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return shortDate.format(new Date(iso!));
}

export default function AdminConsole({ accounts, initial, operator }: {
  accounts: AdminAccount[];
  initial: Page;
  operator: string | null;
}) {
  const [events, setEvents] = useState(initial.events);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [hidden, setHidden] = useState<ReadonlySet<AdminKind>>(new Set());
  const [account, setAccount] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const shown = KINDS.filter(({ kind }) => !hidden.has(kind)).map(({ kind }) => kind);
  const chosen = account ? accounts.find((entry) => entry.workspaceId === account) ?? null : null;

  /** Totals for the strip along the top, counted from the rows already here. */
  const totals = useMemo(() => ({
    accounts: accounts.length,
    onboarded: accounts.filter((entry) => entry.onboardedAt).length,
    active: accounts.filter((entry) => {
      const days = daysSince(entry.lastActive);
      return days != null && days < ACTIVE_DAYS;
    }).length,
    // An account that signed up and never came back is the number worth
    // watching, and it is invisible in a total that only counts what happened.
    dormant: accounts.filter((entry) => !entry.lastActive).length,
    sessions: accounts.reduce((sum, entry) => sum + entry.sessions, 0),
    minutes: accounts.reduce((sum, entry) => sum + entry.minutes, 0),
    papers: accounts.reduce((sum, entry) => sum + entry.papers, 0),
  }), [accounts]);

  const listed = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((entry) =>
      (entry.email ?? "").toLowerCase().includes(needle)
      || (entry.fullName ?? "").toLowerCase().includes(needle));
  }, [accounts, search]);

  /** Events grouped under the day they were recorded. */
  const days = useMemo(() => {
    const groups: Array<{ day: string; events: AdminEvent[] }> = [];
    for (const event of events) {
      const day = event.at.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.events.push(event);
      else groups.push({ day, events: [event] });
    }
    return groups;
  }, [events]);

  /**
   * Refetches from the top. Called on every filter change rather than run from
   * an effect: the cursor belongs to the filter that produced it, and paging on
   * with it would interleave two different queries.
   */
  async function reload(next: { kinds: AdminKind[]; account: string | null }) {
    setBusy(true);
    setMessage(null);
    try {
      const page = await studyApi.admin.activity<Page>({
        kinds: next.kinds,
        account: next.account,
      });
      setEvents(page.events);
      setCursor(page.nextCursor);
    } catch (error) {
      setEvents([]);
      setCursor(null);
      setMessage(apiMessage(error, "That activity could not be loaded."));
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const page = await studyApi.admin.activity<Page>({ kinds: shown, account, before: cursor });
      setEvents((current) => [...current, ...page.events]);
      setCursor(page.nextCursor);
    } catch (error) {
      setMessage(apiMessage(error, "No more activity could be loaded."));
    } finally {
      setBusy(false);
    }
  }

  function toggleKind(kind: AdminKind) {
    const next = new Set(hidden);
    if (!next.delete(kind)) next.add(kind);
    setHidden(next);
    reload({ kinds: KINDS.filter((entry) => !next.has(entry.kind)).map((entry) => entry.kind), account });
  }

  function chooseAccount(workspaceId: string | null) {
    const next = workspaceId === account ? null : workspaceId;
    setAccount(next);
    reload({ kinds: shown, account: next });
  }

  return <div className="admin-page">
    <header className="admin-topbar">
      <div>
        <p className="eyebrow">OPERATOR CONSOLE</p>
        <h1>Everything happening in Momentum</h1>
        <p>{operator ? `Signed in as ${operator}. ` : ""}Read only — nothing here changes anyone&rsquo;s data.</p>
      </div>
      <Link className="ghost-button" href="/">Back to the app</Link>
    </header>

    <section className="admin-totals" aria-label="Totals across every account">
      <article><span>Accounts</span><strong>{totals.accounts}</strong><small>{totals.onboarded} finished onboarding</small></article>
      <article className={totals.active ? "on-track" : ""}>
        <span>Active</span>
        <strong>{totals.active}</strong>
        <small>did something in {ACTIVE_DAYS} days</small>
      </article>
      <article className={totals.dormant ? "behind" : ""}>
        <span>Never started</span>
        <strong>{totals.dormant}</strong>
        <small>signed up, did nothing</small>
      </article>
      <article><span>Time logged</span><strong>{formatMinutes(totals.minutes)}</strong><small>over {totals.sessions} sessions</small></article>
      <article><span>Papers sat</span><strong>{totals.papers}</strong><small>recorded with a mark</small></article>
    </section>

    <section className="panel-card admin-accounts">
      <div className="section-heading">
        <div><p className="eyebrow">ACCOUNTS</p><h3>Who is here, and when they were last in</h3></div>
        <input
          type="search"
          value={search}
          placeholder="Filter by name or email"
          aria-label="Filter accounts by name or email"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {listed.length ? <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Joined</th>
              <th scope="col">Last active</th>
              <th scope="col">Subjects</th>
              <th scope="col">Topics</th>
              <th scope="col">Time</th>
              <th scope="col">Papers</th>
              <th scope="col">Events</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((entry) => {
              const days = daysSince(entry.lastActive);
              return <tr key={entry.workspaceId} className={account === entry.workspaceId ? "chosen" : ""}>
                <th scope="row">
                  <button type="button" onClick={() => chooseAccount(entry.workspaceId)}>
                    <strong>{entry.fullName ?? entry.email ?? "Unnamed account"}</strong>
                    <small>{entry.fullName && entry.email ? entry.email : entry.workspaceId.slice(0, 8)}</small>
                  </button>
                </th>
                <td>{entry.createdAt ? shortDate.format(new Date(entry.createdAt)) : "—"}</td>
                <td className={days == null ? "quiet" : days >= 30 ? "cold" : days < ACTIVE_DAYS ? "warm" : ""}>
                  {since(entry.lastActive)}
                </td>
                <td>{entry.subjects || "—"}</td>
                <td>{entry.topics || "—"}</td>
                <td>{entry.minutes ? formatMinutes(entry.minutes) : "—"}</td>
                <td>{entry.papers || "—"}</td>
                <td>{entry.activity || "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div> : <p className="admin-empty">No account matches “{search}”.</p>}
    </section>

    <section className="panel-card admin-feed">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ACTIVITY</p>
          <h3>{chosen
            ? `What ${chosen.fullName ?? chosen.email ?? "this account"} has been doing`
            : "Everything, newest first"}</h3>
        </div>
        {chosen && <button type="button" className="ghost-button" onClick={() => chooseAccount(null)}>
          Show every account
        </button>}
      </div>

      <div className="admin-filters" role="group" aria-label="Show or hide kinds of activity">
        {KINDS.map(({ kind, label, icon }) => {
          const off = hidden.has(kind);
          return <button
            key={kind}
            type="button"
            className={`history-filter ${kind}${off ? " off" : ""}`}
            aria-pressed={!off}
            onClick={() => toggleKind(kind)}
          ><Icon name={icon} />{label}</button>;
        })}
      </div>

      {message && <p className="admin-error" role="status">{message}</p>}

      {!events.length ? <p className="admin-empty">
        {busy ? "Loading…" : shown.length ? "Nothing recorded yet." : "Turn a filter back on to see anything."}
      </p> : <div className="history-days">
        {days.map((group) => <section key={group.day} className="history-day">
          <h4>{dayFormat.format(new Date(`${group.day}T00:00:00Z`))}</h4>
          <ol>
            {group.events.map((event) => <li key={event.id} className={event.kind}>
              <time dateTime={event.at}>{timeFormat.format(new Date(event.at))}</time>
              <i aria-hidden="true" />
              <div>
                <strong>{event.title}</strong>
                <span>
                  {event.subject && <b>{event.subject}</b>}
                  {event.detail}
                  {/* A paper sat last week and logged today needs both dates or
                      the row claims it happened today. */}
                  {event.happenedOn && event.happenedOn !== group.day
                    && ` · for ${dayFormat.format(new Date(`${event.happenedOn}T00:00:00Z`))}`}
                </span>
              </div>
              {!chosen && <em className="admin-who">{event.fullName ?? event.email ?? event.workspaceId.slice(0, 8)}</em>}
            </li>)}
          </ol>
        </section>)}
      </div>}

      {cursor && <button type="button" className="ghost-button admin-more" disabled={busy} onClick={loadMore}>
        {busy ? "Loading…" : "Load more"}
      </button>}

      <p className="admin-note">
        Actions only. What people write stays theirs — topic notes, session notes
        and task titles are never read out of the database for this page, so a
        row says a note was added rather than what it said.
      </p>
    </section>
  </div>;
}
