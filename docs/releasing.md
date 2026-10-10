# Releasing

This project uses [release-please](https://github.com/googleapis/release-please) to automate releases. It generates changelogs, creates GitHub releases, and manages semantic versioning based on [Conventional Commits](https://www.conventionalcommits.org/).

## How It Works

1. **Push commits to `main`** - Each push triggers the release-please workflow
2. **Release PR created/updated** - release-please opens a PR that accumulates all conventional commits since the last release
3. **Merge the Release PR** - This triggers:
   - Git tag creation (e.g., `v1.2.0`)
   - GitHub Release with changelog
   - `package.json` version bump
   - `CHANGELOG.md` update

## Conventional Commits

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types and Version Bumps

| Type | Description | Version Bump | Changelog Section |
|------|-------------|--------------|-------------------|
| `feat:` | New feature | Minor (1.x.0) | Features |
| `fix:` | Bug fix | Patch (1.0.x) | Bug Fixes |
| `perf:` | Performance improvement | Patch | Performance Improvements |
| `docs:` | Documentation only | Patch | Documentation |
| `chore:` | Maintenance tasks | Patch | Miscellaneous |
| `refactor:` | Code refactoring | Patch | Code Refactoring |
| `test:` | Adding/updating tests | Patch | Tests |
| `ci:` | CI/CD changes | Patch | CI/CD |
| `blog:` | Blog content | Patch | Blog |

### Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```bash
# Using ! notation
feat!: remove deprecated API endpoints

# Using footer
feat: redesign voting system

BREAKING CHANGE: Vote format changed from string to object
```

Breaking changes trigger a **major** version bump (x.0.0).

### Examples

```bash
# Feature (minor bump)
feat: add CSV export for issues

# Bug fix (patch bump)
fix: correct vote count calculation

# With scope
feat(canvas): add drag-and-drop for nodes

# Breaking change (major bump)
feat!: change room URL format

# Chore (patch bump)
chore(deps): bump next from 15.0.0 to 15.1.0
```

## Configuration Files

| File | Purpose |
|------|---------|
| `.github/workflows/release-please.yml` | GitHub Actions workflow |
| `release-please-config.json` | Release-please configuration |
| `.release-please-manifest.json` | Current version tracking |

## Deployment Relationship

### Vercel (Frontend)
- **Deploys on every push to `main`** - independent of releases
- Releases serve as version markers in git history
- No deployment changes needed for releases

### Convex (Backend)
- **Deploys manually**: run `npx convex deploy` from an up-to-date `main` after merging backend changes. That includes dependency updates, because a Convex component's code ships inside the deploy.
- The command asks before it pushes to the production deployment; answer in the terminal that runs it.
- Not tied to release versioning

## Viewing Releases

- **GitHub Releases**: [Releases page](../../releases)
- **Changelog**: [CHANGELOG.md](../CHANGELOG.md)
- **Git tags**: `git tag -l` or view on GitHub

## Troubleshooting

### Release PR not created
- Verify commits follow conventional format
- Check workflow ran in Actions tab
- Ensure commits are on `main` branch

### Version not bumping as expected
- `feat:` = minor, `fix:` = patch
- Breaking changes need `!` or `BREAKING CHANGE:` footer
- Check release-please-config.json for custom settings

### Workflow permissions error
- Verify repository has Actions enabled
- Check `GITHUB_TOKEN` permissions in workflow file

## First Release Setup

After the initial release-please files are merged:

1. Workflow creates Release PR titled `chore(main): release 1.0.0`
2. Review the PR - it contains `CHANGELOG.md` and `package.json` updates
3. Merge the Release PR
4. GitHub Release and tag `v1.0.0` are created automatically
5. **Post-release cleanup**: Remove `bootstrap-sha` and `release-as` from `release-please-config.json`

## Manual Release (Emergency Only)

If automated release fails, you can manually create a release:

```bash
# Tag the release
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# Create GitHub release via CLI
gh release create v1.2.3 --generate-notes
```

## References

- [release-please](https://github.com/googleapis/release-please)
- [release-please-action](https://github.com/googleapis/release-please-action)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
