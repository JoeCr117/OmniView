from pathlib import Path
from typing import Literal

DBT_ARGS_N_TYPES: dict[str, tuple[type, ...]] = {
    '--project-dir': (Path,),
    '--profiles-dir': (Path,),
    '--log-path': (Path,),
    '--select': (str,),
    '--exclude': (str,),
    '--selector': (str,),
    '--target': (str,),
    '--vars': (dict,),
    '--threads': (int,),
    '--log-level': (str,),
}
FLAGS = ('--debug', '--cache-selected-only')

# Valid log-levels for manual runtime validation
DBT_LOG_LEVEL_VALUES = Literal['debug', 'info', 'warn', 'error', 'none']
