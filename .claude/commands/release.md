Create a release branch, publish to npm via CI, then merge to main.

1. Run `bun test ./tests/index.ts` and stop if any tests fail.

2. Ask the user for the new version (patch / minor / major or explicit semver).
   Show the unreleased commits for context:
   `git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline`

3. Update `"version"` in `package.json` to the new version.

4. Fetch the latest main and create a release branch from it:
   ```
   git fetch origin main
   git checkout -b release/<version> origin/main
   ```

5. Stage all changes and commit:
   `git add -A && git commit -m "chore: release v<version>"`

6. Push the branch:
   `git push -u origin release/<version>`

7. Tell the user that the `publish` workflow will now run on GitHub Actions:
   - It verifies the branch name matches `package.json` version.
   - It runs tests, publishes to npm, creates a git tag, and opens a GitHub release.
   - The NPM_TOKEN secret must be set in repo Settings → Secrets → Actions.

8. Once the workflow passes (user confirms), create a PR and merge it to main:
   ```
   gh pr create --title "chore: release v<version>" --body "Release v<version>" --base main --head release/<version>
   gh pr merge --merge --delete-branch
   ```

9. Switch back to main and pull:
   ```
   git checkout main
   git pull
   ```
