import contentDisposition from "content-disposition";
import execa from "execa";
import pathToFfmpeg from "ffmpeg-static";
import absoluteUrl from "next-absolute-url";
import fetch from "node-fetch";
import queryString from "query-string";

const handler = async (req, res) => {
  const {
    query: { url, format },
  } = req;
  if (url) {
    return res.status(200).send(url);
  } else {
    return res.status(400).send("\"url\" parameter required.");
  }
};

export default handler;
