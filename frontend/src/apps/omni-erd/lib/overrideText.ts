/**
 * How an override reads as prose: a relation's short name, and the join
 * condition spelled the way SQL would.
 *
 * Shared by the overrides list and the form that writes them, which is why it
 * is here rather than on either one of them.
 */

/** The table's own name. Entity ids are `<namespace>.<name>`, and every row on
 *  this page is in the same namespace, so the prefix is noise. */
export const relationName = (entityId: string) => entityId.split(".").at(-1) ?? entityId;

/** The join as SQL would read it: `a.col = b.col`, composites joined with AND.
 *  Columns are paired positionally, which is exactly how the backend stores and
 *  applies them. */
export function joinCondition(
  sourceEntity: string,
  sourceColumns: readonly string[],
  targetEntity: string,
  targetColumns: readonly string[],
): string {
  const source = relationName(sourceEntity);
  const target = relationName(targetEntity);
  return sourceColumns
    .map((column, index) => `${source}.${column} = ${target}.${targetColumns[index] ?? "?"}`)
    .join(" AND ");
}
