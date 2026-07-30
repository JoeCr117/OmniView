__all__ = ['Bank']

from abc import ABC, abstractmethod
import pandas as pd
import yaml
from sqlalchemy.engine import Engine

from pipelines.common.postgres import DATAVAULT_SCHEMA
from .source import BankSource

class Bank(ABC):

    # Staging-table suffix for the flattened budget map (stg_{Bank}_BudgetMap
    # - the name the dbt sources expect, formerly the BudgetMap.yml stem).
    BUDGET_MAP_TABLE = 'BudgetMap'

    def __init__(self, source: BankSource) -> None:
        """
        Initialize a Bank object from its database-backed source data.

        Args:
            source (BankSource): budget-map YAML text + per-account CSV text,
                as loaded by banks.source.load_bank_sources().
        """

        self.source = source
        self.name = source.name
        self._validate_bank()
        self.transaction_map = self._parse_transaction_map()
        self.account_data = self._parse_transactions()
        self._map_categories()
        self.account_data[self.BUDGET_MAP_TABLE] = self.transaction_map.drop(columns=['Label', 'StringMatch']).drop_duplicates()
        print(f'{self.name} successfully created')


    def _validate_bank(self) -> None:
        if not self.source.budget_map_yaml or not self.source.budget_map_yaml.strip():
            raise ValueError(f"Bank '{self.name}' has no budget map stored")
        if not self.source.accounts:
            raise ValueError(f"No accounts with transaction CSVs found for bank '{self.name}'")
        for account_name, files in self.source.accounts.items():
            if not files:
                raise ValueError(f"{self.name}/{account_name} does not contain any transaction CSVs.")
        print(f"{self.name} structure validated")

    def _parse_transaction_map(self) -> pd.DataFrame:
        transaction_map:dict = yaml.safe_load(self.source.budget_map_yaml)

        rows = []
        def recurse(cat_name, cat_budget, subcat_name, subcat_budget, type_name, node):
            """Walk through nested Type → Label → list of string matches"""
            if isinstance(node, dict):
                for label, val in node.items():
                    # If the value is a list, it's the lowest level
                    if isinstance(val, list):
                        for string in val:
                            rows.append({
                                'Category': cat_name,
                                'CategoryBudget': cat_budget,
                                'SubCategory': subcat_name,
                                'SubCategoryBudget': subcat_budget,
                                # 'SubCategoryType': type_name,
                                'Label': label,
                                'StringMatch': string
                            })
                    else:
                        # label becomes the type for the next level down
                        recurse(cat_name, cat_budget, subcat_name, subcat_budget, label, val)

        for category_name, category_details in transaction_map.items():
            category_budget = category_details.get('Budget', 0)
            subcategories = category_details.get('SubCategories', {})

            for subcategory_name, subcat_details in subcategories.items():
                subcategory_budget = subcat_details.get('Budget', 0)
                type_node = subcat_details.get('Type', {})
                recurse(category_name, category_budget, subcategory_name, subcategory_budget, None, type_node)

        df = pd.DataFrame(rows).reset_index(drop=True)
        df['CategorySK'] = (
            pd.util.hash_pandas_object(
                df[[
                    'Category',
                    'SubCategory',
                    # 'SubCategoryType'
                    ]],
                index=False
            ) % 100_000
        # hash_pandas_object yields uint64, which SQLAlchemy/psycopg won't
        # stage; values are < 100_000 so int64 is lossless.
        ).astype('int64')

        return df

    def _map_categories(self) -> None:
        left_on:str = 'Description'
        right_on:str = 'StringMatch'

        def check_match(row:pd.Series):
            for _, r_row in self.transaction_map.iterrows():
                if r_row[right_on].upper() in row[left_on].upper():
                    return r_row[right_on]
            return None

        for account_name, account_data in self.account_data.items():
            account_data['join_key'] = account_data.apply(check_match, axis=1)
            merged_df = pd.merge(account_data, self.transaction_map, left_on='join_key', right_on=right_on, how='left')
            merged_df = merged_df.drop(columns=['join_key'])
            map_columns = [col for col in list(self.transaction_map.columns) if col not in  ['Label', 'CategorySK']]
            good_columns = [col for col in merged_df.columns if col not in map_columns]
            merged_df = merged_df[good_columns]
            self.account_data[account_name] = merged_df

    def to_sql(self, engine:Engine) -> None:
        print(f'Staging {self.name} to the {DATAVAULT_SCHEMA} schema')
        for account_name, account_data in self.account_data.items():
            print(f'\tStaging Table stg_{self.name}_{account_name}')
            # Postgres folds unquoted identifiers to lowercase; lowercasing the
            # columns here lets every downstream dbt model use unquoted names.
            staged = account_data.copy()
            staged.columns = [str(col).lower() for col in staged.columns]
            staged.to_sql(
                f'stg_{self.name}_{account_name}',
                engine,
                schema=DATAVAULT_SCHEMA,
                if_exists='replace',
                index=False,
            )

    @abstractmethod
    def _parse_transactions(self) -> dict[str,pd.DataFrame]:
        raise NotImplementedError('Children of "Bank" must implement _parse_transactions(self) -> dict[str,pd.DataFrame]')

    def __str__(self) -> str:
        props = [f"{prop}: {value}" for prop, value in self.__dict__.items()]
        return "\n".join(props)

    def __repr__(self) -> str:
        return self.__str__()
