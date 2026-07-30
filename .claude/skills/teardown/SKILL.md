---
name: teardown
description: Destroy every artifact and resource a project created — containers, images, volumes, networks, databases, schemas, tables, users, cloud resources, build output — using the project's artifact manifest as the sole authoritative list, then delete the manifest itself. Destroys only what the manifest lists. Nothing is backed up. Use when the user asks to tear down, destroy, wipe, reset, or clean up a project's resources.
---

# Teardown

Destroy the artifacts a project created, as listed in its **artifact manifest**
(by convention `docs/ARTIFACTS.md` — search for it before concluding it is
missing). **No backups.** The user has accepted the loss; do not offer to dump,
export or snapshot anything.

If there is no manifest, stop and run the `generate-artifact-manifest` skill
first. Never tear down from your own survey of the project — see below for why.

---

## The scoping rule — the one that matters most

**Destroy only what the manifest lists. Nothing else, ever.**

The manifest is not a hint or a starting point. It is the complete and exclusive
set of things you may destroy. Concretely:

- **No wildcards, no prefix matching, no pattern deletes.** Address every
  resource by its exact identifier as written in the manifest.
- **Never use bulk reclamation commands** — anything of the `prune`,
  `--all`, `--force` sweeping variety that deletes by category rather than by
  name. These delete resources the manifest never listed, including other
  projects' work on a shared machine.
- **Never delete a parent to reach a child.** If the manifest lists a directory,
  delete that directory — not the tree above it.
- **If you notice an artifact that looks like the project's but is not in the
  manifest, do not delete it.** Report it at the end as a suspected gap and
  suggest regenerating the manifest. An unlisted artifact is out of scope even
  when you are confident it belongs.
- **If an entry is ambiguous** — an identifier that could match more than one
  real resource — stop and ask. Do not guess.

The manifest exists so teardown is bounded and auditable. Destroying anything
outside it defeats the entire design, and on a shared machine it destroys
someone else's work.

## Also non-negotiable

1. **Confirm before the first destructive command.** Show the user what will be
   destroyed and, from the manifest's reversibility section, what is permanently
   unrecoverable. Get an explicit go-ahead. One confirmation covers the whole
   run — do not re-ask per step.
2. **Honor the manifest's protected section absolutely.** Those entries are
   listed precisely so they survive teardown: source data, secrets, resources
   the project did not create, shared base images, other deployments. Skipping
   them is the correct behavior, not an omission. If the user explicitly names a
   protected item, confirm that one item separately before touching it.
3. **Report honestly.** Say what was destroyed, what was skipped and why, and
   what failed along with its error. Never report a step as done that errored,
   and never quietly widen scope to make a step succeed.

## Order

Follow the manifest's own ordering section if it has one — it was written
against that project's real dependencies. Otherwise apply these general
constraints, which hold almost everywhere:

1. **Delegate to the project's own teardown tooling where it exists.** If the
   project ships a destroy script, an infrastructure-as-code destroy command, or
   a similar purpose-built tool, use it instead of hand-rolling deletes. It
   already encodes correct ordering and existence checks. Prefer any dry-run
   mode first.
2. **Remote/cloud before local.** It is the slowest and most failure-prone tier,
   and local state is often needed to authenticate against it.
3. **Consumers before what they depend on.** Running instances before the
   storage and networks they attach to; a service before its backing store.
   Most platforms refuse to remove a resource still in use.
4. **Disconnect before dropping.** You generally cannot drop a database, unmount
   a volume, or remove a resource you are actively connected to. Connect
   elsewhere, or force-disconnect, first.
5. **Derived before source.** Where one artifact is rebuilt from another, remove
   the derived one first, so a failure midway leaves a recoverable state.
6. **Generated/ephemeral output last.** Build directories, caches and logs are
   the cheapest to lose and the least likely to block anything.

## The manifest itself — last

Once every tier above is done, delete the manifest file. It describes resources
that no longer exist, so leaving it behind is worse than having no manifest at
all: the next teardown would work from a list of ghosts.

Delete it **only after** the other tiers have been verified. If any tier failed,
was skipped, or was deliberately limited in scope, **keep the manifest**, say so,
and explain that it still describes live resources.

If the manifest is version-controlled, note that it is recoverable from history
(for example `git checkout -- <path>`). That is a statement of fact, not a
backup; do not create one.

## Finish

Verify, don't assume. Re-probe each tier with whatever read-only command lists
that resource type, and report as a table: destroyed / skipped / failed. State
plainly that nothing was backed up. Surface any irreversible loss the manifest
flagged, and any recovery window that exists — some platforms soft-delete with a
grace period, and if the manifest records one, restate it with the exact command
and deadline.

Then tell the user **the manifest is gone and how to get it back**: rebuild it by
invoking the **`generate-artifact-manifest`** skill, which re-derives it by
surveying the project. Note that it will find very little until the project is
stood back up — an immediate run against a torn-down project yields a near-empty
manifest, which is correct but rarely useful.
