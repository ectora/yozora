import { useRouter } from "next/router";
import { useState } from "react";

const DEFAULT_FORMAT = "bestvideo+bestaudio/best";

function isUrl(value) {
  return /^https?:\/\//i.test(value.trim());
}

function ApiDoc({ origin, path, params }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-5">
      <code className="inline-block rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-xs text-accent sm:text-sm">
        {`${origin}${path}`}
      </code>
      <dl className="mt-4 space-y-2.5">
        {params.map((p) => (
          <div key={p.name} className="flex flex-col gap-0.5 text-sm">
            <dt className="font-mono font-semibold text-foreground">
              {p.name}
              {p.required ? (
                <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                  required
                </span>
              ) : null}
            </dt>
            <dd className="text-muted">{p.desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function IndexPage({ origin }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState(DEFAULT_FORMAT);
  const [showFormat, setShowFormat] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push({
      pathname: "/result",
      query: {
        format: format.trim() || DEFAULT_FORMAT,
        query: isUrl(value) ? value : `ytsearch:${value}`,
      },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-16">
      <section className="flex flex-col items-center text-center">
        <span className="rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium text-muted">
          minimal web UI + serverless API for yt-dlp
        </span>
        <h1 className="mt-5 text-pretty text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Download media from
          <br className="hidden sm:block" /> hundreds of sites
        </h1>
        <p className="mt-4 max-w-xl text-balance text-base leading-relaxed text-muted sm:text-lg">
          Paste a link or search for something. yozora fetches the available
          formats and lets you grab audio or video in a couple of taps.
        </p>
      </section>

      <section className="mx-auto mt-10 w-full max-w-2xl">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface/70 p-3 shadow-2xl shadow-black/40 sm:p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder="Enter a URL or search query"
              aria-label="URL or search query"
              className="w-full flex-1 rounded-xl bg-surface-2 px-4 py-3 text-base text-foreground caret-accent outline-none ring-1 ring-inset ring-transparent transition focus:ring-accent"
            />
            <button
              type="submit"
              className="rounded-xl bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition hover:bg-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Fetch
            </button>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowFormat((s) => !s)}
              className="text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              {showFormat ? "− hide advanced format" : "+ advanced format"}
            </button>
            {showFormat ? (
              <label className="mt-2 flex flex-col gap-1">
                <span className="text-xs text-muted">
                  yt-dlp format selector
                </span>
                <input
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full rounded-xl bg-surface-2 px-4 py-2.5 font-mono text-sm text-foreground caret-accent outline-none ring-1 ring-inset ring-transparent transition focus:ring-accent"
                />
              </label>
            ) : null}
          </div>
        </form>
        <p className="mt-3 text-center text-xs text-muted">
          Tip: a full URL is fetched directly, anything else is treated as a
          search.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Serverless API
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ApiDoc
            origin={origin}
            path="/api/info"
            params={[
              { name: "query", required: true, desc: "search query or URL" },
              {
                name: "format",
                required: false,
                desc: `yt-dlp format (default: ${DEFAULT_FORMAT})`,
              },
            ]}
          />
          <ApiDoc
            origin={origin}
            path="/api/download"
            params={[
              { name: "url", required: true, desc: "URL to the media (no playlists)" },
              {
                name: "format",
                required: false,
                desc: `yt-dlp format (default: ${DEFAULT_FORMAT})`,
              },
            ]}
          />
        </div>
        <p className="mt-4 text-sm text-muted">
          Formats follow the{" "}
          <a
            className="font-medium text-accent underline-offset-4 hover:underline"
            href="https://github.com/yt-dlp/yt-dlp/blob/master/README.md#format-selection"
            target="_blank"
            rel="noreferrer noopener"
          >
            yt-dlp format selection
          </a>{" "}
          syntax.
        </p>
      </section>
    </div>
  );
}

export async function getServerSideProps({ req }) {
  const proto =
    req.headers["x-forwarded-proto"]?.split(",")[0] ||
    (req.connection?.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return {
    props: { origin: `${proto}://${host}` },
  };
}
