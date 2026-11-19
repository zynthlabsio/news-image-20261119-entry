# The World in One Picture — news-image-20261119

A single-file Node.js program (`main.ts`) that draws a newspaper front page
summing up the world news of **Thursday, 19 November 2026** into one
1024×1024 PNG.

## What is on the page

- Masthead: *The World in One Picture*, dated Thursday, 19 November 2026.
- Lead story: Trump, Xi and Putin shake hands at the APEC summit in
  Shenzhen, illustrated with the US, Chinese and Russian flags over a
  three-way handshake drawn in code.
- Secondary stories: the Crimean Bridge attack, the worldwide GTA VI
  launch, Voyager 1 reaching one light-day from Earth, the ICJ judgment in
  the Rohingya genocide case, and Cyclone Akvan's landfall in India.
- Ticker: Hakeem Jeffries becomes the first Black Speaker of the US House;
  the EU's 45-billion loan for Ukraine; a Van Gogh sells for a record
  $190.4M; Finland seals its first permanent nuclear waste vault; Bank
  Indonesia holds rates at 6%.

## How it works

Everything is drawn from scratch with the Node.js standard library only:

- a hand-written PNG encoder (CRC-32 plus `node:zlib` deflate),
- a small software rasteriser (rectangles, discs, lines, triangles,
  starbursts) over an RGB pixel buffer,
- a hand-drawn 5×7 bitmap font for all lettering.

No network, no clocks, no randomness: the output is deterministic, so two
runs produce byte-identical files.

## Run

```sh
node main.ts   # writes /output/entry.png (1024×1024)
```

## License

MIT — see `LICENSE`.
