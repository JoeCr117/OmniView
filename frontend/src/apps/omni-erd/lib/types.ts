/**
 * The wire shape of the dialect-agnostic schema document.
 *
 * Mirrors `backend/apps/omni_erd/ir.py` exactly - that module is the definition,
 * this is the transcription. Nothing here knows or cares whether the graph came
 * from Postgres or Unity Catalog, which is the entire point of the indirection.
 */

/** The closed set every engine's types normalise onto. `raw` keeps the
 *  engine's own spelling, which is what actually gets displayed. */
export type BaseType =
  | "string"
  | "integer"
  | "decimal"
  | "float"
  | "boolean"
  | "date"
  | "timestamp"
  | "binary"
  | "json"
  | "array"
  | "struct"
  | "interval"
  | "uuid"
  | "unknown";

export type EntityKind = "table" | "view" | "materialized_view" | "external_table" | "unknown";

/** `declared` came from a real constraint; `inferred_naming` is a guess. */
export type RelationshipOrigin = "declared" | "inferred_naming";

export interface ColumnType {
  raw: string;
  base: BaseType;
}

export interface Column {
  name: string;
  position: number;
  type: ColumnType;
  nullable: boolean;
  default: string | null;
  comment: string | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
}

export interface KeyConstraint {
  name: string | null;
  columns: string[];
}

export interface Entity {
  /** "<namespace>.<name>" - stable across captures, so layouts survive a refresh. */
  id: string;
  namespace: string;
  name: string;
  kind: EntityKind;
  comment: string | null;
  columns: Column[];
  primary_key: KeyConstraint | null;
  unique: KeyConstraint[];
}

export interface RelationshipEnd {
  entity: string;
  columns: string[];
}

export interface Relationship {
  id: string;
  /** The referencing (many) side. Named to match React Flow's own edge type. */
  source: RelationshipEnd;
  /** The referenced (one) side. */
  target: RelationshipEnd;
  cardinality: "many_to_one" | "one_to_one";
  origin: RelationshipOrigin;
  /** 1.0 for anything declared; below that the edge renders dashed. */
  confidence: number;
  note: string | null;
}

export interface SourceInfo {
  id: string;
  dialect: string;
  label: string;
  captured_at: string;
  container: Record<string, string>;
}

export interface SchemaGraph {
  version: string;
  source: SourceInfo;
  entities: Entity[];
  relationships: Relationship[];
}

export interface ErdSource {
  id: string;
  label: string;
  dialect: string;
  description: string;
  namespaces: string[];
}

export interface Position {
  x: number;
  y: number;
}

export type LayoutPositions = Record<string, Position>;
