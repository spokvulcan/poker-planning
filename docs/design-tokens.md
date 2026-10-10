# Design tokens

Semantic tokens are defined in `src/app/globals.css` and keep light and dark mode consistent.

**Surface tokens** are for layered UI elements, ordered by stacking depth (1 is the base, 3 the highest):

- `surface-1`: primary containers (cards, panels)
- `surface-2`: secondary or elevated containers
- `surface-3`: interactive elements (handles, hover states)

**Status tokens** are for contextual feedback, each with a `-bg` (background) and `-fg` (foreground) variant:

- `status-info-*`: informational states (blue)
- `status-success-*`: success states (green)
- `status-warning-*`: warning states (amber)
- `status-error-*`: error states (red)

Usage in Tailwind:

```tsx
// Surface tokens
className = "bg-white dark:bg-surface-1";
className = "hover:bg-gray-100 dark:hover:bg-surface-3";

// Status tokens
className = "bg-green-50 dark:bg-status-success-bg";
className = "text-green-700 dark:text-status-success-fg";
```

When to use a token, and when a hardcoded value:

- Use surface tokens for container backgrounds in dark mode.
- Use status tokens for semantic feedback colours.
- Keep hardcoded values for gradients, which tokens don't support as pairs.
- Keep hardcoded values for hover states that need distinct visual feedback.
