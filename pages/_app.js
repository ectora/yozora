import Head from "next/head";
import Router from "next/router";
import NProgress from "nprogress";

import Nav from "../components/nav";
import "../styles/index.css";

NProgress.configure({ showSpinner: false });

Router.events.on("routeChangeStart", () => NProgress.start());
Router.events.on("routeChangeComplete", () => NProgress.done());
Router.events.on("routeChangeError", () => NProgress.done());

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>yozora — a minimal web UI for yt-dlp</title>
        <meta
          name="description"
          content="yozora is a minimal, responsive web UI and serverless API for yt-dlp. Fetch info and download media from hundreds of sites."
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#060912" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="flex min-h-dvh flex-col bg-background">
        <Nav />
        <main className="flex flex-1 flex-col">
          <Component {...pageProps} />
        </main>
      </div>
    </>
  );
}
