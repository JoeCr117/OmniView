-- Data test: a category's subcategory budgets must never sum above the
-- category's own budget.
--
-- dbt fails the build if this query returns any rows, so it selects the
-- OFFENDING categories: each row is one category whose children over-allocate
-- it. The same invariant is enforced on write in
-- backend/apps/expense_tracker/budgets/yaml_repository.py - this is the
-- warehouse-side backstop for rows that reached the database another way.
--
-- Money is compared as NUMERIC, not the double precision the gold view exposes:
-- summing floats makes an exactly-allocated category (700 = 225 + 475) come
-- back as 700.0000000001 and fail a test it should pass.
with per_category as (
    select
        Category
        , CategoryBudget
        , SUM(COALESCE(SubCategoryBudget, 0)) AS SubCategoryBudgetTotal
    from
        {{ ref('gold_Golden1_BudgetMap') }}
    where
        CategoryBudget is not null
    group by
        Category
        , CategoryBudget
)
select
    Category
    , CategoryBudget
    , SubCategoryBudgetTotal
from
    per_category
where
    ROUND(CAST(SubCategoryBudgetTotal AS numeric), 2)
        > ROUND(CAST(CategoryBudget AS numeric), 2)
