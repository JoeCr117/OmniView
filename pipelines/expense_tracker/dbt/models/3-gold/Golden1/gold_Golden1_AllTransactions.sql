{{
    config(
        materialized = 'view',
    )
}}
-- TransactionAmount/Balance cast to double precision at the gold boundary
-- (see gold_Golden1_DailyMetrics for rationale).
WITH source AS (
    SELECT * FROM {{ ref('silver_Golden1_CreditCard') }}
    UNION ALL
    SELECT * FROM {{ ref('silver_Golden1_FreeChecking') }}
    UNION ALL
    SELECT * FROM {{ ref('silver_Golden1_MoneyMarket') }}
    UNION ALL
    SELECT * FROM {{ ref('silver_Golden1_Savings') }}
)
SELECT
    s.CalendarDate
    , s.AccountType
    , CAST(s.TransactionAmount AS double precision) AS TransactionAmount
    , CAST(s.Balance AS double precision) AS Balance
    , s.Label
    , s.DateSK
    , s.CategorySK
FROM
    source s
