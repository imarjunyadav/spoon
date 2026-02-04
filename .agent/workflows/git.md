---
description: Commit and push changes to GitHub
---

# Git Commit & Push

## Quick Commit & Push
### 1. Check Status
// turbo
```bash
git status
```

### 2. Stage All Changes
// turbo
```bash
git add -A
```

### 3. Commit with Message
```bash
git commit -m "YOUR_COMMIT_MESSAGE"
```

### 4. Push to Main
```bash
git push origin main
```

## Commit Message Guidelines
- `feat: Add new feature` - New functionality
- `fix: Fix bug description` - Bug fixes
- `refactor: Improve code structure` - Code changes without behavior change
- `docs: Update documentation` - Documentation only
- `style: Format code` - Formatting, no code change
- `chore: Update dependencies` - Maintenance tasks

## Undo Last Commit (Not Pushed)
```bash
git reset --soft HEAD~1
```

## View Recent Commits
// turbo
```bash
git log -n 5 --oneline
```
