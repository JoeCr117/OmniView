import copy

import pytest
import yaml
from ninja.errors import HttpError

from apps.expense_tracker.budgets.models import BudgetMapDocument
from apps.expense_tracker.budgets.yaml_repository import (
    BudgetMapValidationError,
    load_budget_map,
    save_budget_map,
    validate_budget_map,
)
from apps.expense_tracker.tests.fixtures import VALID_BUDGET_MAP


class TestValidateBudgetMap:
    def test_valid_map_has_no_errors(self):
        assert validate_budget_map(VALID_BUDGET_MAP) == []

    def test_root_must_be_a_mapping(self):
        assert validate_budget_map(['not', 'a', 'dict']) == [
            'root: expected a mapping of Category -> details'
        ]

    def test_category_must_be_a_mapping(self):
        errors = validate_budget_map({'Car': 'nope'})
        assert errors == ['Car: expected a mapping, got str']

    def test_unexpected_category_key(self):
        errors = validate_budget_map({'Car': {'Budget': 100, 'Extra': 1}})
        assert "Car: unexpected key 'Extra' (allowed: Budget, SubCategories)" in errors

    def test_category_budget_must_be_numeric(self):
        errors = validate_budget_map({'Car': {'Budget': 'lots'}})
        assert 'Car.Budget: expected a number' in errors

    def test_subcategories_must_be_a_mapping(self):
        errors = validate_budget_map({'Car': {'SubCategories': ['Fuel']}})
        assert 'Car.SubCategories: expected a mapping' in errors

    def test_unexpected_subcategory_key(self):
        data = {'Car': {'SubCategories': {'Fuel': {'Budget': 1, 'Oops': 2}}}}
        errors = validate_budget_map(data)
        assert "Car.Fuel: unexpected key 'Oops' (allowed: Budget, Type)" in errors

    def test_type_leaf_must_be_nonempty_string_list(self):
        data = {'Car': {'SubCategories': {'Fuel': {'Type': {'Expense': []}}}}}
        assert 'Car.Fuel.Type.Expense: string-match list is empty' in validate_budget_map(data)

        data = {'Car': {'SubCategories': {'Fuel': {'Type': {'Expense': ['SHELL', 7]}}}}}
        errors = validate_budget_map(data)
        assert 'Car.Fuel.Type.Expense: string-match list must contain only strings' in errors

    def test_type_node_rejects_scalar_values(self):
        data = {'Car': {'SubCategories': {'Fuel': {'Type': {'Expense': 'SHELL'}}}}}
        errors = validate_budget_map(data)
        assert (
            'Car.Fuel.Type.Expense: expected a list of strings or a nested mapping, got str'
            in errors
        )

    def test_type_node_allows_arbitrary_nesting(self):
        data = {'Car': {'SubCategories': {'Fuel': {'Type': {'A': {'B': {'C': ['DEEP MATCH']}}}}}}}
        assert validate_budget_map(data) == []

    def test_subcategory_budgets_may_not_exceed_category_budget(self):
        data = copy.deepcopy(VALID_BUDGET_MAP)
        data['Car']['SubCategories']['Fuel']['Budget'] = 150  # 150 + 200 > 300
        errors = validate_budget_map(data)
        assert errors == [
            'Car: subcategory budgets sum to 350, exceeding the category budget of 300'
        ]

    def test_subcategory_budgets_equal_to_category_budget_is_valid(self):
        data = copy.deepcopy(VALID_BUDGET_MAP)
        data['Car']['SubCategories']['Fuel']['Budget'] = 100  # 100 + 200 == 300
        assert validate_budget_map(data) == []

    def test_category_without_budget_is_exempt_from_sum_rule(self):
        data = {
            'Income': {
                'SubCategories': {
                    'Paycheck': {'Budget': 99999, 'Type': {'X': ['Y']}},
                }
            }
        }
        assert validate_budget_map(data) == []


@pytest.mark.django_db
class TestLoadAndSave:
    def test_load_reads_yaml(self, golden1_data):
        assert load_budget_map('Golden1') == VALID_BUDGET_MAP

    def test_load_missing_bank_404s(self, golden1_data):
        with pytest.raises(HttpError) as exc_info:
            load_budget_map('NoSuchBank')
        assert exc_info.value.status_code == 404

    def test_save_round_trips(self, golden1_data):
        data = copy.deepcopy(VALID_BUDGET_MAP)
        data['Car']['SubCategories']['Fuel']['Budget'] = 50
        save_budget_map(data, 'Golden1')
        assert load_budget_map('Golden1') == data

    def test_save_invalid_raises_and_leaves_row_untouched(self, golden1_data):
        original = BudgetMapDocument.objects.get(bank='Golden1').yaml_text
        bad = {'Car': {'Budget': 'not-a-number'}}
        with pytest.raises(BudgetMapValidationError) as exc_info:
            save_budget_map(bad, 'Golden1')
        assert exc_info.value.errors == ['Car.Budget: expected a number']
        assert BudgetMapDocument.objects.get(bank='Golden1').yaml_text == original

    def test_save_creates_single_row_per_bank(self, golden1_data):
        save_budget_map(copy.deepcopy(VALID_BUDGET_MAP), 'Golden1')
        assert BudgetMapDocument.objects.filter(bank='Golden1').count() == 1

    def test_saved_text_is_valid_yaml_matching_input(self, golden1_data):
        data = copy.deepcopy(VALID_BUDGET_MAP)
        save_budget_map(data, 'Golden1')
        stored = yaml.safe_load(BudgetMapDocument.objects.get(bank='Golden1').yaml_text)
        assert stored == data
