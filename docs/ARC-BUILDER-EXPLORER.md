# Arc Project Explorer MVP

Predarc's Arc Project Explorer is a public GitHub discovery surface. It helps a
user find observable project evidence without turning those signals into an
official Arc status or a project ranking.

## MVP flow

1. The landing-page form accepts a project name, `@GitHubUsername`,
   `owner/repository` or GitHub URL.
2. The browser passes the query to `/builders` through short-lived
   `sessionStorage`, so it is not placed in the page URL.
3. `/api/builder-explorer` validates the request origin and query.
4. GitHub's public REST API is used to resolve an exact public identity and
   collect public profile, repository, recent public event, merged pull-request
   and issue data.
5. Predarc does not persist the query server-side, request private GitHub data
   or calculate a project score. The Explorer page clears the transfer value
   from `sessionStorage` immediately after reading it.

No Supabase migration is required for this MVP.

## What the MVP can show

- Public GitHub identity and profile link.
- Repositories carrying explicit Arc/Circle evidence.
- Authored merged pull requests and issues in recognized Arc repositories.
- Recent commits visible in GitHub's public event window.
- Fix-related commit-message signals.
- Source notes and observation time.

The recent commit number is deliberately labelled as a recent public-event
signal. It is not presented as a lifetime commit total.

External contributions are accepted only when the repository is recognized by
an explicit evidence rule. The MVP currently recognizes `circlefin/arc-node`
directly, so merged Arc Node pull requests and authored issues can appear even
when the repository is not owned by the searched GitHub user.

## GitHub API configuration

The MVP works with GitHub's unauthenticated public API allowance. A server-only
`PREDARC_GITHUB_TOKEN` or `GITHUB_TOKEN` may be added later to increase API
capacity. It must never use a `NEXT_PUBLIC_` prefix or be returned to the
browser.

## Security and privacy controls

- POST-only search keeps queries out of route URLs.
- Configured-origin validation runs before any GitHub request.
- Queries are limited to 120 characters.
- Contribution searches use the resolved GitHub login and return source links.
- External links are restricted to HTTPS GitHub URLs.
- No private GitHub data is requested.
- No ranking, reputation score or official-role inference is produced.
