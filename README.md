# The World in One Picture — news-image-20261119

[![make.fun · news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/maungzy86/news-image-20261119-entry/rank.svg)](https://make.fun/bounty/news-image-20261119/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![reward](https://make.fun/badge/news-image-20261119/maungzy86/news-image-20261119-entry/reward.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)

This repository holds my entry for the make.fun bounty
[news-image-20261119](https://make.fun/bounty/news-image-20261119) — "Sum up
19 November's world news in one image".

The entry itself is a single Node program, `main.ts`, that paints an entire
newspaper front page from code and saves it as a 1024×1024 PNG at
`/output/entry.png`. Nothing is photographed, downloaded or traced: every
letter, rule line, flag and illustration on the sheet is placed pixel by
pixel by the program, so running it again always produces the same page.

The sheet is dated **Thursday, 19 November 2026** and is built like a real
front page. A bold masthead carries the title "The World in One Picture",
a dark date band spells out the day in full, and the lead story covers the
APEC summit in Shenzhen, where Trump, Xi and Putin shake hands — shown with
the United States, Chinese and Russian flags above a three-way handshake
drawn in code. Around that centrepiece sit the day's other big stories:
another hit on the Crimean Bridge, the worldwide launch of GTA VI, Voyager 1
crossing one light-day from Earth, the ICJ judgment in the Rohingya case,
and Cyclone Akvan making landfall in India. A ticker strip along the bottom
squeezes in the rest of the day — a new US House Speaker, an EU loan for
Ukraine, a record Van Gogh sale, Finland's sealed nuclear waste vault and
Bank Indonesia holding rates — so a single glance really does cover the
planet's news for that Thursday.

## How it is made

The program uses only the Node.js standard library. It ships its own PNG
encoder (CRC-32 checksums plus `node:zlib` deflate), a tiny software
rasteriser that draws rectangles, discs, lines and triangles into an RGB
pixel buffer, and a hand-drawn 5×7 bitmap font for all of the lettering.
There is no network access, no clock and no randomness involved, which is
why two separate runs give byte-identical output files.

## Running it

You need a recent Node.js that can run TypeScript files directly. From the
root of this repository:

```sh
node main.ts
```

That writes the finished front page to `/output/entry.png` (1024×1024) and
prints the size of the file it produced. A pre-rendered copy of the result,
`entry.png`, is kept in this repository so the page can be viewed without
running anything.

## License

MIT — this entry is released under the MIT License; see the `LICENSE` file
in this repository for the full text.
