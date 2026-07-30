
from __future__ import annotations

import json
from pathlib import Path
from typing import List, Tuple, get_args
from contextlib import contextmanager
from ..process import run_command, timed
from .types import DBT_ARGS_N_TYPES, DBT_LOG_LEVEL_VALUES, FLAGS

__all__ = ['DBT']

class DBT:
    """
    A friendly wrapper around the dbt CLI, now with explicit methods for each argument.
    """

    def __init__(self) -> None:
        # Stores CLI arguments as a flat list: [key1, value1, key2, value2, ...]
        self.args: list[str] = []
        self._used_keys: set[str] = set()

    @contextmanager
    def _temporarily_remove_args(self, keys: List[str]):
        removed_info: list[Tuple[int, list[str]]] = []  # (index, removed_chunk)
        for key in keys:
            if key in self._used_keys:
                idx = self.args.index(key)
                if key in FLAGS:
                    removed_chunk = [self.args[idx]]
                    del self.args[idx]
                else:
                    removed_chunk = self.args[idx:idx + 2]
                    del self.args[idx:idx + 2]

                removed_info.append((idx, removed_chunk))

        try:
            yield
        finally:
            # Restore in reverse order
            for idx, chunk in sorted(removed_info, key=lambda x: x[0], reverse=True):
                for item in reversed(chunk):
                    self.args.insert(idx, item)

    # ------------------------------
    # Internal method to add args
    # ------------------------------
    def _set(self, key: str, value: object | None) -> DBT:
        """
        Internal method to validate and append CLI arguments.
        """
        # Prevent duplicate flags
        if key in self._used_keys:
            raise ValueError(f"Argument {key} already set.")

        # Handle flags (no value expected)
        if key in FLAGS:
            if value is not None:
                raise TypeError(f"Flag {key} does not accept a value.")
            self.args.append(key)
            self._used_keys.add(key)
            return self

        # Validate value type
        allowed_types = DBT_ARGS_N_TYPES[key]
        if not isinstance(value, allowed_types):
            allowed_str = ", ".join(t.__name__ for t in allowed_types)
            raise TypeError(
                f"Invalid type for {key}. Expected one of: {allowed_str}, got {type(value).__name__}"
            )

        # Normalize Path objects to posix (forward slashes)
        if isinstance(value, Path):
            value_str = value.as_posix()
        else:
            value_str = str(value)

        self.args.extend([key, value_str])
        self._used_keys.add(key)

        return self


    # ------------------------------
    # Methods for each dbt argument
    # ------------------------------

    # Path/string args
    def set_project_dir(self, value: Path) -> DBT:
        return self._set('--project-dir', value)

    def set_profiles_dir(self, value: Path) -> DBT:
        return self._set('--profiles-dir', value)

    def set_log_path(self, value: Path) -> DBT:
        return self._set('--log-path', value)

    # String args
    def set_select(self, value: str) -> DBT:
        return self._set('--select', value)

    def set_exclude(self, value: str) -> DBT:
        return self._set('--exclude', value)

    def set_selector(self, value: str) -> DBT:
        return self._set('--selector', value)

    def set_target(self, value: str) -> DBT:
        return self._set('--target', value)

    def set_log_level(self, value: DBT_LOG_LEVEL_VALUES) -> DBT:
        valid_args = get_args(DBT_LOG_LEVEL_VALUES)
        if value not in valid_args:
            raise ValueError(f"Invalid log level '{value}'. Must be one of {valid_args}")
        return self._set('--log-level', value)

    # Dict args
    def set_vars(self, value: dict) -> DBT:
        """
        Accept a Python dict, serialize it to JSON, and append as --vars argument.
        """
        if not isinstance(value, dict):
            raise TypeError(f"--vars expects a dict, got {type(value).__name__}")
        # Serialize dict to a JSON string
        json_str = f"'{json.dumps(value)}'"
        return self._set('--vars', json_str)


    # Int args
    def set_threads(self, value: int) -> DBT:
        """Add --threads {value} to dbt command."""
        return self._set('--threads', value)

    # Flags (no value)
    def set_debug(self) -> DBT:
        """Add --debug flag to dbt command."""
        return self._set('--debug', None)

    def set_cache_selected_only(self) -> DBT:
        """Add --cache-selected-only flag to dbt command."""
        return self._set('--cache-selected-only', None)

    # ------------------------------
    # Internal runner
    # ------------------------------
    def _run(self, command: str, extra_args: list[str] | None = None) -> DBT:
        """
        Build the dbt CLI command and execute it using utils.run_command.
        """

        # Construct the command list and join into a single string
        cmd_list = ['dbt', command] + (extra_args if extra_args else []) + self.args
        cmd_str = " ".join(str(part) for part in cmd_list)

        # Use the shared run_command helper for consistent logging and error handling
        run_command(cmd_str)
        return self


    # ------------------------------
    # High-level commands
    # ------------------------------
    @timed
    def run_debug(self) -> DBT: return self._run('debug')

    @timed
    def run_clean(self) -> DBT: return self._run('clean')

    @timed
    def run_deps(self) -> DBT:
        with self._temporarily_remove_args(['--project-dir']):
            return self._run('deps')

    @timed
    def run_build(self) -> DBT: return self._run('build')

    @timed
    def run_docs_generate(self) -> DBT: return self._run('docs', ['generate'])

    @timed
    def run_docs_serve(self) -> DBT: return self._run('docs', ['serve'])

    @timed
    def run_all(self, docs_generate: bool = False, docs_serve: bool = False) -> DBT:
        (
            self
            .run_debug()
            .run_clean()
            .run_deps()
            .run_build()
        )
        if docs_generate:
            self.run_docs_generate()
        if docs_generate and docs_serve:
            self.run_docs_serve()
        return self
