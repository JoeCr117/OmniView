{{ 
	config(
		materialized = 'view'
	) 
}}
WITH coalesced_data AS (
    select
        d.CalendarDate
        , COALESCE(cc.CreditCardTransactionTotal,0) AS CreditCardTransactionTotal
        , COALESCE(fc.FreeCheckingTransactionTotal,0) AS FreeCheckingTransactionTotal
        , COALESCE(mm.MoneyMarketTransactionTotal,0) AS MoneyMarketTransactionTotal
        , COALESCE(sv.SavingsTransactionTotal,0) AS SavingsTransactionTotal
        , d.DateSK
    from 
        {{ ref('gold_DimDate') }} d
        left join 
            (
                Select DateSK, ROUND(SUM(TransactionAmount),2) as CreditCardTransactionTotal FROM {{ ref('silver_Golden1_CreditCard') }} group by DateSK
            ) cc ON d.DateSK = cc.DateSK
        left join 
            (
                Select DateSK, ROUND(SUM(TransactionAmount),2) as FreeCheckingTransactionTotal FROM {{ ref('silver_Golden1_FreeChecking') }} group by DateSK
            ) fc ON d.DateSK = fc.DateSK
        left join 
            (
                Select DateSK, ROUND(SUM(TransactionAmount),2) as MoneyMarketTransactionTotal FROM {{ ref('silver_Golden1_MoneyMarket') }} group by DateSK
            ) mm ON d.DateSK = mm.DateSK
        left join 
            (
                Select DateSK, ROUND(SUM(TransactionAmount),2) as SavingsTransactionTotal FROM {{ ref('silver_Golden1_Savings') }} group by DateSK
            ) sv ON d.DateSK = sv.DateSK
), cleaned_data AS (
    select
        CalendarDate
        , CreditCardTransactionTotal
        , FreeCheckingTransactionTotal
        , MoneyMarketTransactionTotal
        , SavingsTransactionTotal
        , ROUND(CreditCardTransactionTotal + 
                FreeCheckingTransactionTotal + 
                MoneyMarketTransactionTotal + 
                SavingsTransactionTotal,2) AS TransactionTotal
        , CASE 
            WHEN 
                CreditCardTransactionTotal = 0 AND 
                FreeCheckingTransactionTotal = 0 AND 
                MoneyMarketTransactionTotal = 0 AND 
                SavingsTransactionTotal = 0
            THEN
                1
            ELSE
                0
            END AS NoTransactionsFlag
        , DateSK
    from
        coalesced_data
), date_filter AS (
    SELECT 
        MIN(CalendarDate) AS min_date
        , MAX(CalendarDate) AS max_date
    FROM (
        SELECT CalendarDate FROM {{ ref('silver_Golden1_CreditCard') }}
        UNION ALL
        SELECT CalendarDate FROM {{ ref('silver_Golden1_FreeChecking') }}
        UNION ALL
        SELECT CalendarDate FROM {{ ref('silver_Golden1_MoneyMarket') }}
        UNION ALL
        SELECT CalendarDate FROM {{ ref('silver_Golden1_Savings') }}
    ) all_dates
)
SELECT 
    *
FROM
    cleaned_data 
WHERE 
    1=1
    AND cleaned_data.CalendarDate BETWEEN (SELECT min_date FROM date_filter) AND (SELECT max_date FROM date_filter)