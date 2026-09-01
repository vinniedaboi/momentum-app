"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "./icons";
import { apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";

/**
 * Everything you have done, newest first.
 *
 * The app records each kind of work where it happens and shows it only there:
 * a topic's timeline knows its own history, the calendar knows what is
 * scheduled. This is the one view that answers "what have I actually done" —
 * and, on a bad week, "have I done anything at all".
 *
 * It pages by cursor rather than by page number, because new activity lands at
 * the top of this list and an offset would repeat or skip rows as it did.
 */

export type HistoryKind = "review" | "status" | "note" | "session" | "paper" | "task";

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  at: string;
  happenedOn: string | null;
  subject: string | null;
  title: string;
  detail: string | null;
};

type Page = { entries: HistoryEntry[]; nextCursor: string | null; counts?: Record<string, number> };

const KINDS: Array<{ kind: HistoryKind; label: string; icon: Parameters<typeof Icon>[0]["name"] }> = [
  { kind: "review", label: "Reviews", icon: "review" },
  { kind: "status", label: "Status changes", icon: "subjects" },
  { kind: "session", label: "Study time", icon: "hours" },
  { kind: "paper", label: "Papers", icon: "papers" },
  { kind: "task", label: "Tasks", icon: "tasks" },
  { kind: "note", label: "Notes", icon: "notes" },
];

const dayFormat = new Intl.DateTimeFormat("en-SG", { weekday: "long", day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "Today" and "Yesterday" read faster than a date a reader has to place. */
function dayHeading(iso: string, today: string) {
  const day = iso.slice(0, 10);
  if (day === today) return "Today";
  const before = new Date(`${today}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  if (day === before.toISOString().slice(0, 10)) return "Yesterday";
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

export default function HistoryView({ today, onMessage }: {
  today: string;
  onMessage: (message: string) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<HistoryKind>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  /**
   * Which filter the rows on screen belong to. Loading is derived from it
   * rather than flagged: a flag has to be set at the top of the effect, which
   * is a synchronous setState during render, and it can also be left true if a
   * request neither resolves nor rejects.
   */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const shown = KINDS.filter(({ kind }) => !hidden.has(kind)).map(({ kind }) => kind);
  const kindsKey = shown.join(",");
  const loading = loadedKey !== kindsKey;

  // Refetch from the top whenever the filter changes: the cursor belongs to the
  // old filter and paging on with it would interleave two different queries.
  useEffect(() => {
    let live = true;
    studyApi.history.list<Page>({ kinds: shown })
      .then((page) => {
        if (!live) return;
        setEntries(page.entries);
        setCursor(page.nextCursor);
        if (page.counts) setCounts(page.counts);
      })
      .catch((failure) => {
        if (!live) return;
        setEntries([]);
        setCursor(null);
        onMessage(apiMessage(failure, "Your history could not be loaded."));
      })
      // Marked loaded either way, so a failed fetch shows the empty state
      // rather than spinning forever.
      .finally(() => { if (live) setLoadedKey(kindsKey); });
    return () => { live = false; };
  }, [kindsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await studyApi.history.list<Page>({ kinds: shown, before: cursor });
      setEntries((current) => [...current, ...page.entries]);
      setCursor(page.nextCursor);
    } catch (failure) {
      onMessage(apiMessage(failure, "No more history could be loaded."));
    } finally {
      setLoadingMore(false);
    }
  }

  function toggle(kind: HistoryKind) {
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  }

  /** Entries grouped under the day they happened. */
  const days = useMemo(() => {
    const groups: Array<{ day: string; entries: HistoryEntry[] }> = [];
    for (const entry of entries) {
      const day = entry.at.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.entries.push(entry);
      else groups.push({ day, entries: [entry] });
    }
    return groups;
  }, [entries]);

  const total = KINDS.reduce((sum, { kind }) => sum + (counts[kind] ?? 0), 0);

  return <div className="history-page">
    <section className="panel-card history-panel">
      <div className="section-heading history-heading">
        <div>
          <p className="eyebrow">YOUR HISTORY</p>
          <h3>{total ? `${total.toLocaleString("en-SG")} things logged` : "Nothing logged yet"}</h3>
        </div>
      </div>

      <div className="history-filters" role="group" aria-label="Show or hide kinds of activity">
        {KINDS.map(({ kind, label, icon }) => {
          const off = hidden.has(kind);
          return <button
            key={kind}
            type="button"
            className={`history-filter ${kind}${off ? " off" : ""}`}
            aria-pressed={!off}
            onClick={() => toggle(kind)}
          >
            <Icon name={icon} />
            {label}
            {counts[kind] !== undefined && <b>{counts[kind]}</b>}
          </button>;
        })}
      </div>

      {loading ? (
        <div className="history-loading" aria-hidden="true">{[0, 1, 2, 3, 4].map((row) => <i key={row} />)}</div>
      ) : !entries.length ? (
        <div className="history-empty">
          <span><Icon name="review" /></span>
          <strong>{shown.length === KINDS.length ? "Nothing here yet" : "Nothing of that kind yet"}</strong>
          <p>{shown.length === KINDS.length
            ? "Mark a topic, log a session or record a paper, and it will show up here."
            : "Turn another filter back on, or go and make some."}</p>
        </div>
      ) : (
        <div className="history-days">
          {days.map((group) => (
            <section key={group.day} className="history-day">
              <h4>{dayHeading(group.day, today)}</h4>
              <ol>
                {group.entries.map((entry) => (
                  <li key={entry.id} className={entry.kind}>
                    <time dateTime={entry.at}>{timeFormat.format(new Date(entry.at))}</time>
                    <i aria-hidden="true" />
                    <div>
                      <strong>{entry.title}</strong>
                      <span>
                        {entry.subject && <b>{entry.subject}</b>}
                        {entry.detail}
                        {/* A paper sat last week and logged today needs both dates
                            or the row claims you did it today. */}
                        {entry.happenedOn && entry.happenedOn !== group.day
                          && ` · for ${dayFormat.format(new Date(`${entry.happenedOn}T00:00:00Z`))}`}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {cursor && !loading && (
        <div className="history-more">
          <button type="button" className="ghost-button" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Show older"}
          </button>
        </div>
      )}
    </section>
  </div>;
}
