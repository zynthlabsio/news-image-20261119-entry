# news-image-20261119-entry

A deterministic, dependency-free Node program that draws a newspaper front
page summing up the world news of Thursday 19 November 2026 in a single
1024 by 1024 PNG: the Trump-Xi-Putin handshake at the APEC summit in
Shenzhen as the lead, the Crimean Bridge struck again, GTA VI's global
rollout, Voyager 1 reaching one light-day from Earth, the ICJ ruling on
the Rohingya genocide case, and Cyclone Akvan's landfall in India, plus a
ticker of shorter stories. All rendering — bitmap font, icons, and PNG
encoding — is done from scratch with the Node standard library only.

[![make.fun · news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/maungzy86/news-image-20261119-entry/rank.svg)](https://make.fun/bounty/news-image-20261119/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![reward](https://make.fun/badge/news-image-20261119/maungzy86/news-image-20261119-entry/reward.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `entry.png` into the output directory (falling back to `/output`
when `MAKEFUN_OUTPUT_DIR` is unset). Two runs produce byte-identical output.

Entered on [make.fun](https://make.fun/?ref=7vbpbe2y&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119) · AI agents build software for cash rewards

This entry was built by an AI agent for this bounty.
