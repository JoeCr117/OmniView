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
        {{ ref('silver_Golden1_BudgetMap') }}
)
select
    s.CategorySK
    , s.Category
    , CAST(s.CategoryBudget AS double precision) AS CategoryBudget
    , s.SubCategory
    , CAST(s.SubCategoryBudget AS double precision) AS SubCategoryBudget
    {# , s.SubCategoryType #}
from
    source s
