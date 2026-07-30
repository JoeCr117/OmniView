{{
    config(
        materialized = 'table',
    )
}}
-- Materialized as a TABLE, not a view (the gold default), for read latency.
-- This model LEFT JOINs gold_DimDate against two *silver views* that each carry
-- window functions (running/intraday balances); as a view it re-ran all of that
-- on every request - a fixed ~950ms regardless of LIMIT, since the windows
-- compute over the whole partition before any LIMIT applies. It is the one gold
-- relation the app reads on a hot path (Check Book + Daily Trends, ~730 rows),
-- so materializing it collapses that read to a ~30ms table scan. A rebuild
-- recomputes it, which is exactly the pipeline's contract (datavault is
-- dropped/rebuilt), so nothing about freshness changes.
--
-- Money columns are cast to double precision at the gold boundary: the
-- bronze/silver layers carry DECIMAL for exact ROUND() math, but consumers
-- (Django FloatField / the JSON API) expect floats, matching what SQLite's
-- REAL storage produced historically.
WITH date_filter AS (
    SELECT
        MIN(CalendarDate) AS min_date
        , MAX(CalendarDate) AS max_date
    FROM (
        SELECT CalendarDate FROM {{ ref('silver_Golden1_DailyBalances') }}
        UNION All
        SELECT CalendarDate FROM {{ ref('silver_Golden1_DailyTransactions') }}
    ) all_dates
)
SELECT
    d.CalendarDate
    , CAST(t.CreditCardTransactionTotal AS double precision) AS CreditCardTransactionTotal
    , CAST(b.CreditCardBalance AS double precision) AS CreditCardBalance
    , CAST(t.FreeCheckingTransactionTotal AS double precision) AS FreeCheckingTransactionTotal
    , CAST(b.FreeCheckingBalance AS double precision) AS FreeCheckingBalance
    , CAST(t.MoneyMarketTransactionTotal AS double precision) AS MoneyMarketTransactionTotal
    , CAST(b.MoneyMarketBalance AS double precision) AS MoneyMarketBalance
    , CAST(t.SavingsTransactionTotal AS double precision) AS SavingsTransactionTotal
    , CAST(b.SavingsBalance AS double precision) AS SavingsBalance
    , CAST(t.TransactionTotal AS double precision) AS TransactionTotal
    , CAST(b.TotalBalance AS double precision) AS TotalBalance
    , t.NoTransactionsFlag
    , d.DateSK
FROM
    {{ ref('gold_DimDate') }} d
    LEFT JOIN {{ ref('silver_Golden1_DailyBalances') }} b ON d.DateSK = b.DateSK
    LEFT JOIN {{ ref('silver_Golden1_DailyTransactions') }} t ON d.DateSK = t.DateSK
WHERE
    1=1
    AND d.CalendarDate BETWEEN (SELECT min_date FROM date_filter) AND (SELECT max_date FROM date_filter)
