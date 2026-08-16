{{
	config(
		materialized = 'view'
	)
}}
with source as (
    select
        CalendarDate,
        AccountType,
        CAST((Debit + Credit) AS DECIMAL(10,2)) AS TransactionAmount,
        Balance,
        Label,
        DateSK,
        CategorySK
    from
        {{ ref('bronze_Golden1_Savings') }}
)
select
    *
from
    source
