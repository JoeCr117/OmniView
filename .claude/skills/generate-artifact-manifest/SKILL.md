---
name: generate-artifact-manifest
description: Survey a project for every artifact and resource it creates — containers, images, volumes, networks, databases, schemas, tables, views, roles, users, cloud resources and build output — and rewrite the artifact manifest from scratch. Use when the manifest is missing, stale, or after adding infrastructure, a service, a data source, or a deploy target.
---

# Generate the Artifact Manifest

Rewrite the project's **artifact manifest** from scratch by surveying it. The
manifest lives at `docs/ARTIFACTS.md` by convention — if the project already
keeps one elsewhere, rewrite that file in place rather than starting a second.

The output is consumed by the `teardown` skill, which destroys exactly what the
manifest lists and nothing else. That makes this file a demolition authority: a
**missed** artifact leaks and survives teardown, and a **wrongly included** one
gets destroyed. Both errors are expensive, so prefer verified fact over
inference throughout.

## Three rules that shape everything

**Prefer live state over declarations.** Read configuration to learn what
*should* exist, then query the running system for what *does*. Record the live
answer and flag divergence — orphans left by renames, resources created by hand,
declared things that never actually got built. Those gaps are the most valuable
content in the manifest, and they are invisible if you only read config.

**Never duplicate an existing authority.** If some file already owns a set of
resources — an IaC state file, a lockfile, a deploy manifest another script
reads — point at it instead of copying its contents. A second hand-maintained
list of the same resources drifts from the first, and then neither can be
trusted.

**Record only what the project creates.** A dependency the project *uses* but
did not create is not its artifact. Shared base images, pre-existing
infrastructure, someone else's deployment, and the source data the project reads
all belong in the protected section, not the destroyable inventory.

## Survey

Work outward from how the project is built, deployed and run. Not every category
applies to every project; cover the ones that do, and say which you checked.

- **Containers and virtualization** — images built or pulled, containers,
  volumes, networks, and any project/namespace prefix that shapes their names.
  Read the compose/container definitions, then list live.
- **Databases and stores** — databases, schemas, namespaces, buckets, indices.
  Find them in connection settings, migration tooling, and bootstrap or
  provisioning commands.
- **Tables, views and other schema objects** — from migrations and from any
  transformation/modeling layer. Cross-check declarations against what the
  running system actually reports, including each object's real type.
- **Identities and access** — database roles, service accounts, machine
  identities, API keys, secrets, and the grants between them. These are easy to
  miss because nothing in the source tree names them; they are often created at
  runtime or by a platform.
- **Remote and cloud resources** — whatever the deploy path provisions. Defer to
  the deploy tooling's own manifest if one exists, and add only the resources it
  cannot see, such as objects created *inside* a provisioned service.
- **Generated files** — build output, caches, logs, dependency trees, test
  artifacts, scratch directories. Cross-check ignore files against what is
  actually present, and list only paths that exist.
- **Runtime records** — rows and objects the application creates in normal use:
  accounts, sessions, grants, uploads, user-authored content. These are
  destroyed with their store, but listing them separately makes a record-level
  cleanup possible and makes the irreversible ones visible.

Live probes need the relevant systems reachable and authenticated. If one is
unavailable, say so in the manifest rather than guessing — an unverified entry
is worse than a declared gap.

> **Watch for declared-but-never-created objects.** Empty, stubbed or disabled
> definitions frequently register with their tooling — showing up in counts and
> listings — while never producing a real resource. Compare what the tool says
> it *found* against what the running system actually *has*, and record the
> difference.

## Classify every artifact

For each one, decide and record:

- **Destroyable** — created by this project; safe for teardown to delete.
- **Protected** — must never be destroyed, **with a reason for each**. Source
  data, local secrets, pre-existing infrastructure, shared artifacts other
  projects depend on, and any deployment belonging to someone else. Write the
  reason so a future reader cannot talk themselves past it. When in doubt,
  protect it and explain the doubt.
- **Reversibility** — can it be rebuilt, and from what? Teardown takes no
  backups, so this is the only safety net. Be specific about what is
  *irrecoverable*: state that exists in no file, secrets that cannot be
  regenerated to the same value, and anything whose apparent backup is really a
  point-in-time snapshot rather than a live mirror. Note any platform grace
  period (soft deletes, retention windows) with its exact recovery command and
  deadline.

Re-derive these classifications from the project on every run. Do not assume the
previous manifest got them right, and do not copy its protections forward
unexamined — a protection that outlives its reason is how a stale manifest
misleads. The project's own documentation is usually where protection rules and
known-broken state are stated; read it.

## Write it

Replace the manifest wholesale. Keep this section order, because `teardown`
navigates by these headings:

1. **Scope and boundaries** — what counts as an artifact here, and what is
   deliberately excluded.
2. **Inventory**, one section per category surveyed.
3. **Protected — never destroy**, with a reason per entry.
4. **Reversibility**, ordered most to least recoverable.
5. **Teardown ordering**, capturing the real dependencies: consumers before
   their dependencies, disconnect before dropping, derived before source,
   delegate to purpose-built destroy tooling where it exists.

Stamp it with the generation date, and say what was probed live versus read from
declarations. Then report to the user what changed against the previous
manifest — new artifacts, disappeared ones, anything reclassified.

## Close by naming the counterpart skill

End by telling the user that this manifest is what the **`teardown`** skill
consumes: invoking it destroys every artifact listed, restricts itself to
exactly that list, takes no backups, and finishes by deleting the manifest
itself.

Say this as a pointer, not a recommendation. Regenerating a manifest is usually
routine maintenance — after adding infrastructure, a service, or a deploy target
— and most runs should not be followed by a teardown. Name the skill so the user
knows the pair exists and what completes the loop; do not urge them toward it,
and never invoke it yourself off the back of a regeneration.
