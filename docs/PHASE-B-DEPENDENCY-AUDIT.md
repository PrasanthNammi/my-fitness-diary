# Phase B dependency advisory inventory

2026-10-27. Registry audit of the existing frozen hosting lockfile; versions were not upgraded. These are dependency matches, not proof that each vulnerable code path is reachable in the deployed Vinext Worker.

Hosting: **79 advisories: 3 critical, 32 high, 33 moderate, 11 low**. Root npm audit: **0 advisories**. Deployment recommendation: blocked until remediation and reachability review.

| Severity | Package | Installed version(s) | Patched range reported by registry | Advisory |
| --- | --- | --- | --- | --- |
| critical | next | 16.3.4 | >=16.3.6 | [Next.js: Remote Code Execution in next/og ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) |
| critical | next | 16.3.4 | >=16.4.1 | [Next.js: Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used](https://github.com/advisories/GHSA-2464-fhr4-w9xw) |
| critical | next | 16.3.4 | >=16.4.1 | [Next.js: Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays](https://github.com/advisories/GHSA-673q-mjm6-r5xr) |
| high | brace-expansion | 1.1.14 | >=1.1.16 | [brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) |
| high | brace-expansion | 5.0.6 | >=5.0.7 | [brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) |
| high | brace-expansion | 1.1.14 | >=1.1.17 | [brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash](https://github.com/advisories/GHSA-mh99-v99m-4gvg) |
| high | brace-expansion | 5.0.6 | >=5.0.8 | [brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash](https://github.com/advisories/GHSA-mh99-v99m-4gvg) |
| high | brace-expansion | 5.0.6 | >=5.0.9 | [brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation](https://github.com/advisories/GHSA-rgw5-rvv9-x895) |
| high | brace-expansion | 1.1.14 | >=1.1.18 | [brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation](https://github.com/advisories/GHSA-rgw5-rvv9-x895) |
| high | brace-expansion | 1.1.14 | >=1.1.20 | [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| high | brace-expansion | 5.0.6 | >=5.0.11 | [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| high | brace-expansion | 1.1.14 | >=1.1.19 | [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| high | brace-expansion | 5.0.6 | >=5.0.10 | [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| high | browserslist | 4.28.2 | >=4.28.7 | [Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) |
| high | browserslist | 4.28.2 | >=4.28.7 | [Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats)](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| high | image-size | 2.0.2 | >=2.0.3 | [image-size: JXL and HEIF parsers allow denial of service through infinite loops](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) |
| high | image-size | 2.0.2 | >=2.0.3 | [image-size: ICNS parser allows denial of service through an infinite loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) |
| high | js-yaml | 4.1.1 | >=4.3.0 | [js-yaml: YAML merge-key chains can force quadratic CPU consumption](https://github.com/advisories/GHSA-52cp-r559-cp3m) |
| high | js-yaml | 4.1.1 | >=4.3.1 | [JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) |
| high | js-yaml | 4.1.1 | >=4.3.2 | [js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources](https://github.com/advisories/GHSA-2883-xcg3-v3hh) |
| high | next | 16.3.4 | >=16.3.8 | [Next.js has Server-Side Request Forgery in Image Optimization](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) |
| high | next | 16.3.4 | >=16.4.1 | [Next.js: Denial of Service in App Router using Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) |
| high | react-server-dom-webpack | 19.2.6 | >=19.2.8 | [react-server-dom: Denial of Service in Server Functions](https://github.com/advisories/GHSA-wx67-qw84-cm4g) |
| high | sharp | 0.35.4 | >=0.35.5 | [sharp : Vulnerability in librsvg dependency CVE-2026-96889](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| high | source-map-js | 1.2.1 | >=1.2.2 | [source-map-js allows event-loop denial of service through indexed source-map section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| high | undici | 7.24.8 | >=7.28.0 | [undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent](https://github.com/advisories/GHSA-vmh5-mc38-953g) |
| high | undici | 7.24.8 | >=7.28.0 | [undici WebSocket client vulnerable to denial of service via fragment count bypass](https://github.com/advisories/GHSA-vxpw-j846-p89q) |
| high | undici | 7.24.8 | >=7.28.0 | [undici vulnerable to cross-origin request routing via SOCKS5 proxy pool reuse](https://github.com/advisories/GHSA-hm92-r4w5-c3mj) |
| high | undici | 7.24.8 | >=7.29.0 | [undici vulnerable to cross-user information disclosure and parse-time crash via degenerate private cache directives](https://github.com/advisories/GHSA-4cwx-7wf7-3272) |
| high | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to Denial of Service via unrequested WebSocket subprotocol](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) |
| high | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to TLS certificate validation bypass via dropped connect options in BalancedPool](https://github.com/advisories/GHSA-w293-vg96-wgc3) |
| high | undici | 7.24.8 | >=7.30.1 | [undici vulnerable to Denial of Service via unhandled error on excessive content-encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c) |
| high | vite | 8.0.13 | >=8.1.6 | [launch-editor: `fs.existsSync()` existence check can be bypassed on Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm) |
| high | ws | 8.18.0 | >=8.21.0 | [ws: Memory exhaustion DoS from tiny fragments and data chunks](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) |
| high | zod | 3.25.76 | >=4.6.6 | [Zod can exhaust memory while validating oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| moderate | baseline-browser-mapping | 2.10.30 | >=2.11.0 | [baseline-browser-mapping process termination on invalid input causes denial of service](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| moderate | brace-expansion | 1.1.14 | >=1.1.21 | [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) |
| moderate | brace-expansion | 5.0.6 | >=5.0.12 | [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) |
| moderate | esbuild | 0.18.20 | >=0.25.0 | [esbuild enables any website to send any requests to the development server and read the response](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| moderate | fast-uri | 3.1.7 | >=3.1.8 | [fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj) |
| moderate | fast-uri | 3.1.7 | >=3.1.9 | [fast-uri vulnerable to URI scheme spoofing via percent-encoded scheme decoding](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) |
| moderate | fast-uri | 3.1.7 | >=3.1.9 | [fast-uri vulnerable to host confusion via unchecked WHATWG host canonicalization](https://github.com/advisories/GHSA-wjr9-j795-jxcr) |
| moderate | fflate | 0.7.4 | >=0.7.5 | [fflate unzipSync can enter an infinite loop when parsing malformed ZIP64 archives](https://github.com/advisories/GHSA-px8p-9vwx-vf98) |
| moderate | js-yaml | 4.1.1 | >=4.2.0 | [JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases](https://github.com/advisories/GHSA-h67p-54hq-rp68) |
| moderate | next | 16.3.4 | >=16.3.8 | [Next.js: Pending `use cache` fill can leak Draft Mode content into regular responses and persisted pages](https://github.com/advisories/GHSA-3w37-wq28-93x7) |
| moderate | next | 16.3.4 | >=16.3.8 | [Next.js has cache poisoning of SSG and ISR pages in self-hosted applications](https://github.com/advisories/GHSA-4jqv-mc3x-m676) |
| moderate | next | 16.3.4 | >=16.3.8 | [Next.js has information disclosure in App Router metadata image routes via dynamicParams bypass](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) |
| moderate | next | 16.3.4 | >=16.3.8 | [Next.js has cache poisoning in SSG/ISR rendering that leads to cross-user content substitution and persistent denial of service](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) |
| moderate | next | 16.3.4 | >=16.3.8 | [next.js cache leak across root param values in nested 'use cache' functions](https://github.com/advisories/GHSA-h694-7cp9-m8p3) |
| moderate | satori | 0.16.0 | >=0.33.5 | [Satori-generated SVG has improper escaping](https://github.com/advisories/GHSA-wx4j-mvgx-mqwp) |
| moderate | undici | 7.24.8 | >=7.28.0 | [undici vulnerable to HTTP header injection via Set-Cookie percent-decoding](https://github.com/advisories/GHSA-p88m-4jfj-68fv) |
| moderate | undici | 7.24.8 | >=7.28.0 | [undici vulnerable to cross-user information disclosure via shared cache whitespace bypass](https://github.com/advisories/GHSA-pr7r-676h-xcf6) |
| moderate | undici | 7.24.8 | >=7.29.0 | [undici vulnerable to downstream response desynchronization via retry interceptor](https://github.com/advisories/GHSA-8xcm-r25x-g524) |
| moderate | undici | 7.24.8 | >=7.29.0 | [undici vulnerable to CRLF Injection via blob-like body 'type' property](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) |
| moderate | undici | 7.24.8 | >=7.29.0 | [undici vulnerable to cross-user information disclosure via whitespace around equals in Cache-Control directives](https://github.com/advisories/GHSA-jr45-8vmc-qm54) |
| moderate | undici | 7.24.8 | >=7.29.0 | [undici vulnerable to cookie attribute injection via unsanitized domain and unparsed setCookie fields](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) |
| moderate | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to Denial of Service via orphaned RetryHandler response body](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) |
| moderate | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to Denial of Service via unbounded decompression of compressed responses](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) |
| moderate | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to cross-user cookie disclosure via Set-Cookie caching in shared caches](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) |
| moderate | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to Denial of Service via WebSocketStream unclean close](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) |
| moderate | undici | 7.24.8 | >=7.30.1 | [undici vulnerable to Denial of Service via unbounded memory in the EventSource parser](https://github.com/advisories/GHSA-4qv8-2p9j-2685) |
| moderate | undici | 7.24.8 | >=7.30.1 | [undici vulnerable to Subresource Integrity bypass via non-lowercase algorithm tokens](https://github.com/advisories/GHSA-f72v-6w45-q472) |
| moderate | vite | 8.0.13 | >=8.0.16 | [launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) |
| moderate | vite | 8.0.13 | >=8.1.6 | [launch-editor: escapeCmdArgs() omits % escaping on Windows](https://github.com/advisories/GHSA-698v-4r3x-3vcv) |
| moderate | vite | 8.0.13 | >=8.1.6 | [launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors](https://github.com/advisories/GHSA-r825-w8mm-5pxw) |
| moderate | vite | 8.0.13 | >=8.1.6 | [Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) |
| moderate | vite | 8.0.13 | >=8.0.16 | [vite: `server.fs.deny` bypass on Windows alternate paths](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
| moderate | ws | 8.18.0 | >=8.20.1 | [ws: Uninitialized memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) |
| low | @babel/core | 7.29.0 | >=7.29.6 | [@babel/core: Arbitrary File Read via sourceMappingURL Comment](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| low | esbuild | 0.27.3, 0.28.0 | >=0.28.1 | [esbuild allows arbitrary file read when running the development server on Windows](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) |
| low | fast-uri | 3.1.7 | >=3.1.9 | [fast-uri vulnerable to improper path equivalence in relative reference normalization](https://github.com/advisories/GHSA-xhq7-xmqj-769h) |
| low | fast-uri | 3.1.7 | >=3.1.9 | [fast-uri vulnerable to scheme injection via an unescaped first-segment colon in suffix references](https://github.com/advisories/GHSA-333x-w4r6-6crp) |
| low | next | 16.3.4 | >=16.3.8 | [Next.js has information disclosure in development server's Model Context Protocol endpoint](https://github.com/advisories/GHSA-39w2-rjm5-chcv) |
| low | undici | 7.24.8 | >=7.28.0 | [undici vulnerable to Set-Cookie SameSite attribute downgrade via permissive substring matching](https://github.com/advisories/GHSA-g8m3-5g58-fq7m) |
| low | undici | 7.24.8 | >=7.28.0 | [undici vulnerable to HTTP response queue poisoning via keep-alive socket reuse](https://github.com/advisories/GHSA-35p6-xmwp-9g52) |
| low | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to downstream response splitting via retry interceptor](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) |
| low | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to response truncation via oversized chunked responses in the dump interceptor](https://github.com/advisories/GHSA-2gqq-gqf2-x968) |
| low | undici | 7.24.8 | >=7.29.1 | [undici vulnerable to caching and replay of unsafe HTTP method responses](https://github.com/advisories/GHSA-8436-99hf-9mmv) |
| low | vite | 8.0.13 | >=8.1.6 | [Vite: Cross origin script execution through Vite custom middleware](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) |
