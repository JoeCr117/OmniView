-- Data test: no layer above bronze may change the sign of a transaction.
--
-- dbt fails the build if this query returns any rows, so it selects the
-- OFFENDING days: each row is one (account, day) whose money adds up to one
-- figure in bronze and a different one by the time gold exposes it.
--
-- This is the warehouse-side backstop for the defect that produced it.
-- `silver_Golden1_CreditCard` used to multiply Debit+Credit by -1 to correct
-- Golden1's v1 export, which writes the card from the issuer's side. The 2026
-- export arrived written from the cardholder's side instead, and that one
-- negation - correct for every row it was written for - inverted every row it
-- was not, reporting $5,947.90 of card spend as income. Sign is now normalized
-- once, in the parser, against a convention declared per (schema version,
-- account) in `golden1_schema.py`; nothing below bronze may touch it again.
--
-- Compared per (account, day) rather than per row because silver carries no
-- transaction key. That is strong enough: a sign flip moves a day's total by
-- twice the flipped amount, and only a same-day pair of equal and opposite
-- errors could hide - which no sign convention produces.
--
-- Money is compared as NUMERIC, not the double precision gold exposes: summing
-- floats leaves -1069.9600000000003 behind and fails a test that should pass.
with bronze_by_day as (
    select 'CreditCard' as AccountType, DateSK, SUM(Debit + Credit) as Amount
    from {{ ref('bronze_Golden1_CreditCard') }} group by DateSK
    union all
    select 'FreeChecking', DateSK, SUM(Debit + Credit)
    from {{ ref('bronze_Golden1_FreeChecking') }} group by DateSK
    union all
    select 'MoneyMarket', DateSK, SUM(Debit + Credit)
    from {{ ref('bronze_Golden1_MoneyMarket') }} group by DateSK
    union all
    select 'Savings', DateSK, SUM(Debit + Credit)
    from {{ ref('bronze_Golden1_Savings') }} group by DateSK
)
, gold_by_day as (
    select
        AccountType
        , DateSK
        , SUM(CAST(TransactionAmount AS numeric)) as Amount
    from
        {{ ref('gold_Golden1_AllTransactions') }}
    group by
        AccountType
        , DateSK
)
select
    b.AccountType
    , b.DateSK
    , ROUND(CAST(b.Amount AS numeric), 2) as BronzeAmount
    , ROUND(g.Amount, 2) as GoldAmount
from
    bronze_by_day b
    join gold_by_day g
        on b.AccountType = g.AccountType
        and b.DateSK = g.DateSK
where
    ABS(ROUND(CAST(b.Amount AS numeric), 2) - ROUND(g.Amount, 2)) >= 0.005
