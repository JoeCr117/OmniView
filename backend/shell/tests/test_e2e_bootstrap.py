"""
The e2e_bootstrap command wipes the directories its settings point at, so its
guard matters: under any settings module without IS_E2E (like this suite's
config.settings.test) it must refuse before deleting anything.
"""

import pytest
from django.core.management import CommandError, call_command


def test_refuses_outside_e2e_settings():
    with pytest.raises(CommandError, match='config.settings.e2e'):
        call_command('e2e_bootstrap')
