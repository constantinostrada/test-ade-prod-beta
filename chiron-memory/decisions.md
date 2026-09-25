# decision

A choice made and the reasoning behind it — the path taken over the alternatives.

## URL checks use a single GET, never HEAD then GET

What: HttpChecker sends one GET per distinct URL (fragment stripped) and cancels the body unread · Why: many servers answer HEAD wrongly, and a HEAD→GET fallback would send two requests, breaking the "each URL requested at most once per run" guarantee · Where: src/http.ts

## Broken vs unreachable classification for external links

What: HTTP status >= 400 is broken (affects exit code) except 429, which is unreachable along with timeouts and network errors (DNS, refused, reset); unreachable never fails the run · Why: broken means the link must be fixed; unreachable is a host/network problem that needs a different fix and would make CI flaky · Where: src/http.ts
