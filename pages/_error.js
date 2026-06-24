import Link from "next/link";

export default function Error({ statusCode, title }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="text-7xl font-bold tracking-tight text-accent">
        {statusCode || "error"}
      </span>
      <p className="mt-4 max-w-md text-balance text-base leading-relaxed text-muted">
        {title || "Something went wrong while processing your request."}
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

export async function getServerSideProps({ res, err }) {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return {
    props: { statusCode },
  };
}
