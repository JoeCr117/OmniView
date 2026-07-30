{{
	config(
		materialized = 'table',
        indexes = [
            {'columns': ['categorysk']},
        ]
	)
}}
with source as (
    select
        CAST(CategorySK AS INTEGER) AS CategorySK
        , CAST(Category AS text) AS Category
        , CAST(CategoryBudget AS DECIMAL(7, 2)) AS CategoryBudget
        , CAST(SubCategory AS text) AS SubCategory
        , CAST(SubCategoryBudget AS DECIMAL(7, 2)) AS SubCategoryBudget
        {# , CAST(SubCategoryType AS text) AS SubCategoryType #}
    from
        {{ source('golden1_staging', 'stg_Golden1_BudgetMap') }}
)
select
    *
from
    source
