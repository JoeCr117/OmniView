{{
    config(
        materialized = 'view'
    )
}}
-- Budget vs. actual, one row per (Category, SubCategory).
--
-- Every budgeted pair survives the join: a category nobody spent against still
-- reports Actual = 0 rather than dropping out, which is what makes this usable
-- as the left side of a budget report.
--
-- SIGN CONVENTION - Actual is spend vs. income, on every account type alike.
-- Negative is money out, positive is money in, and a $50 purchase nets to -50
-- whether it was paid by card or from checking.
--
-- This comment previously documented the opposite, describing a per-account
-- convention as intended behavior. It was not: the card's rows were negated
-- once for every schema version, which corrected the 2024/2025 export and
-- inverted the 2026 one. Normalization now happens in the parser, against a
-- convention declared per (schema version, account) in `golden1_schema.py`, so
-- there is one convention here and Actual can be read as spend directly.
with budgets as (
    select
        CategorySK
        , Category
        , CategoryBudget
        , SubCategory
        , SubCategoryBudget
    from
        {{ ref('gold_Golden1_BudgetMap') }}
)
, actuals as (
    select
        CategorySK
        , SUM(TransactionAmount) AS Actual
        , COUNT(*) AS TransactionCount
        , MIN(CalendarDate) AS FirstTransactionDate
        , MAX(CalendarDate) AS LastTransactionDate
    from
        {{ ref('gold_Golden1_AllTransactions') }}
    where
        CategorySK is not null
    group by
        CategorySK
)
select
    b.CategorySK
    , b.Category
    , b.CategoryBudget
    , b.SubCategory
    , b.SubCategoryBudget
    , CAST(COALESCE(a.Actual, 0) AS double precision) AS Actual
    , CAST(COALESCE(a.TransactionCount, 0) AS integer) AS TransactionCount
    , a.FirstTransactionDate
    , a.LastTransactionDate
from
    budgets b
    left join actuals a
        on a.CategorySK = b.CategorySK
