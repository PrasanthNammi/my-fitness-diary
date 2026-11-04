// Links that open an installed app (ChatGPT, Claude) and fall back to its website.
// - Android: Chrome's intent: link names the app package, so the app opens if installed; otherwise
//   Chrome follows browser_fallback_url. Chrome only allows "browsable" app screens, so the target
//   page must be one the app handles; if it isn't, the website opens, as with a plain link.
// - iPhone and desktop: a plain https link. iOS opens the app only for pages the app has claimed in
//   the site's /.well-known/apple-app-site-association, so `web` should be one of those pages.
// `web`: the page opened on iPhone/desktop, and the website fallback on Android when the app isn't installed.
// `android`: optional page for the Android app when it doesn't accept `web` (the apps claim different pages per platform).
export interface AppLink { web: string; androidPackage: string; android?: string }

export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

export function appHref(link: AppLink, userAgent: string): string {
  if (!isAndroid(userAgent)) return link.web;
  const url = new URL(link.android ?? link.web);
  const scheme = url.protocol.replace(':', '');
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=${link.androidPackage};S.browser_fallback_url=${encodeURIComponent(link.web)};end`;
}
