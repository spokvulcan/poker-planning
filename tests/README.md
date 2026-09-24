# E2E Testing Guide

## Overview

This directory contains end-to-end tests for the AgileKit application using Playwright.

## Structure

```
tests/
├── fixtures/         # Custom test fixtures and configuration
├── pages/           # Page Object Models
├── retro/           # Retro whiteboard specs and the manual checklist
├── utils/           # Test utilities and helpers
└── *.spec.ts       # Test specifications
```

## Improvements Implemented

### 1. Page Object Model Pattern
- Created `HomePage` class in `pages/home-page.ts`
- Encapsulates page interactions and selectors
- Provides reusable methods for common actions

### 2. Test Utilities
- `waitForAnimations()` - Waits for CSS animations to complete
- `waitForElement()` - Enhanced element waiting with visibility checks
- `mockClipboardAPI()` - Proper clipboard mocking with error simulation
- `retryAction()` - Retry mechanism with exponential backoff
- `safeClick()` - Click with built-in wait strategies

### 3. Data Test Attributes
Added `data-testid` attributes to key components:
- `hero-start-button` - Hero CTA *Start estimating* → `/room/new`
- `hero-retro-button` - Hero CTA *Start a retro* → `/retro/new`
- `toolkit-card-poker`, `toolkit-card-retro` - The two cards under the hero
- `how-it-works-tab-poker`, `how-it-works-tab-retro`, `app-preview-tab-poker`, `app-preview-tab-retro` - Per-ceremony tabs
- `hero-github-link` - GitHub repository link
- `trust-free`, `trust-no-account`, `trust-realtime` - Trust indicators
- `retro-board`, `retro-node` - The retro's canvas and its retro node, both carrying `data-step` (`write`, `vote`, `discuss`, `done`)
- `retro-pad`, `retro-sticky` - A column's pad and a sticky; a sticky carries `data-hidden` (face-down to this viewer), `data-mine` and `data-focused` (in the spotlight)
- `retro-actions`, `retro-action-item` - The action items node and each item in it
- `gif-picker`, `retro-settings-panel`, `retro-column-row`, `votes-per-person` - The GIF picker and the retro's settings
- `retro-retention-note` - The line on `/retro/new` saying whether the retro will be kept
- `retro-list`, `retro-card` - The retros list on `/dashboard/retros`

### 4. Enhanced Configuration
Updated `playwright.config.ts` with:
- Better timeout settings
- Video/screenshot capture on failure
- Environment-specific configurations
- Improved reporter settings

### 5. Custom Test Fixtures
Created reusable fixtures for:
- Automatic page setup
- Animation disabling
- Request/response logging
- Default timeout configuration

## Retro

The retro's rules are proven below the browser; Playwright keeps only what needs two browsers on one deployment.

| Layer | Where | What it proves |
|-------|-------|----------------|
| Convex (`convex-test`) | `convex/retro.test.ts`, `convex/retroRules.test.ts`, `convex/retention.test.ts`, `convex/accountDeletion.test.ts`, `convex/roomActivity.test.ts`, `convex/requireRoomReader.test.ts` | The face-down projection, stacks, votes, the discussion order, permissions, action items, the next retro, retention, account linking and deletion, the activity clock |
| Node | `src/components/retro/build-retro-nodes.test.ts`, `src/components/retro/retro-summary.test.ts` | What the board draws in each step; the Markdown summary |
| Playwright | `tests/retro/retro-board.spec.ts` | Two browsers: stickies face-down until the reveal, votes hidden until the discussion, the spotlight and action items shared; the next retro carrying open action items over |
| Manual | `tests/retro/MANUAL.md` | Touch, drag-to-stack and GIF flows a headless browser cannot fake |

The retro specs need no seeding or sign-in: the host creates the retro through `/retro/new` as a guest, and a second browser context joins through the link.

## Running Tests

```bash
# Run unit and Convex tests (Vitest: node, jsdom and convex projects; CI runs these)
npm run test

# Run the retro's browser tests only
npx playwright test tests/retro/

# Run all tests with UI
npm run test:e2e:ui

# Run tests headlessly
npm run test:e2e:headless

# Run specific test file
npx playwright test tests/home.spec.ts

# Debug failing tests
npx playwright test --debug
```

## Best Practices

1. **Use data-testid attributes** for reliable element selection
2. **Implement Page Object Models** for complex pages
3. **Add retry mechanisms** for flaky operations
4. **Wait for animations** before assertions
5. **Mock external dependencies** (clipboard, API calls)
6. **Use proper wait strategies** instead of arbitrary timeouts

## Debugging

When tests fail:
1. Check the HTML report: `npx playwright show-report`
2. View traces: `npx playwright show-trace <trace-file>`
3. Use `--debug` flag for step-by-step execution
4. Check screenshots/videos in `test-results/`

## Future Improvements

- Add accessibility tests
- Implement visual regression testing
- Add mobile viewport tests
- Create more page object models for other pages
- Add performance benchmarks