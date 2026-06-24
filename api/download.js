import { spawn } from "node:child_process";
import contentDisposition from "content-disposition";
import ffmpegPath from "ffmpeg-static";

export const config = {
  maxDuration: 300,
};

function getOrigin(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  const { url, format } = req.query;

  if (!url) {
    return res.status(400).send('"url" parameter required.');
  }

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

    const args = ["-i", primaryUrl];
    if (audioOnly) {
      args.push("-acodec", "libmp3lame", "-f", "mp3");
    } else {
      if (info.requested_formats?.[1]?.url) {
        args.push("-i", info.requested_formats[1].url);
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
    res.setHeader(
      "Content-Disposition",
      contentDisposition(`${info.title}.${audioOnly ? "mp3" : "mp4"}`)
    );

    const ffmpeg = spawn(ffmpegPath, args, {
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

    // Stop transcoding if the client disconnects.
    req.on("close", () => ffmpeg.kill("SIGKILL"));
  } catch (error) {
    if (!res.headersSent) {
      return res.status(400).send(`Error: ${error.message}`);
    }
    res.end();
  }
}
