import Link from "next/link";

import Entry from "../../components/entry";
import Error from "../_error";

export default function Result({ data, error, statusCode, origin }) {
  if (statusCode !== 200) {
    return <Error statusCode={statusCode} title={error} />;
  }

  const isPlaylist = Boolean(data.entries);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <span aria-hidden="true">&larr;</span> new search
        </Link>
        {isPlaylist ? (
          <span className="text-sm text-muted">
            {data.entries.length} items
          </span>
        ) : null}
      </div>

      {isPlaylist ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-surface/60 p-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              playlist
            </span>
            {data.title ? (
              <a
                className="mt-1 block text-lg font-semibold hover:underline"
                href={data.webpage_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {data.title}
              </a>
            ) : null}
            {data.uploader ? (
              <a
                className="text-sm text-muted hover:text-foreground"
                href={data.uploader_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {`uploaded by ${data.uploader}`}
              </a>
            ) : null}
            {data.extractor_key ? (
              <p className="mt-1 text-xs text-muted">
                {`extracted from ${data.extractor_key.toLowerCase()}`}
              </p>
            ) : null}
          </div>
          {data.entries.map((e) => (
            <Entry key={e.id} data={e} origin={origin} />
          ))}
        </div>
      ) : (
        <Entry data={data} origin={origin} />
      )}
    </div>
  );
}

export async function getServerSideProps({ req, query }) {
  const proto =
    req.headers["x-forwarded-proto"]?.split(",")[0] ||
    (req.connection?.encrypted ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `${proto}://${host}`;

  const props = { data: null, error: null, origin, statusCode: 200 };
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  if (query.format) params.set("format", query.format);

  try {
    const res = await fetch(`${origin}/api/info?${params.toString()}`);
    if (res.ok) {
      props.data = await res.json();
    } else {
      props.statusCode = res.status === 200 ? 400 : res.status;
      props.error = await res.text();
    }
  } catch (err) {
    props.statusCode = 500;
    props.error = `Failed to reach the info API: ${err.message}`;
  }

  return { props };
}
