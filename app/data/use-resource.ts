"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "./api";

/**
 * Loads one collection from the API and holds it.
 *
 * Every GET route answers with a single-key envelope — `{ topics }`,
 * `{ sessions }`, `{ decks }` — so the key is all this needs to unwrap one.
 * The component supplies the element type through `initial`, which keeps the
 * data layer free of domain types and so free of a cycle back into the views.
 *
 * `setValue` is exposed because writes answer with the rows they changed, and
 * splicing those into place is faster than re-fetching the collection. `reload`
 * is there for the cases where that is not enough.
 *
 * `onError` fires from the failed request itself rather than from an effect
 * watching `failed`, so a caller that turns the failure into a message shows it
 * once per attempt instead of once per render that observes the flag.
 */
export function useResource<Key extends string, Value>(
  path: string,
  key: Key,
  initial: Value,
  onError?: () => void,
): {
  value: Value;
  setValue: Dispatch<SetStateAction<Value>>;
  failed: boolean;
  reload: () => Promise<void>;
} {
  const [value, setValue] = useState<Value>(initial);
  const [failed, setFailed] = useState(false);

  // Held in a ref so callers can pass an inline arrow without that arrow's
  // changing identity re-running the load on every render.
  const report = useRef(onError);
  useEffect(() => {
    report.current = onError;
  });

  const reload = useCallback(async () => {
    try {
      const payload = await api.get<Record<Key, Value>>(path);
      setValue(payload[key]);
      setFailed(false);
    } catch {
      setFailed(true);
      report.current?.();
    }
  }, [path, key]);

  useEffect(() => {
    // set-state-in-effect reads through `reload` and sees the setters, but every
    // one of them runs after the request settles rather than during this pass,
    // so there is no cascading render to avoid.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { value, setValue, failed, reload };
}
