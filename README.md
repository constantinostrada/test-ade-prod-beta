# linkdoc

Finds broken links in a repository's markdown: relative paths to files that
were moved or renamed, links to headings that no longer exist, and external
URLs that have died. It exits non-zero when something is broken, so it can
fail a CI build.

## Installation

Requires Node.js 20 or newer.

```sh
npm install
npm run build
npm link          # optional: puts `linkdoc` on your PATH
```

Without `npm link`, run it as `node dist/src/cli.js [path]`.

## Usage

```
linkdoc [path]
```

| Argument | Meaning |
| --- | --- |
| `path` | Directory to check. Optional; defaults to the current directory. If it doesn't exist or isn't a directory, linkdoc prints an error and exits `2`. |

`linkdoc --help` prints the usage.

linkdoc walks `path` recursively for `.md` files, skipping every
`node_modules`, `.git` and `dist` directory at any depth. In each file it
reads:

- inline links and images: `[text](target)`, `![alt](target)`
- reference definitions: `[label]: target`
- autolinks: `<https://example.com>`

Links inside fenced code blocks and inline code spans are ignored.

Each target is then checked:

| Target | Check |
| --- | --- |
| `./file.md`, `../dir/`, `img.png` | Resolved against the directory of the file that contains the link. The file or directory must exist. |
| `/docs/file.md` | Resolved against the checked `path`. |
| `./file.md#section`, `#section` | The file must exist **and** contain a heading whose GitHub-style anchor is `section`. Duplicate headings get `-1`, `-2`, … suffixes, so `#usage-1` is the second `## Usage`. Anchors on non-markdown files (`src/a.ts#L10`) are not checked. |
| `http://…`, `https://…` | Requested with `GET`, at most 8 at a time, with a 5-second timeout each. Each distinct URL is requested once per run and later occurrences reuse the result. |
| `mailto:`, `tel:` and other schemes | Skipped. |

## Example output

```
$ linkdoc
BROKEN       docs/guide.md:2  ../README.md#configuration  (anchor #configuration not found in README.md)
BROKEN       docs/guide.md:3  ./api-v1.md  (file not found: docs/api-v1.md)
BROKEN       docs/guide.md:4  https://example.com/spec  (HTTP 404)
UNREACHABLE  docs/guide.md:4  https://mirror.example.org/spec  (timeout after 5s)

2 files scanned, 6 links checked: 3 broken, 1 unreachable
$ echo $?
1
```

Each finding shows the file (relative to the checked path), the line, the
target exactly as written, and what went wrong. The last line is the summary.
Possible reasons:

| Status | Reason | Meaning |
| --- | --- | --- |
| `BROKEN` | `file not found: <path>` | The relative target doesn't exist. |
| `BROKEN` | `anchor #x not found in <file>` | The file exists, but no heading has that anchor. |
| `BROKEN` | `HTTP <status>` | The server answered with an error status (e.g. 404, 410, 500). |
| `BROKEN` | `invalid URL` | The http(s) target can't be parsed as a URL. |
| `UNREACHABLE` | `timeout after 5s` | No response within 5 seconds. |
| `UNREACHABLE` | `DNS lookup failed (…)`, `connection refused (…)`, `connection reset (…)`, `network error (…)` | The request failed before an HTTP response arrived. |
| `UNREACHABLE` | `HTTP 429 (rate limited)` | The server is throttling requests. |

### Broken vs. unreachable

- **Broken** means the link itself is wrong: the file, heading or page is
  gone. Fix the link. Broken links make linkdoc exit `1`.
- **Unreachable** means linkdoc couldn't get an answer: the host is slow or
  down, DNS failed, the connection was refused, or the server is rate limiting.
  The link may be fine. Check the host or network, or try again later.
  Unreachable links are reported but **do not** change the exit code, so a
  flaky host doesn't fail your build.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No broken links. There may still be unreachable links. |
| `1` | At least one broken link. |
| `2` | Invalid usage, or `path` is missing or not a directory. |

## CI

```yaml
- run: npm ci && npm run build
- run: node dist/src/cli.js .
```

## Development

```sh
npm test               # build + all tests (HTTP tests use a local server on 127.0.0.1)
npm run test:offline   # parser and resolver suites only; no network access needed
```

Tests use Node's built-in `node:test`. TypeScript is the only build dependency.
