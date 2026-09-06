# E2E Testing Guide

## Overview

This directory contains end-to-end tests for the AgileKit application using Playwright.

## Structure

```
tests/
├── fixtures/         # Custom test fixtures and configuration
├── pages/           # Page Object Models
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

## Running Tests

```bash
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