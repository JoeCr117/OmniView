"""Golden1 Credit Union: the reference `Bank` implementation.

Its CSV export is one file per account per year, with the columns
``Date, ReferenceNo., Type, Description, Debit, Credit, CheckNumber, Balance``
(see docs/examples/Banks/Golden1/ for a synthetic sample of the format).

The one non-obvious thing this parser does is recompute the credit card's
running balance - see CREDIT_CARD_BALANCE_ANCHOR below.
"""

import io

import pandas as pd

from ..bank import Bank

#: Golden1's exported per-row ``Balance`` is only trustworthy at end of day: rows
#: sharing a date carry that day's *closing* balance rather than the balance
#: after each individual transaction. `_fix_intraday_balance` therefore discards
#: the exported column and rebuilds it from a running total, anchored to one
#: date whose closing balance is known to be correct. Anchoring is what fixes the
#: offset; any (date, balance) pair the account holder has verified will do, and
#: the date need not still be present in the CSVs (the nearest earlier date is
#: used instead). Re-anchor this if the account's history is ever re-exported
#: from a different starting point.
CREDIT_CARD_BALANCE_ANCHOR = ('2025-07-12', 1749.18)


class Golden1(Bank):

    def _parse_transactions(self) -> dict[str, pd.DataFrame]:
        account_data = {}

        # Iterate over each account's stored CSVs (filename-sorted by the source)
        for account_name, files in self.source.accounts.items():
            # Read each CSV into a DataFrame and concatenate them
            df = pd.concat(
                (pd.read_csv(io.StringIO(csv_text)) for _, csv_text in files),
                ignore_index=True,
            )
            df['AccountType'] = account_name
            # Format Date columns to YYYY-MM-DD
            df['DateSK'] = pd.to_datetime(df['Date'], errors='coerce').dt.strftime('%Y%m%d').astype(int)
            df['Date'] = pd.to_datetime(df['Date'], errors='coerce').dt.strftime('%Y-%m-%d')
            if account_name == 'CreditCard':
                df = self._fix_intraday_balance(df, *CREDIT_CARD_BALANCE_ANCHOR)
            # Add an index column to preserve correct transaction ordering
            df = df.reset_index(names='Indx')
            # Reorder columns
            df = df[['Indx', 'DateSK', 'Date', 'AccountType'] + [col for col in df.columns if col not in ['Indx', 'DateSK', 'Date', 'AccountType']]]

            # Store the result keyed by the account name
            account_data[account_name] = df

        return account_data

    def _fix_intraday_balance(
        self,
        df: pd.DataFrame,
        known_date: str,
        known_balance: float
    ) -> pd.DataFrame:
        """
        Compute intraday (per-transaction) balances, anchored to a known
        end-of-day balance, with all monetary values rounded to two decimals.

        Parameters:
        - df: DataFrame with ['Date', 'TransactionAmount', 'Balance'].
            'Balance' can be zero or ignored.
        - known_date: string 'YYYY-MM-DD' of the day whose final balance you trust.
        - known_balance: float, the actual balance at the end of that known_date.

        Returns:
        - DataFrame sorted by Date, with adjusted balance
        """
        # 1) Prepare & sort
        df = df.sort_values('Date').reset_index(drop=True)
        df2 = df.copy()

        # 2) Round transaction amounts
        df2['Debit'] = (df2['Debit'].fillna(0)).round(2)
        df2['Credit'] = (df2['Credit'].fillna(0)).round(2)
        df2['TransactionAmount'] = (df2['Debit'] + df2['Credit']).round(2)

        # 3) Zero-based running sum (rounded)
        df2['ZeroCumSum'] = df2['TransactionAmount'].cumsum().round(2)

        # 4) Determine anchor date (fallback to last date if missing)
        kd = pd.to_datetime(known_date)
        available_dates = pd.to_datetime(df2['Date'].unique())

        if kd not in available_dates:
            # Filter dates that are less than known_date
            filtered_dates = available_dates[available_dates < kd]
            if not filtered_dates.empty:
                kd = filtered_dates.max()
            else:
                # Handle case when no dates are less than known_date
                raise ValueError("No Date less than 'known_date'")

        df2['AnchorDate'] = kd.strftime('%Y-%m-%d')
        # 5) Find zero-Cumsum at last transaction of anchor date
        mask = df2['AnchorDate'] == df2['Date']
        last_idx = df2[mask].index.max()
        zero_at_anchor = df2.at[last_idx, 'ZeroCumSum']

        # 6) Derive and round adjustment
        adjustment = round(known_balance - zero_at_anchor, 2)
        df2['Adjustment'] = adjustment

        # 7) Compute true intraday balances (rounded). Only Balance is copied
        # back: the working columns above stay local to this method.
        df2['Balance'] = (df2['ZeroCumSum'] + adjustment).round(2)
        df['Balance'] = df2['Balance']
        return df