# frontend/src/app/(shell)/apps/expense-tracker/uncategorized/

## Purpose
A paginated table of transactions whose description matched no BudgetMap string —
the worklist for improving categorization.

## Role in OmniView
Rendered at `/apps/expense-tracker/uncategorized`. Reads
`/transactions/uncategorized` via `useResource`, with the page offset in the
cache key so paging back to a seen page is instant.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | The uncategorized DataTable + a `Pager`. |

## Conventions & gotchas
- An empty result is the goal state ("Nothing uncategorized — nice.").
- First load shows a `TableSkeleton`; paging shows a `RefreshBar`, not a blank.

## See also
- [expense-tracker/](../README.md) · [budget-map/](../budget-map/README.md)
