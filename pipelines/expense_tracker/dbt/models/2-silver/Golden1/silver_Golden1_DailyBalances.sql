{{ 
	config(
		materialized = 'view'
	) 
}}
WITH
-- 1. Get raw EOD balances for each table
EOD1 AS (
    SELECT
        t1.DateSK,
        t1.Balance*-1 AS t1_EODBalance
    FROM {{ ref('bronze_Golden1_CreditCard') }} AS t1
    JOIN (
        SELECT DateSK, MAX(TransactionIndex) AS MaxTx
        FROM {{ ref('bronze_Golden1_CreditCard') }}
        GROUP BY DateSK
    ) m1 ON t1.DateSK = m1.DateSK
        AND t1.TransactionIndex = m1.MaxTx
),
EOD2 AS (
    SELECT
        t2.DateSK,
        t2.Balance AS t2_EODBalance
    FROM {{ ref('bronze_Golden1_FreeChecking') }} AS t2
    JOIN (
        SELECT DateSK, MAX(TransactionIndex) AS MaxTx
        FROM {{ ref('bronze_Golden1_FreeChecking') }}
        GROUP BY DateSK
    ) m2 ON t2.DateSK = m2.DateSK
        AND t2.TransactionIndex = m2.MaxTx
),
EOD3 AS (
    SELECT
        t3.DateSK,
        t3.Balance AS t3_EODBalance
    FROM {{ ref('bronze_Golden1_MoneyMarket') }} AS t3
    JOIN (
        SELECT DateSK, MAX(TransactionIndex) AS MaxTx
        FROM {{ ref('bronze_Golden1_MoneyMarket') }}
        GROUP BY DateSK
    ) m3 ON t3.DateSK = m3.DateSK
        AND t3.TransactionIndex = m3.MaxTx
),
EOD4 AS (
    SELECT
        t4.DateSK,
        t4.Balance AS t4_EODBalance
    FROM {{ ref('bronze_Golden1_Savings') }} AS t4
    JOIN (
        SELECT DateSK, MAX(TransactionIndex) AS MaxTx
        FROM {{ ref('bronze_Golden1_Savings') }}
        GROUP BY DateSK
    ) m4 ON t4.DateSK = m4.DateSK
        AND t4.TransactionIndex = m4.MaxTx
),

-- 2. All calendar dates
AllDates AS (
SELECT 
    d.CalendarDate
    , d.DateSK
FROM {{ ref('gold_DimDate') }} d
),

-- 3. Merge raw EODs onto calendar
Merged AS (
    SELECT
        d.CalendarDate,
        e1.t1_EODBalance,
        e2.t2_EODBalance,
        e3.t3_EODBalance,
        e4.t4_EODBalance,
        d.DateSK
    FROM 
        AllDates d
        LEFT JOIN EOD1 e1 ON d.DateSK = e1.DateSK
        LEFT JOIN EOD2 e2 ON d.DateSK = e2.DateSK
        LEFT JOIN EOD3 e3 ON d.DateSK = e3.DateSK
        LEFT JOIN EOD4 e4 ON d.DateSK = e4.DateSK
), 

-- 4. Final carry-forward of balances
CarryForward AS (
    SELECT
        m.CalendarDate,

    /* For each table, look back to find the most recent non-null EOD */
        (
            SELECT x.t1_EODBalance
            FROM Merged x
            WHERE x.CalendarDate <= m.CalendarDate
                AND x.t1_EODBalance IS NOT NULL
            ORDER BY x.CalendarDate DESC
            LIMIT 1
        ) AS CreditCardBalance,

        (
            SELECT x.t2_EODBalance
            FROM Merged x
            WHERE x.CalendarDate <= m.CalendarDate
                AND x.t2_EODBalance IS NOT NULL
            ORDER BY x.CalendarDate DESC
            LIMIT 1
        ) AS FreeCheckingBalance,

        (
            SELECT x.t3_EODBalance
            FROM Merged x
            WHERE x.CalendarDate <= m.CalendarDate
                AND x.t3_EODBalance IS NOT NULL
            ORDER BY x.CalendarDate DESC
            LIMIT 1
        ) AS MoneyMarketBalance,

        (
            SELECT x.t4_EODBalance
            FROM Merged x
            WHERE x.CalendarDate <= m.CalendarDate
                AND x.t4_EODBalance IS NOT NULL
            ORDER BY x.CalendarDate DESC
            LIMIT 1
        ) AS SavingsBalance,
        m.DateSK

    FROM Merged m
), date_filter AS (
    SELECT 
        MIN(CalendarDate) AS min_date
        , MAX(CalendarDate) AS max_date
    FROM (
        SELECT CalendarDate FROM {{ ref('bronze_Golden1_CreditCard') }}
        UNION ALL
        SELECT CalendarDate FROM {{ ref('bronze_Golden1_FreeChecking') }}
        UNION ALL
        SELECT CalendarDate FROM {{ ref('bronze_Golden1_MoneyMarket') }}
        UNION ALL
        SELECT CalendarDate FROM {{ ref('bronze_Golden1_Savings') }}
    ) all_dates
)
SELECT
    CalendarDate
    , COALESCE(CreditCardBalance,0) AS CreditCardBalance
    , COALESCE(FreeCheckingBalance,0) AS FreeCheckingBalance
    , COALESCE(MoneyMarketBalance,0) AS MoneyMarketBalance
    , COALESCE(SavingsBalance,0) AS SavingsBalance
    , ROUND(COALESCE(CreditCardBalance,0) + COALESCE(FreeCheckingBalance,0) + COALESCE(MoneyMarketBalance,0) + COALESCE(SavingsBalance,0), 2) AS TotalBalance
    , DateSK
FROM
    CarryForward
WHERE 
    1=1
    AND CarryForward.CalendarDate BETWEEN (SELECT min_date FROM date_filter) AND (SELECT max_date FROM date_filter)