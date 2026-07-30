{{
	config(
		materialized = 'table',
        indexes = [
            {'columns': ['datesk', 'transactionindex']},
            {'columns': ['categorysk', 'label']},
        ]
	)
}}
with source as (
    select
        CAST(Indx AS INTEGER) AS TransactionIndex,
        CAST(DateSK AS INTEGER) AS DateSK,
        CAST(Date AS text) AS CalendarDate,
        CAST(AccountType AS text) as AccountType,
        CAST("referenceno." AS text) as ReferenceNumber,
        CAST(Type as text) AS TransactionType,
        CAST(Description AS text) AS TransactionDescription,
        CAST(COALESCE(Debit,0) as DECIMAL(10, 2)) AS Debit,
        CAST(COALESCE(Credit,0) as DECIMAL(10, 2)) AS Credit,
        CAST(CheckNumber as text) AS CheckNumber,
        CAST(Balance as DECIMAL(10, 2)) AS Balance,
        CAST(CategorySK as INTEGER) AS CategorySK,
        CAST(Label AS text) AS Label
    from
        {{ source('golden1_staging', 'stg_Golden1_FreeChecking') }}
)
select
    *
from
    source
