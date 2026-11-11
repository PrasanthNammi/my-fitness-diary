# Phase B.1 advisory paths and disposition

Date: 2026-10-27. The 79 baseline entries include separate affected-version ranges for some GHSA IDs. All original paths below are retained verbatim from the registry audit. Node package metadata and bundled-module evidence were used together; a package-manager dev flag alone was not treated as proof of non-deployment.

Final raw hosting audit: **1 moderate**, **0 low/high/critical**. Root audit: **0**. 78 of 79 baseline entries no longer match. The remaining entry is not reachable in deployed code. No advisory is ignored or suppressed.

| Baseline entry | Severity | Package / old versions | Registry patched range | Current lock versions | Current disposition / deployment role | Original paths |
| --- | --- | --- | --- | --- | --- | --- |
| [1: GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | critical | next: 16.3.4 | >=16.3.6 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [2: GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | critical | next: 16.3.4 | >=16.4.1 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [3: GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) | critical | next: 16.3.4 | >=16.4.1 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [4: GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | brace-expansion: 1.1.14 | >=1.1.16 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [5: GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | brace-expansion: 5.0.6 | >=5.0.7 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [6: GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | brace-expansion: 1.1.14 | >=1.1.17 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [7: GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | brace-expansion: 5.0.6 | >=5.0.8 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [8: GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | brace-expansion: 5.0.6 | >=5.0.9 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [9: GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | brace-expansion: 1.1.14 | >=1.1.18 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [10: GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | brace-expansion: 1.1.14 | >=1.1.20 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [11: GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | brace-expansion: 5.0.6 | >=5.0.11 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [12: GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | brace-expansion: 1.1.14 | >=1.1.19 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [13: GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | brace-expansion: 5.0.6 | >=5.0.10 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [14: GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | high | browserslist: 4.28.2 | >=4.28.7 | 4.29.4 | FIXED; Build-time targets; not bundled | [browserslist paths](#paths-4) |
| [15: GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | high | browserslist: 4.28.2 | >=4.28.7 | 4.29.4 | FIXED; Build-time targets; not bundled | [browserslist paths](#paths-4) |
| [16: GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) | high | image-size: 2.0.2 | >=2.0.3 | removed from graph | FIXED; Unused image helper/build tooling; not bundled | [image-size paths](#paths-8) |
| [17: GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | high | image-size: 2.0.2 | >=2.0.3 | removed from graph | FIXED; Unused image helper/build tooling; not bundled | [image-size paths](#paths-8) |
| [18: GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | high | js-yaml: 4.1.1 | >=4.3.0 | 4.3.2 | FIXED; Lint configuration only; not bundled | [js-yaml paths](#paths-9) |
| [19: GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | high | js-yaml: 4.1.1 | >=4.3.1 | 4.3.2 | FIXED; Lint configuration only; not bundled | [js-yaml paths](#paths-9) |
| [20: GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | high | js-yaml: 4.1.1 | >=4.3.2 | 4.3.2 | FIXED; Lint configuration only; not bundled | [js-yaml paths](#paths-9) |
| [21: GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) | high | next: 16.3.4 | >=16.3.8 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [22: GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) | high | next: 16.3.4 | >=16.4.1 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [23: GHSA-wx67-qw84-cm4g](https://github.com/advisories/GHSA-wx67-qw84-cm4g) | high | react-server-dom-webpack: 19.2.6 | >=19.2.8 | 19.3.1 | FIXED; Deployed Worker and hosting browser runtime; patched | [react-server-dom-webpack paths](#paths-11) |
| [24: GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | high | sharp: 0.35.4 | >=0.35.5 | 0.35.5 | FIXED; Local image simulation / unused Next/OG path; not bundled | [sharp paths](#paths-13) |
| [25: GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | high | source-map-js: 1.2.1 | >=1.2.2 | 1.2.2 | FIXED; Build CSS/source maps; not bundled | [source-map-js paths](#paths-14) |
| [26: GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g) | high | undici: 7.24.8 | >=7.28.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [27: GHSA-vxpw-j846-p89q](https://github.com/advisories/GHSA-vxpw-j846-p89q) | high | undici: 7.24.8 | >=7.28.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [28: GHSA-hm92-r4w5-c3mj](https://github.com/advisories/GHSA-hm92-r4w5-c3mj) | high | undici: 7.24.8 | >=7.28.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [29: GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272) | high | undici: 7.24.8 | >=7.29.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [30: GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) | high | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [31: GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) | high | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [32: GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) | high | undici: 7.24.8 | >=7.30.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [33: GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | high | vite: 8.0.13 | >=8.1.6 | 8.3.4 | FIXED; Build/development server only; not bundled | [vite paths](#paths-16) |
| [34: GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) | high | ws: 8.18.0 | >=8.21.0 | 8.21.0 | FIXED; Local preview sockets only; not bundled | [ws paths](#paths-17) |
| [35: GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | high | zod: 3.25.76 | >=4.6.6 | 4.6.7 | FIXED; Preview validation/lint/unused scaffold; not bundled | [zod paths](#paths-18) |
| [36: GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | moderate | baseline-browser-mapping: 2.10.30 | >=2.11.0 | 2.11.30 | FIXED; Build-time targets; not bundled | [baseline-browser-mapping paths](#paths-2) |
| [37: GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | brace-expansion: 1.1.14 | >=1.1.21 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [38: GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | brace-expansion: 5.0.6 | >=5.0.12 | 1.1.21, 5.0.12 | FIXED; Lint/build path matching; not bundled | [brace-expansion paths](#paths-3) |
| [39: GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | moderate | esbuild: 0.18.20 | >=0.25.0 | 0.18.20, 0.25.12, 0.28.2 | REMAINS (only esbuild 0.18.20; dev-only); Build/development tooling; not bundled | [esbuild paths](#paths-5) |
| [40: GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) | moderate | fast-uri: 3.1.7 | >=3.1.8 | 3.1.9 | FIXED; Build schema validation / unused resolver integrations; not bundled | [fast-uri paths](#paths-6) |
| [41: GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | moderate | fast-uri: 3.1.7 | >=3.1.9 | 3.1.9 | FIXED; Build schema validation / unused resolver integrations; not bundled | [fast-uri paths](#paths-6) |
| [42: GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) | moderate | fast-uri: 3.1.7 | >=3.1.9 | 3.1.9 | FIXED; Build schema validation / unused resolver integrations; not bundled | [fast-uri paths](#paths-6) |
| [43: GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98) | moderate | fflate: 0.7.4 | >=0.7.5 | 0.7.5 | FIXED; Unused OG/font generator; not bundled | [fflate paths](#paths-7) |
| [44: GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) | moderate | js-yaml: 4.1.1 | >=4.2.0 | 4.3.2 | FIXED; Lint configuration only; not bundled | [js-yaml paths](#paths-9) |
| [45: GHSA-3w37-wq28-93x7](https://github.com/advisories/GHSA-3w37-wq28-93x7) | moderate | next: 16.3.4 | >=16.3.8 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [46: GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | moderate | next: 16.3.4 | >=16.3.8 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [47: GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) | moderate | next: 16.3.4 | >=16.3.8 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [48: GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | moderate | next: 16.3.4 | >=16.3.8 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [49: GHSA-h694-7cp9-m8p3](https://github.com/advisories/GHSA-h694-7cp9-m8p3) | moderate | next: 16.3.4 | >=16.3.8 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [50: GHSA-wx4j-mvgx-mqwp](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp) | moderate | satori: 0.16.0 | >=0.33.5 | 0.33.5, 0.33.5>fflate | FIXED; Unused OG generator; not bundled | [satori paths](#paths-12) |
| [51: GHSA-p88m-4jfj-68fv](https://github.com/advisories/GHSA-p88m-4jfj-68fv) | moderate | undici: 7.24.8 | >=7.28.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [52: GHSA-pr7r-676h-xcf6](https://github.com/advisories/GHSA-pr7r-676h-xcf6) | moderate | undici: 7.24.8 | >=7.28.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [53: GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524) | moderate | undici: 7.24.8 | >=7.29.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [54: GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) | moderate | undici: 7.24.8 | >=7.29.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [55: GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54) | moderate | undici: 7.24.8 | >=7.29.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [56: GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) | moderate | undici: 7.24.8 | >=7.29.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [57: GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) | moderate | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [58: GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) | moderate | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [59: GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) | moderate | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [60: GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) | moderate | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [61: GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685) | moderate | undici: 7.24.8 | >=7.30.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [62: GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472) | moderate | undici: 7.24.8 | >=7.30.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [63: GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | moderate | vite: 8.0.13 | >=8.0.16 | 8.3.4 | FIXED; Build/development server only; not bundled | [vite paths](#paths-16) |
| [64: GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | moderate | vite: 8.0.13 | >=8.1.6 | 8.3.4 | FIXED; Build/development server only; not bundled | [vite paths](#paths-16) |
| [65: GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | moderate | vite: 8.0.13 | >=8.1.6 | 8.3.4 | FIXED; Build/development server only; not bundled | [vite paths](#paths-16) |
| [66: GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | moderate | vite: 8.0.13 | >=8.1.6 | 8.3.4 | FIXED; Build/development server only; not bundled | [vite paths](#paths-16) |
| [67: GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | moderate | vite: 8.0.13 | >=8.0.16 | 8.3.4 | FIXED; Build/development server only; not bundled | [vite paths](#paths-16) |
| [68: GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | moderate | ws: 8.18.0 | >=8.20.1 | 8.21.0 | FIXED; Local preview sockets only; not bundled | [ws paths](#paths-17) |
| [69: GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | low | @babel/core: 7.29.0 | >=7.29.6 | 7.29.7 | FIXED; Build-time / lint; not bundled | [@babel/core paths](#paths-1) |
| [70: GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | low | esbuild: 0.27.3, 0.28.0 | >=0.28.1 | 0.18.20, 0.25.12, 0.28.2 | FIXED; Build/development tooling; not bundled | [esbuild paths](#paths-5) |
| [71: GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | low | fast-uri: 3.1.7 | >=3.1.9 | 3.1.9 | FIXED; Build schema validation / unused resolver integrations; not bundled | [fast-uri paths](#paths-6) |
| [72: GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | low | fast-uri: 3.1.7 | >=3.1.9 | 3.1.9 | FIXED; Build schema validation / unused resolver integrations; not bundled | [fast-uri paths](#paths-6) |
| [73: GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) | low | next: 16.3.4 | >=16.3.8 | 16.4.2 | FIXED; Next server unused; type/config/lint/peer only; not bundled | [next paths](#paths-10) |
| [74: GHSA-g8m3-5g58-fq7m](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) | low | undici: 7.24.8 | >=7.28.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [75: GHSA-35p6-xmwp-9g52](https://github.com/advisories/GHSA-35p6-xmwp-9g52) | low | undici: 7.24.8 | >=7.28.0 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [76: GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) | low | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [77: GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968) | low | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [78: GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv) | low | undici: 7.24.8 | >=7.29.1 | 7.30.1 | FIXED; Local Miniflare runtime; not bundled | [undici paths](#paths-15) |
| [79: GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | low | vite: 8.0.13 | >=8.1.6 | 8.3.4 | FIXED; Build/development server only; not bundled | [vite paths](#paths-16) |

## Complete original dependency paths

<a id="paths-1"></a>
### @babel/core

Build-time / lint; not bundled.

- `.>eslint-config-next>eslint-plugin-react-hooks>@babel/core`
- `.>next>styled-jsx>@babel/core`
- `.>vinext>@unpic/react>next>styled-jsx>@babel/core`

<a id="paths-2"></a>
### baseline-browser-mapping

Build-time targets; not bundled.

- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>browserslist>baseline-browser-mapping`
- `.>eslint-config-next>eslint-plugin-react-hooks>@babel/core>@babel/helper-compilation-targets>browserslist>baseline-browser-mapping`
- `.>next>baseline-browser-mapping`
- `.>next>styled-jsx>@babel/core>@babel/helper-compilation-targets>browserslist>baseline-browser-mapping`
- `.>react-server-dom-webpack>webpack>browserslist>baseline-browser-mapping`
- `.>vinext>@unpic/react>next>baseline-browser-mapping`
- `.>vinext>@unpic/react>next>styled-jsx>@babel/core>@babel/helper-compilation-targets>browserslist>baseline-browser-mapping`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>browserslist>baseline-browser-mapping`
- `.>vinext>react-server-dom-webpack>webpack>browserslist>baseline-browser-mapping`

<a id="paths-3"></a>
### brace-expansion

Lint/build path matching; not bundled.

- `.>eslint-config-next>@next/eslint-plugin-next>@eslint-community/eslint-utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>@next/eslint-plugin-next>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>@next/eslint-plugin-next>@eslint-community/eslint-utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>@typescript-eslint/parser>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>@typescript-eslint/parser>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>@typescript-eslint/parser>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>@typescript-eslint/parser>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>@typescript-eslint/parser>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>@typescript-eslint/parser>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>@typescript-eslint/parser>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>@typescript-eslint/parser>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint-import-resolver-typescript>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint-import-resolver-typescript>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint-import-resolver-typescript>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-import>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-jsx-a11y>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-jsx-a11y>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-jsx-a11y>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-jsx-a11y>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-react-hooks>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-react-hooks>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-react-hooks>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-react>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-react>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-react>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>eslint-plugin-react>minimatch>brace-expansion`
- `.>eslint-config-next>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/parser>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/parser>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/parser>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/parser>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/parser>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/parser>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/parser>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/parser>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>@typescript-eslint/typescript-estree>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>eslint>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint-config-next>typescript-eslint>eslint>minimatch>brace-expansion`
- `.>eslint>@eslint/config-array>minimatch>brace-expansion`
- `.>eslint>@eslint/eslintrc>minimatch>brace-expansion`
- `.>eslint>minimatch>brace-expansion`

<a id="paths-4"></a>
### browserslist

Build-time targets; not bundled.

- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>browserslist`
- `.>eslint-config-next>eslint-plugin-react-hooks>@babel/core>@babel/helper-compilation-targets>browserslist`
- `.>next>styled-jsx>@babel/core>@babel/helper-compilation-targets>browserslist`
- `.>react-server-dom-webpack>webpack>browserslist`
- `.>vinext>@unpic/react>next>styled-jsx>@babel/core>@babel/helper-compilation-targets>browserslist`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>browserslist`
- `.>vinext>react-server-dom-webpack>webpack>browserslist`

<a id="paths-5"></a>
### esbuild

Build/development tooling; not bundled.

- `.>@cloudflare/vite-plugin>vite>esbuild`
- `.>@cloudflare/vite-plugin>vite>tsx>esbuild`
- `.>@cloudflare/vite-plugin>wrangler>esbuild`
- `.>@vitejs/plugin-react>vite>esbuild`
- `.>@vitejs/plugin-react>vite>tsx>esbuild`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>esbuild`
- `.>@vitejs/plugin-rsc>vite>esbuild`
- `.>@vitejs/plugin-rsc>vite>tsx>esbuild`
- `.>@vitejs/plugin-rsc>vitefu>vite>esbuild`
- `.>@vitejs/plugin-rsc>vitefu>vite>tsx>esbuild`
- `.>drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils>esbuild`
- `.>drizzle-kit>tsx>esbuild`
- `.>react-server-dom-webpack>webpack>terser-webpack-plugin>esbuild`
- `.>vinext>@vitejs/plugin-react>vite>esbuild`
- `.>vinext>@vitejs/plugin-react>vite>tsx>esbuild`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>esbuild`
- `.>vinext>@vitejs/plugin-rsc>vite>esbuild`
- `.>vinext>@vitejs/plugin-rsc>vite>tsx>esbuild`
- `.>vinext>@vitejs/plugin-rsc>vitefu>vite>esbuild`
- `.>vinext>@vitejs/plugin-rsc>vitefu>vite>tsx>esbuild`
- `.>vinext>react-server-dom-webpack>webpack>terser-webpack-plugin>esbuild`
- `.>vinext>vite>esbuild`
- `.>vinext>vite>tsx>esbuild`
- `.>vite>esbuild`
- `.>vite>tsx>esbuild`
- `.>wrangler>esbuild`

<a id="paths-6"></a>
### fast-uri

Build schema validation / unused resolver integrations; not bundled.

- `.>@hookform/resolvers>ajv-formats>ajv>fast-uri`
- `.>@hookform/resolvers>ajv>fast-uri`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>schema-utils>ajv-formats>ajv>fast-uri`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>schema-utils>ajv>fast-uri`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-formats>ajv>fast-uri`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv>fast-uri`
- `.>react-server-dom-webpack>webpack>schema-utils>ajv-formats>ajv>fast-uri`
- `.>react-server-dom-webpack>webpack>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>react-server-dom-webpack>webpack>schema-utils>ajv>fast-uri`
- `.>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-formats>ajv>fast-uri`
- `.>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv>fast-uri`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>schema-utils>ajv-formats>ajv>fast-uri`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>schema-utils>ajv>fast-uri`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-formats>ajv>fast-uri`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv>fast-uri`
- `.>vinext>react-server-dom-webpack>webpack>schema-utils>ajv-formats>ajv>fast-uri`
- `.>vinext>react-server-dom-webpack>webpack>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>vinext>react-server-dom-webpack>webpack>schema-utils>ajv>fast-uri`
- `.>vinext>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-formats>ajv>fast-uri`
- `.>vinext>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv-keywords>ajv>fast-uri`
- `.>vinext>react-server-dom-webpack>webpack>terser-webpack-plugin>schema-utils>ajv>fast-uri`

<a id="paths-7"></a>
### fflate

Unused OG/font generator; not bundled.

- `.>vinext>@vercel/og>satori>@shuding/opentype.js>fflate`

<a id="paths-8"></a>
### image-size

Unused image helper/build tooling; not bundled.

- `.>vinext>image-size`

<a id="paths-9"></a>
### js-yaml

Lint configuration only; not bundled.

- `.>eslint-config-next>@next/eslint-plugin-next>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>@typescript-eslint/parser>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint-module-utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint-plugin-import>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-import-resolver-typescript>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-import>@typescript-eslint/parser>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>@typescript-eslint/parser>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint-import-resolver-typescript>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-import>eslint-module-utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-import>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-jsx-a11y>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-react-hooks>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint-plugin-react>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/parser>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>@typescript-eslint/utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/type-utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>@typescript-eslint/utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/eslint-plugin>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/parser>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>@eslint-community/eslint-utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>@typescript-eslint/utils>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint-config-next>typescript-eslint>eslint>@eslint/eslintrc>js-yaml`
- `.>eslint>@eslint/eslintrc>js-yaml`

<a id="paths-10"></a>
### next

Next server unused; type/config/lint/peer only; not bundled.

- `.>next`
- `.>vinext>@unpic/react>next`

<a id="paths-11"></a>
### react-server-dom-webpack

Deployed Worker and hosting browser runtime; patched.

- `.>@vitejs/plugin-rsc>react-server-dom-webpack`
- `.>react-server-dom-webpack`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack`
- `.>vinext>react-server-dom-webpack`

<a id="paths-12"></a>
### satori

Unused OG generator; not bundled.

- `.>vinext>@vercel/og>satori`

<a id="paths-13"></a>
### sharp

Local image simulation / unused Next/OG path; not bundled.

- `.>@cloudflare/vite-plugin>miniflare>sharp`
- `.>@cloudflare/vite-plugin>wrangler>miniflare>sharp`
- `.>next>sharp`
- `.>vinext>@unpic/react>next>sharp`
- `.>wrangler>miniflare>sharp`

<a id="paths-14"></a>
### source-map-js

Build CSS/source maps; not bundled.

- `.>@cloudflare/vite-plugin>vite>postcss>source-map-js`
- `.>@tailwindcss/postcss>@tailwindcss/node>source-map-js`
- `.>@tailwindcss/postcss>postcss>source-map-js`
- `.>@vitejs/plugin-react>vite>postcss>source-map-js`
- `.>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>postcss>source-map-js`
- `.>@vitejs/plugin-rsc>vite>postcss>source-map-js`
- `.>@vitejs/plugin-rsc>vitefu>vite>postcss>source-map-js`
- `.>next>postcss>source-map-js`
- `.>react-server-dom-webpack>webpack>terser-webpack-plugin>postcss>source-map-js`
- `.>vinext>@unpic/react>next>postcss>source-map-js`
- `.>vinext>@vitejs/plugin-react>vite>postcss>source-map-js`
- `.>vinext>@vitejs/plugin-rsc>react-server-dom-webpack>webpack>terser-webpack-plugin>postcss>source-map-js`
- `.>vinext>@vitejs/plugin-rsc>vite>postcss>source-map-js`
- `.>vinext>@vitejs/plugin-rsc>vitefu>vite>postcss>source-map-js`
- `.>vinext>react-server-dom-webpack>webpack>terser-webpack-plugin>postcss>source-map-js`
- `.>vinext>vite>postcss>source-map-js`
- `.>vite>postcss>source-map-js`

<a id="paths-15"></a>
### undici

Local Miniflare runtime; not bundled.

- `.>@cloudflare/vite-plugin>miniflare>undici`
- `.>@cloudflare/vite-plugin>wrangler>miniflare>undici`
- `.>wrangler>miniflare>undici`

<a id="paths-16"></a>
### vite

Build/development server only; not bundled.

- `.>@cloudflare/vite-plugin>vite`
- `.>@vitejs/plugin-react>vite`
- `.>@vitejs/plugin-rsc>vite`
- `.>@vitejs/plugin-rsc>vitefu>vite`
- `.>vinext>@vitejs/plugin-react>vite`
- `.>vinext>@vitejs/plugin-rsc>vite`
- `.>vinext>@vitejs/plugin-rsc>vitefu>vite`
- `.>vinext>vite`
- `.>vite`

<a id="paths-17"></a>
### ws

Local preview sockets only; not bundled.

- `.>@cloudflare/vite-plugin>miniflare>ws`
- `.>@cloudflare/vite-plugin>wrangler>miniflare>ws`
- `.>@cloudflare/vite-plugin>ws`
- `.>wrangler>miniflare>ws`

<a id="paths-18"></a>
### zod

Preview validation/lint/unused scaffold; not bundled.

- `.>@hookform/resolvers>zod`
- `.>eslint-config-next>eslint-plugin-react-hooks>zod`
- `.>eslint-config-next>eslint-plugin-react-hooks>zod-validation-error>zod`
- `.>zod`

## Remaining advisory, exact current path

| Field | Finding |
| --- | --- |
| Advisory | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| Installed vulnerable version | esbuild 0.18.20 |
| Path | `hosting > drizzle-kit@0.31.11 > @esbuild-kit/esm-loader@2.6.5 > @esbuild-kit/core-utils@3.3.2 > esbuild@0.18.20` |
| Classification | Development-only schema-generation loader; absent from Worker/browser module manifests |
| Reachability | Not reachable in the inspected deployed artifact. Requires starting that old esbuild serve API, which MFD does not invoke. |
| Patched version | >=0.25.0; root build already uses 0.28.2. The loader pins ~0.18.20, so a forced upgrade would cross its supported range. |
| Mitigation | Do not start the old esbuild serve API. Keep schema tooling off deployed bundles and public listeners. Watch upstream replacement of the deprecated loader. |
| Residual risk | Package remains vulnerable if future tooling starts its dev server. Supply-chain/development exposure remains; audit continues to report it. Removing/changing the schema tool or forcing a 0.x API jump is deferred. |
