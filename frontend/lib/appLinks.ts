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

/** iPhone/iPad. iPadOS reports a Mac user agent, so a touch screen on "Macintosh" counts as iPad. */
export function isIOS(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function appHref(link: AppLink, userAgent: string): string {
  if (!isAndroid(userAgent)) return link.web;
  const url = new URL(link.android ?? link.web);
  const scheme = url.protocol.replace(':', '');
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=${link.androidPackage};S.browser_fallback_url=${encodeURIComponent(link.web)};end`;
}

// Anchor attributes for an app link. Android intent links stay in this tab: a new tab would be left empty once
// the app opens. Everything else opens in a new tab so MFD stays open behind it.
export function appLinkProps(link: AppLink, userAgent: string): { href: string; target?: string; rel: string } {
  const href = appHref(link, userAgent);
  return href.startsWith('intent:') ? { href, rel: 'noopener noreferrer' } : { href, target: '_blank', rel: 'noopener noreferrer' };
}
