{{ 
	config(
		materialized = 'view'
	) 
}}
with source as (
    select
        CategorySK
        , Category
        , CategoryBudget
        , SubCategory
        , SubCategoryBudget
        {# , SubCategoryType #}
    from
        {{ ref('bronze_Golden1_BudgetMap') }}
)
select
    *
from
    source