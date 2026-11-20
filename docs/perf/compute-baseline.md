# Calculation times before the changes

`npx tsx scripts/perf/compute-bench.ts` on `main` at `90d9fe6`, before any
change in this branch. Medians in milliseconds over 15 rounds, Node v22.23.4,
one core of the measurement machine (8-core x86 server, Amazon Linux 2023).
A mid-range phone is roughly four times slower than this per core.

| Calculation | typical | heavy |
| --- | ---: | ---: |
| snapshot KB | 153 | 1811 |
| JSON.stringify (persist write) | 0.66 | 5.43 |
| JSON.parse (rehydrate) | 0.48 | 4.32 |
| notifications: evaluate + inbox | 5.1 | 114.37 |
| habits: context (activity layer) | 0.59 | 4.54 |
| habits: today + summary | 3.85 | 104.05 |
| habits: 90-day consistency | 5.7 | 116.53 |
| coach: recommendations | 1.3 | 8.56 |
| coach: briefing | 5 | 116.3 |
| coach: analysis | 5.47 | 117.1 |
| mentor context | 1.47 | 7.07 |
| review: measure a week | 1.09 | 8.25 |
| review: 8-week trend | 4.46 | 19.59 |
| journal analysis (by week) | 0.77 | 1.23 |
| heatmap + streak | 0.07 | 0.23 |

"typical" is the interactive demo's sample account (about five months, 153 KB).
"heavy" is the same person two years in (1.8 MB): see `scripts/perf/dataset.ts`.
