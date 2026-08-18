{{
	config(
		materialized = 'view'
	)
}}
-- No sign correction here, deliberately. This model used to negate both money
-- columns to fix the v1 export, which writes the card from the issuer's side
-- (a purchase is positive, because it increases what you owe). When the v2
-- export arrived already written from the cardholder's side, that one blanket
-- negation was correcting the v1 rows and INVERTING the v2 rows in the same
-- expression - reporting every 2026 purchase as income.
--
-- The convention is now declared per (schema version, account) in
-- `golden1_schema.py` and applied by the parser, so every row reaching bronze
-- already means the same thing. Re-adding a `*-1` here would re-break it.
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
        {{ ref('bronze_Golden1_CreditCard') }}
)
select
    *
from
    source
