"""
Hands every relation in the `omniview` schema to the shared owner role.

Runs straight after `migrate` (docker/entrypoint.sh / databricks_start.py), and
exists for the same reason as the dbt `on-run-end` hook that covers `datavault`
(pipelines/expense_tracker/dbt/macros/ensure_schema_ownership.sql) - this is the
other half of that fix.

**Why ownership drifts.** Postgres assigns a new object to its creator. In the
cloud that is the Databricks App's service principal, and a *new* one is minted
every time the app is recreated. A table created by a previous SP becomes
unreadable and undroppable by the current one, because role membership in a
common group does NOT confer access to another member's objects - both being
members of `omniview_owner` is not enough.

**Why here and not from an admin session.** `ALTER ... OWNER TO` requires that
you own the object *and* belong to the target role. Immediately after migrate,
the app satisfies both. Nobody else ever can: a workspace admin who is merely a
sibling member of `omniview_owner` gets "must be owner of table ...", and once
the owning SP is deleted the object cannot be reassigned by anyone at all.
That makes this a fix that only works if it runs *now*, as the creator.

**Local is a no-op.** There is one role locally (`omniview`) and no identity
churn, so the shared role does not exist and this returns having done nothing.
"""

import os

from django.core.management.base import BaseCommand
from django.db import connections

#: Matches the dbt macro's default. Override with OMNIVIEW_OWNER_ROLE if a
#: deployment names it differently; the two must agree.
OWNER_ROLE = os.environ.get('OMNIVIEW_OWNER_ROLE', 'omniview_owner')

SCHEMA = 'omniview'

# Reassigns tables, partitioned tables, views and materialized views. Written as
# a DO block so the whole sweep is one round trip, and guarded so that a
# deployment without the shared role is a silent no-op rather than an error.
REASSIGN_SQL = """
do $$
declare
    rec record;
begin
    if not exists (select 1 from pg_roles where rolname = %(role)s) then
        return;
    end if;
    for rec in
        select c.relname, c.relkind
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = %(schema)s
           and c.relkind in ('r', 'p', 'v', 'm')
           and pg_get_userbyid(c.relowner) <> %(role)s
    loop
        if rec.relkind in ('r', 'p') then
            execute format('alter table %%I.%%I owner to %%I', %(schema)s, rec.relname, %(role)s);
        elsif rec.relkind = 'v' then
            execute format('alter view %%I.%%I owner to %%I', %(schema)s, rec.relname, %(role)s);
        elsif rec.relkind = 'm' then
            execute format('alter materialized view %%I.%%I owner to %%I', %(schema)s, rec.relname, %(role)s);
        end if;
    end loop;
end $$;
"""

COUNT_SQL = """
select count(*)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = %(schema)s
   and c.relkind in ('r', 'p', 'v', 'm')
   and pg_get_userbyid(c.relowner) <> %(role)s
"""


class Command(BaseCommand):
    help = f'Give every {SCHEMA} relation to the shared owner role (idempotent, no-op locally).'

    def handle(self, *args, **options):
        connection = connections['default']
        if connection.vendor != 'postgresql':
            self.stdout.write(
                f'Skipping ownership: default DB vendor is {connection.vendor!r}, not postgresql.'
            )
            return

        params = {'schema': SCHEMA, 'role': OWNER_ROLE}
        with connection.cursor() as cursor:
            cursor.execute(
                'select exists (select 1 from pg_roles where rolname = %(role)s)', params
            )
            if not cursor.fetchone()[0]:
                self.stdout.write(
                    f'Ownership skipped: role {OWNER_ROLE!r} does not exist (single-owner deployment).'
                )
                return

            cursor.execute(COUNT_SQL, params)
            before = cursor.fetchone()[0]

            cursor.execute(REASSIGN_SQL, params)

            cursor.execute(COUNT_SQL, params)
            after = cursor.fetchone()[0]

        if before == 0:
            self.stdout.write(
                f'Ownership already correct: all {SCHEMA} relations owned by {OWNER_ROLE}.'
            )
        elif after == 0:
            self.stdout.write(
                f'Ownership fixed: {before} {SCHEMA} relation(s) handed to {OWNER_ROLE}.'
            )
        else:
            # Not fatal: the app still runs, and the objects it could not
            # reassign are ones it does not own - which is exactly the state
            # this command exists to prevent becoming permanent.
            self.stderr.write(
                f'Ownership incomplete: {after} of {before} {SCHEMA} relation(s) could not be '
                f'reassigned to {OWNER_ROLE} (not owned by this identity).'
            )
