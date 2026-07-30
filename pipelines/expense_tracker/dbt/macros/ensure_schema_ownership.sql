{#
  Hand every relation in the target schema to a shared owner role.

  WHY THIS EXISTS
  ---------------
  Postgres assigns a new object to whoever created it. In the cloud that is the
  Databricks App's service principal - and an SP is recreated (with a brand-new
  identity) every time the app is recreated. The objects it built keep pointing
  at the dead role, and the *next* SP cannot SELECT or DROP them even though
  both are members of `omniview_owner`: role membership does not grant access to
  another member's objects.

  The failure is nasty because it is silent until someone loads a page or clicks
  Rebuild, and it is unrecoverable from outside - once a dead SP owns a relation,
  neither REASSIGN OWNED nor ALTER ... OWNER TO works for anyone who is not a
  member of that dead role. Only DROP SCHEMA CASCADE gets it back, because schema
  ownership is separate from object ownership.

  So we reassign at the end of every run, while the creating role is still alive
  and still owns what it just made. `ALTER ... OWNER TO` needs exactly two things,
  both of which hold at that moment: you own the object, and you are a member of
  the target role.

  This covers the whole schema, not just dbt models, so the pandas-staged `stg_*`
  tables are picked up too.

  LOCAL IS A NO-OP
  ----------------
  The guard below returns early when the role is absent. Locally there is a single
  `omniview` role that owns everything and no identity churn, so there is nothing
  to fix and nothing to break.

  Override the role name with `--vars '{shared_owner_role: some_role}'`.
#}

{% macro ensure_schema_ownership() %}
{%- set owner_role = var('shared_owner_role', 'omniview_owner') -%}
do $$
declare
    rec record;
begin
    -- No shared role (local dev): nothing to reassign.
    if not exists (select 1 from pg_roles where rolname = '{{ owner_role }}') then
        return;
    end if;

    for rec in
        select c.relname, c.relkind
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = '{{ target.schema }}'
          and c.relkind in ('r', 'p', 'v', 'm')
          and pg_get_userbyid(c.relowner) <> '{{ owner_role }}'
    loop
        -- Sequences and indexes are deliberately absent: identity sequences
        -- follow their table's owner, and indexes follow their table.
        if rec.relkind in ('r', 'p') then
            execute format('alter table %I.%I owner to %I',
                           '{{ target.schema }}', rec.relname, '{{ owner_role }}');
        elsif rec.relkind = 'v' then
            execute format('alter view %I.%I owner to %I',
                           '{{ target.schema }}', rec.relname, '{{ owner_role }}');
        elsif rec.relkind = 'm' then
            execute format('alter materialized view %I.%I owner to %I',
                           '{{ target.schema }}', rec.relname, '{{ owner_role }}');
        end if;
    end loop;
end $$
{% endmacro %}
