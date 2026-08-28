"use client"; // Error boundaries must be Client Components.

/**
 * The last line of defence: catches throws from the root layout itself, which
 * app/error.tsx sits inside and therefore cannot handle.
 *
 * This file replaces the whole document when it renders, so it must supply its
 * own <html> and <body>. Global styles are deliberately not loaded here — the
 * palette below is inlined from app/globals.css rather than imported, because a
 * stylesheet that failed to load could be the very reason this is rendering.
 *
 * `metadata` exports are unsupported in a Client Component, so the tab title
 * comes from React's own <title>.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f4f2ec",
          color: "#17233b",
          font: "16px/1.5 Arial, Helvetica, sans-serif",
        }}
      >
        <title>Something went wrong · Momentum</title>

        <div
          style={{
            width: "min(520px, 100%)",
            background: "#fff",
            border: "1px solid #e4e0d7",
            borderRadius: 24,
            padding: 32,
            boxShadow: "0 7px 26px #27365314",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Momentum hit an error</h1>
          <p style={{ margin: "0 0 20px", color: "#6d7687", fontSize: 14 }}>
            The app failed to start rendering. Trying again will reload it from
            scratch.
          </p>

          {error.digest ? (
            <p
              style={{
                margin: "0 0 20px",
                padding: "12px 14px",
                borderRadius: 13,
                background: "#fbeceb",
                border: "1px solid #edc9c6",
                color: "#8d3b3d",
                fontSize: 13.5,
              }}
            >
              Reference <strong>{error.digest}</strong> — quote this if you
              report the problem. It matches the server log entry for this exact
              failure.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => retry()}
            style={{
              width: "100%",
              height: 46,
              border: 0,
              borderRadius: 13,
              background: "#10223d",
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
