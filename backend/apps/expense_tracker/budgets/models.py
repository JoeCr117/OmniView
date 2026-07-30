from django.db import models


class BudgetMapDocument(models.Model):
    """The editable budget-map YAML for one bank.

    Source of truth for budget/category edits (replaces
    Data/Banks/<bank>/BudgetMap.yml). Lives in the `default` database
    (omniview schema) so edits survive pipeline rebuilds.
    """

    bank = models.CharField(max_length=100, unique=True)
    yaml_text = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Pinned, not derived. The pipeline reads this table with raw SQL
        # (pipelines/expense_tracker/banks/source.py), so the name is a
        # contract with code Django knows nothing about - and the table holds
        # production data. Pinning it means neither an app-label change nor a
        # package move can rename it out from under the pipeline.
        db_table = 'budgets_budgetmapdocument'

    def __str__(self) -> str:
        return f'BudgetMap[{self.bank}]'


class BudgetMap(models.Model):
    """Unmanaged read-only model over the gold_Golden1_BudgetMap dbt view.

    CategorySK is a hash of (Category, SubCategory) computed at parse time in
    banks/bank.py - not guaranteed unique but effectively so for this data
    volume (mod 100,000). It is never round-tripped through the YAML edit API.
    """

    category_sk = models.IntegerField(db_column="categorysk", primary_key=True)
    category = models.TextField(db_column="category")
    category_budget = models.FloatField(db_column="categorybudget", null=True)
    sub_category = models.TextField(db_column="subcategory")
    sub_category_budget = models.FloatField(db_column="subcategorybudget", null=True)

    class Meta:
        managed = False
        db_table = "gold_Golden1_BudgetMap"
        ordering = ["category", "sub_category"]
