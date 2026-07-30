{{
	config(
		materialized = 'view'
	)
}}
WITH unioned_tables AS (
    SELECT *, (Debit + Credit)*-1 AS TransactionAmount FROM {{ ref('bronze_Golden1_CreditCard') }}
    UNION ALL
    SELECT *, (Debit + Credit) AS TransactionAmount FROM {{ ref('bronze_Golden1_FreeChecking') }}
    UNION ALL
    SELECT *, (Debit + Credit) AS TransactionAmount FROM {{ ref('bronze_Golden1_MoneyMarket') }}
    UNION ALL
    SELECT *, (Debit + Credit) AS TransactionAmount FROM {{ ref('bronze_Golden1_Savings') }}
)
SELECT
    DISTINCT
    ut.AccountType
    , ut.CalendarDate
    , ut.TransactionDescription
    , CAST(ut.TransactionAmount AS double precision) AS TransactionAmount
    , ut.DateSK
FROM
    unioned_tables ut
WHERE
    1=1
    AND Label IS NULL
