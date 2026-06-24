import Link from "next/link";

export default function Custom404() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="text-7xl font-bold tracking-tight text-accent">404</span>
      <p className="mt-4 text-base leading-relaxed text-muted">
        That page drifted off into the night sky.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-strong"
      >
        Back home
      </Link>
    </div>
  );
}
