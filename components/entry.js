import prettyMilliseconds from "pretty-ms";
import { useState } from "react";

const FORMAT_KEYS = [
  "format",
  "format_id",
  "format_note",
  "height",
  "width",
  "fps",
  "ext",
  "filesize",
  "vcodec",
  "acodec",
  "tbr",
  "abr",
  "protocol",
  "url",
];

function buildDownloads(data) {
  const best = data.format_id || "";
  return (data.formats || []).reduce((acc, c) => {
    let item = { id: c.format_id, label: c.format };
    if ((data.extractor_key || "").toLowerCase() === "youtube") {
      const isRedundantAudio =
        c.format.includes("audio") && c.format_id !== best.split("+")[1];
      const isDuplicateWebm =
        !c.format.includes("audio") &&
        c.ext === "webm" &&
        data.formats.filter((i) => i.format_note === c.format_note).length >= 2;
      const isMuxed = c.vcodec !== "none" && c.acodec !== "none";
      if (isRedundantAudio || isDuplicateWebm || isMuxed) {
        return acc;
      }
      if (c.vcodec !== "none" && c.acodec === "none") {
        item = { id: `${c.format_id}+${best.split("+")[1]}`, label: c.format };
      }
    }
    return [...acc, item];
  }, []);
}

export default function Entry({ data, origin = "" }) {
  const [selected, setSelected] = useState(null);
  const best = data.format_id;
  const downloads = buildDownloads(data);

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface/60 transition-colors hover:border-accent/60">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        {data.thumbnail ? (
          <a
            href={data.webpage_url}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.thumbnail}
              className="h-40 w-full rounded-xl object-cover sm:h-24 sm:w-40"
              alt={data.title || "thumbnail"}
              loading="lazy"
            />
          </a>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <a
            href={data.webpage_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-pretty text-base font-semibold leading-snug hover:underline"
          >
            {data.title}
          </a>
          {data.uploader ? (
            <a
              href={data.uploader_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-muted hover:text-foreground"
            >
              {`uploaded by ${data.uploader}`}
            </a>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {data.extractor_key ? (
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
                {data.extractor_key.toLowerCase()}
              </span>
            ) : null}
            {data.duration ? (
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">
                {prettyMilliseconds(data.duration * 1000)}
              </span>
            ) : null}
            {data.is_live ? (
              <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                livestream
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Downloads
        </h3>
        {data.is_live ? (
          <p className="mt-2 text-sm text-muted">
            livestreams cannot be downloaded
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {downloads.map((f) => (
              <a
                key={f.id}
                href={`${origin}/api/download?${new URLSearchParams({
                  format: f.id,
                  url: data.webpage_url,
                }).toString()}`}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
              >
                {f.id === best ? `${f.label} · best` : f.label}
              </a>
            ))}
          </div>
        )}

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
          Inspect formats
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(data.formats || []).map((f) => {
            const active = selected === f;
            return (
              <button
                type="button"
                key={f.format_id}
                onClick={() => setSelected(active ? null : f)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-muted hover:border-accent/60 hover:text-foreground"
                }`}
              >
                {f.format}
              </button>
            );
          })}
        </div>

        {selected ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-surface-2 p-4 sm:grid-cols-3 md:grid-cols-4">
            {FORMAT_KEYS.map((key) =>
              selected[key] ? (
                <div key={key} className="flex min-w-0 flex-col">
                  <dt className="text-[11px] uppercase tracking-wide text-muted">
                    {key.replace(/_/g, " ")}
                  </dt>
                  <dd className="truncate text-xs text-foreground" title={String(selected[key])}>
                    {String(selected[key])}
                  </dd>
                </div>
              ) : null
            )}
          </dl>
        ) : null}
      </div>
    </article>
  );
}
