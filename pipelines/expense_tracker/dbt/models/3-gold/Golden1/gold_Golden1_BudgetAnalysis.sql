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
-- SIGN CONVENTION - read before interpreting Actual. TransactionAmount reaches
-- this model already negated for CreditCard rows (silver_Golden1_CreditCard
-- multiplies Debit+Credit by -1) but NOT for the deposit accounts, so the same
-- $50 purchase nets to -50 on the credit card and +50 on checking. The raw
-- Debit/Credit columns are not carried this far, so the sign cannot be
-- normalized here. Actual is therefore the signed SUM as-is: read it as "this
-- account type's convention", not as "spend vs. income".
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
