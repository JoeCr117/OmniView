{{ 
	config(
		materialized = 'view'
	) 
}}
with source as (
    select
        CalendarDate,
        AccountType,
        CAST(((Debit + Credit)*-1) AS DECIMAL(10,2)) AS TransactionAmount,
        Balance*-1 AS Balance,
        Label,
        DateSK,
        CategorySK
    from
        {{ ref('bronze_Golden1_CreditCard') }}
)
select
    *
from
    source