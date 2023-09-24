# youtube-dl-web

a minimal web ui and serverless api for [youtube-dl](https://github.com/ytdl-org/youtube-dl). \
a clone of [this repository](https://github.com/saanuregh/youtube-dl-web)

> [!WARNING]  
> This repository currently support the use of NodeJS 16.x and may not build correctly on later versions.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/ectora/yozora)

## How to use the serverless API

### To download

`/api/download`

#### parameters

- `url` - url to the media, no playlists (required)
- `format` - format as per youtube-dl format (default: bestvideo+bestaudio/best)

### To get info

`/api/info`

#### parameters

- `query` - search query or url (required)
- `format` - format as per youtube-dl format (default: bestvideo+bestaudio/best)
