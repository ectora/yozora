import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import contentDisposition from "content-disposition";

export const config = { maxDuration: 120 };
const MAX_URL_LENGTH = 8192;
const MAX_TITLE_LENGTH = 180;
const FFMPEG_TIMEOUT_MS = 110000;
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
if (!process.env.FFMPEG_PATH) console.warn("[security] FFMPEG_PATH is unset; configure a patched FFmpeg 6.1.3+ binary in deployment");
const activeRequests = new Set();

function getOrigin(req) {
  return process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://${req.headers.host}`);
}

function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168 || a === 169 && b === 254));
  }
  return !(/^(::1|::|fc|fd|fe8|fe9|fea|feb)/i.test(address));
}

async function assertPublicMediaUrl(value) {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) throw new Error("invalid media URL");
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("invalid media URL");
  const addresses = isIP(parsed.hostname) ? [parsed.hostname] : (await lookup(parsed.hostname, { all: true })).map(({ address }) => address);
  if (!addresses.length || !addresses.every(isPublicAddress)) throw new Error("media URL is not public");
}

export default async function handler(req, res) {
  const { url, format } = req.query;

  if (!url || typeof url !== "string" || url.length > MAX_URL_LENGTH) {
    return res.status(400).send('a valid "url" parameter is required.');
  }
  if (activeRequests.size >= 2) return res.status(429).send("download capacity reached; try again shortly");
  activeRequests.add(req);

  try {
    const params = new URLSearchParams({ query: url });
    if (format) params.set("format", format);

    const infoRes = await fetch(`${getOrigin(req)}/api/info?${params.toString()}`);
    if (!infoRes.ok) {
      return res.status(400).send(await infoRes.text());
    }

    const info = await infoRes.json();
    if (info.entries) {
      return res.status(400).send("playlists are not supported");
    }

    const audioOnly = info.acodec !== "none" && info.vcodec === "none";
    if (info.acodec === "none" && info.vcodec !== "none") {
      return res.status(400).send("the selected format has no audio track");
    }

    const primaryUrl = info.url || info.requested_formats?.[0]?.url;
    if (!primaryUrl) {
      return res.status(400).send("no downloadable stream found for this format");
    }

    const mediaUrls = [primaryUrl, info.requested_formats?.[1]?.url].filter(Boolean);
    await Promise.all(mediaUrls.map(assertPublicMediaUrl));

    const args = ["-protocol_whitelist", "https,tcp,tls,crypto", "-i", primaryUrl];
    if (audioOnly) {
      args.push("-acodec", "libmp3lame", "-f", "mp3");
    } else {
      if (info.requested_formats?.[1]?.url) {
        args.push("-protocol_whitelist", "https,tcp,tls,crypto", "-i", info.requested_formats[1].url);
      }
      args.push(
        "-c:v",
        "libx264",
        "-acodec",
        "aac",
        "-movflags",
        "frag_keyframe+empty_moov",
        "-f",
        "mp4"
      );
    }
    args.push("pipe:1");

    res.setHeader("Content-Type", audioOnly ? "audio/mpeg" : "video/mp4");
    const safeTitle = String(info.title || "download")
      .replace(/[\\u0000-\\u001f\\u007f/\\\\:*?"<>|]/g, " ")
      .trim()
      .slice(0, MAX_TITLE_LENGTH) || "download";
    res.setHeader(
      "Content-Disposition",
      contentDisposition(`${safeTitle}.${audioOnly ? "mp3" : "mp4"}`)
    );

    const ffmpeg = spawn(FFMPEG_PATH, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.stdout.pipe(res);

    ffmpeg.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).send(`Failed to start ffmpeg: ${err.message}`);
      } else {
        res.end();
      }
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0 && !res.writableEnded) {
        // Headers already sent (streaming), so just end the response.
        console.error(`[v0] ffmpeg exited with code ${code}: ${stderr}`);
        res.end();
      }
    });

    const timeout = setTimeout(() => ffmpeg.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timeout);
      activeRequests.delete(req);
    };
    ffmpeg.on("close", cleanup);
    res.on("close", () => {
      if (!res.writableFinished && !ffmpeg.killed) ffmpeg.kill("SIGKILL");
      cleanup();
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(400).send(`Error: ${error.message}`);
    }
    res.end();
  }
}
