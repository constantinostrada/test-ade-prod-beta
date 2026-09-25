# convention

A rule the codebase follows — naming, patterns, and where things live.

## Test fixtures are generated in temp dirs, not committed

What: Tests build fixture repos with makeTree() in os.tmpdir() instead of checking fixture files into the repo · Why: fixtures must contain node_modules/, dist/ and .git/ directories, which .gitignore and git itself would drop · Where: test/helpers.ts
