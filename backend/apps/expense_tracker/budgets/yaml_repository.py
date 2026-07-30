"""
Reads and writes a bank's budget map, stored as a BudgetMapDocument row in
the `default` database (omniview schema) - the YAML text (not the
gold_*_BudgetMap dbt view) is the source of truth for budget/category edits.
Replaces the old Data/Banks/<bank>/BudgetMap.yml file. Mirrors the nested
shape banks/bank.py:_parse_transaction_map() expects:

    Category:
      Budget: <number>            # optional
      SubCategories:
        SubCategory:
          Budget: <number>        # optional
          Type:
            <arbitrarily nested dict of str keys, terminating in a list of
             string-match strings>

MVP hardcodes the "Golden1" bank (see plan risk #4 - multi-bank support is
deferred).
"""

import yaml
from ninja.errors import HttpError

from .models import BudgetMapDocument


class BudgetMapValidationError(Exception):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def load_budget_map(bank: str = "Golden1") -> dict:
    document = BudgetMapDocument.objects.filter(bank=bank).first()
    if document is None:
        raise HttpError(404, f"No budget map stored for bank '{bank}'")
    return yaml.safe_load(document.yaml_text) or {}


def _validate_type_node(node, path: str, errors: list[str]) -> None:
    if not isinstance(node, dict):
        errors.append(f"{path}: expected a mapping, got {type(node).__name__}")
        return
    for key, value in node.items():
        node_path = f"{path}.{key}"
        if isinstance(value, list):
            if not value:
                errors.append(f"{node_path}: string-match list is empty")
            elif not all(isinstance(v, str) for v in value):
                errors.append(f"{node_path}: string-match list must contain only strings")
        elif isinstance(value, dict):
            _validate_type_node(value, node_path, errors)
        else:
            errors.append(f"{node_path}: expected a list of strings or a nested mapping, got {type(value).__name__}")


def validate_budget_map(data) -> list[str]:
    """Returns a list of human-readable error strings; empty list means valid."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["root: expected a mapping of Category -> details"]

    for category, details in data.items():
        cat_path = category
        if not isinstance(details, dict):
            errors.append(f"{cat_path}: expected a mapping, got {type(details).__name__}")
            continue
        for key in details:
            if key not in ("Budget", "SubCategories"):
                errors.append(f"{cat_path}: unexpected key '{key}' (allowed: Budget, SubCategories)")
        if "Budget" in details and not isinstance(details["Budget"], (int, float)):
            errors.append(f"{cat_path}.Budget: expected a number")

        subcategories = details.get("SubCategories", {})
        if not isinstance(subcategories, dict):
            errors.append(f"{cat_path}.SubCategories: expected a mapping")
            continue

        for sub_category, sub_details in subcategories.items():
            sub_path = f"{cat_path}.{sub_category}"
            if not isinstance(sub_details, dict):
                errors.append(f"{sub_path}: expected a mapping, got {type(sub_details).__name__}")
                continue
            for key in sub_details:
                if key not in ("Budget", "Type"):
                    errors.append(f"{sub_path}: unexpected key '{key}' (allowed: Budget, Type)")
            if "Budget" in sub_details and not isinstance(sub_details["Budget"], (int, float)):
                errors.append(f"{sub_path}.Budget: expected a number")
            if "Type" in sub_details:
                _validate_type_node(sub_details["Type"], f"{sub_path}.Type", errors)

        # Subcategory budgets must fit inside the category budget. Enforced here
        # on write, and again in the warehouse by the dbt data test
        # dbt/tests/Budgets/CatToSubCatSums.sql for rows that arrived some other way.
        # Categories without a Budget of their own (e.g. Income, Banking) are
        # exempt - there's no ceiling to check against.
        category_budget = details.get("Budget")
        if isinstance(category_budget, (int, float)):
            sub_budget_sum = sum(
                sub_details["Budget"]
                for sub_details in subcategories.values()
                if isinstance(sub_details, dict)
                and isinstance(sub_details.get("Budget"), (int, float))
            )
            if sub_budget_sum > category_budget:
                errors.append(
                    f"{cat_path}: subcategory budgets sum to {sub_budget_sum:g}, "
                    f"exceeding the category budget of {category_budget:g}"
                )

    return errors


def save_budget_map(data: dict, bank: str = "Golden1") -> None:
    errors = validate_budget_map(data)
    if errors:
        raise BudgetMapValidationError(errors)

    BudgetMapDocument.objects.update_or_create(
        bank=bank,
        defaults={"yaml_text": yaml.safe_dump(data, sort_keys=False, allow_unicode=True)},
    )
