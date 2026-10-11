"use client";

import { useEffect } from "react";

// The last boundary: the root layout itself threw, so this page brings its
// own document and none of the app's styles, fonts or theme. It stays plain
// on purpose, following the system's light or dark scheme.

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          colorScheme: "light dark",
        }}
      >
        <title>Something went wrong · AgileKit</title>
        <h1 style={{ margin: 0, fontSize: "32px", letterSpacing: "-0.03em" }}>Something went wrong.</h1>
        <p style={{ margin: 0, opacity: 0.7 }}>AgileKit didn&apos;t load. It&apos;s usually brief, so try again in a moment.</p>
        <button
          onClick={() => retry()}
          style={{ font: "inherit", padding: "8px 16px", borderRadius: "8px", border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}
        >
          Try again
        </button>
        {error.digest && <p style={{ margin: 0, fontFamily: "monospace", fontSize: "12px", opacity: 0.5 }}>Reference {error.digest}</p>}
      </body>
    </html>
  );
}
