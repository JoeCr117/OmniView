"""Working-directory helpers.

`temp_cd` exists because the dbt CLI resolves its project and profiles from the
current directory, so a rebuild has to run from inside the dbt project and get
back out again even if the build raises.
"""

__all__ = ['temp_cd']

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


@contextmanager
def temp_cd(destination: str | Path) -> Iterator[None]:
    """Change the working directory for the duration of the block, then restore it.

    Raises FileNotFoundError / NotADirectoryError / PermissionError if the
    destination can't be entered; the original directory is always restored.
    """
    original_directory = Path.cwd()
    destination_path = Path(destination).resolve(strict=True)

    os.chdir(destination_path)
    print(f'Directory changed to:\n\t{destination_path}')
    try:
        yield
    finally:
        os.chdir(original_directory)
        print(f'Directory returning to:\n\t{original_directory}')
