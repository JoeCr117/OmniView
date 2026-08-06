"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeChange,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

import { autoLayout, mergeLayout } from "../lib/autoLayout";
import {
  type ColumnMode,
  type ViewState,
  cycleNodeMode,
  effectiveMode,
  setDefaultMode,
  setNodeMode,
} from "../lib/displayMode";
import { neighbourhood } from "../lib/focus";
import type { SearchEntry } from "../lib/searchIndex";
import { toggle } from "../lib/selection";
import { toEdges, toNodes, type TableNode as TableNodeType } from "../lib/toFlow";
import type { LayoutPositions, SchemaGraph } from "../lib/types";
import { ErdActionsProvider, type ErdActions } from "./actions";
import { DetailFlyout } from "./DetailFlyout";
import { DisplayControls } from "./DisplayControls";
import { FocusBanner } from "./FocusBanner";
import { SearchBar } from "./SearchBar";
import { SelectionFlyout } from "./SelectionFlyout";
import { TableNode } from "./TableNode";

/**
 * The diagram surface: a dark canvas with a lighter grid, holding one draggable
 * card per table.
 *
 * Pan, zoom, drag, selection, edge routing and the minimap all come from React
 * Flow - none of it is hand-rolled. What this component owns is the four things
 * React Flow can't know: where the nodes start (merged saved + dagre layout),
 * what a node looks like (`TableNode`), how much of each table to show, and
 * when to persist any of it.
 */

// Defined once at module scope, not inline: React Flow warns loudly about a new
// nodeTypes object on every render and remounts every node when it sees one.
const nodeTypes = { erdTable: TableNode };

/** Colours are hardcoded rather than read from CSS tokens because React Flow's
 *  Background paints to a <pattern> fill, which can't take a Tailwind class.
 *  Kept adjacent to the theme they belong to so the pair stays obvious. */
const GRID = {
  dark: { background: "#1e2024", lines: "#33373d" },
  light: { background: "#f4f5f7", lines: "#d9dce1" },
};

const SAVE_DEBOUNCE_MS = 800;

/** Must match the card's `grid-template-rows` transition in TableNode. */
const COLLAPSE_MS = 200;
/** Must match `.erd-resetting` in globals.css. */
const RESET_GLIDE_MS = 320;
/** Must match `.erd-fading` in globals.css. */
const FADE_OUT_MS = 180;

/** The flyout's width plus its margin. Used to keep the inspected table out from
 *  behind the panel describing it. Must track DetailFlyout's `w-[19rem]`. */
const PANEL_WIDTH = 304 + 16;

/**
 * How far `fitView` may zoom out on open.
 *
 * Without a floor this is actively broken on a real schema. `datavault` is a
 * star - 21 tables all pointing at `gold_DimDate` - so dagre gives it two ranks
 * and stacks everything into a single ~7000px column. Fitting that into a 500px
 * viewport lands at about 0.07 zoom, where a table is four unreadable pixels
 * tall and the app looks broken.
 *
 * So the diagram opens at a *readable* zoom showing part of itself, and the
 * minimap and panning do the rest - which is what every ERD tool does with a
 * schema too big for one screen.
 */
const FIT_VIEW = { minZoom: 0.3, maxZoom: 1.1, padding: 0.12 };

interface ErdCanvasProps {
  graph: SchemaGraph;
  savedPositions: LayoutPositions;
  savedView: ViewState;
  onPersist: (positions: LayoutPositions, view?: ViewState) => void;
}

function Canvas({ graph, savedPositions, savedView, onPersist }: ErdCanvasProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const palette = dark ? GRID.dark : GRID.light;
  const reducedMotion = useReducedMotion();

  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView, getNode, setCenter, getZoom } = useReactFlow();
  const [view, setView] = useState<ViewState>(savedView);
  const [resetting, setResetting] = useState(false);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  /** Ctrl-clicked tables, in pick order. Non-empty means the contextual
   *  multi-select flyout is showing instead of the single-table one. Transient,
   *  like the highlight it drives - never persisted. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Transient, and deliberately not persisted: reloading into a mysteriously
   *  three-node diagram would be a bug report, not a restored preference. */
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const initialPositions = useMemo(
    () => mergeLayout(graph, savedPositions, savedView),
    [graph, savedPositions, savedView],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>(
    toNodes(graph, initialPositions, savedView),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(toEdges(graph, savedView));

  // Read committed positions without closing over them: the callbacks below are
  // memoised, and what should be saved is what React Flow holds right now.
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const currentPositions = useCallback(
    (): LayoutPositions =>
      Object.fromEntries(nodesRef.current.map((node) => [node.id, { ...node.position }])),
    [],
  );

  // A new graph (a rebuild landing under the same source) replaces the canvas
  // wholesale. Node *state* is React Flow's, so it has to be told.
  //
  // `view` is deliberately not re-seeded here. DiagramView holds the canvas back
  // until the saved layout has arrived and re-keys it on a source switch, so
  // `savedView` is already correct at mount - and re-seeding would throw away a
  // mode the user had changed since.
  // The latest view, readable without making it a dependency below.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // `view` is deliberately absent from the deps. Rebuilding on a view change is
  // applyView's job; doing it here as well would re-run `toNodes` against
  // `initialPositions` and silently throw away every drag the user has made.
  useEffect(() => {
    setNodes(toNodes(graph, initialPositions, viewRef.current));
    setEdges(toEdges(graph, viewRef.current));
  }, [graph, initialPositions, setNodes, setEdges]);

  /**
   * Re-measure handles for the duration of the collapse tween.
   *
   * React Flow caches each node's handle geometry at mount. Collapsing a card
   * changes which handles exist *and* where they sit, and the CSS transition
   * means the answer differs on every frame - so a single call after the change
   * leaves edges pointing at stale positions for the whole animation, which
   * reads as broken rendering rather than as an animation.
   */
  const frameRef = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const remeasure = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      updateNodeInternals(ids);
      if (reducedMotion) return;

      cancelAnimationFrame(frameRef.current);
      const started = performance.now();
      const tick = () => {
        updateNodeInternals(ids);
        if (performance.now() - started < COLLAPSE_MS) {
          frameRef.current = requestAnimationFrame(tick);
        }
      };
      frameRef.current = requestAnimationFrame(tick);
    },
    [updateNodeInternals, reducedMotion],
  );

  /** Push a new view state into the nodes and edges, re-measure, and persist. */
  const applyView = useCallback(
    (next: ViewState, changed: string[]) => {
      setView(next);
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          data: { ...node.data, mode: next.overrides[node.id] ?? next.defaultMode },
        })),
      );
      setEdges(toEdges(graph, next));
      remeasure(changed);

      // Never save an empty layout. A save carries positions *and* view state
      // together, so persisting before the nodes exist would write `{}` over a
      // perfectly good saved arrangement in order to record a mode change.
      const positions = currentPositions();
      if (Object.keys(positions).length > 0) onPersist(positions, next);
    },
    [graph, setNodes, setEdges, remeasure, onPersist, currentPositions],
  );

  const actions = useMemo<ErdActions>(
    () => ({
      cycleMode: (entityId: string) => applyView(cycleNodeMode(view, entityId), [entityId]),
    }),
    [applyView, view],
  );

  const handleDefaultMode = useCallback(
    (mode: ColumnMode) => {
      // Every card can change, including ones that were only overridden.
      applyView(
        setDefaultMode(view, mode),
        graph.entities.map((entity) => entity.id),
      );
    },
    [applyView, view, graph.entities],
  );

  /**
   * Re-run dagre at the cards' *current* sizes, then fit.
   *
   * This is what makes collapsing worth doing: the layout is recomputed against
   * the heights the cards actually have now, so "collapse everything, then
   * reset" genuinely compacts the diagram rather than merely shortening it.
   */
  const handleReset = useCallback(() => {
    // While focused, lay out only what is on screen. Including the hidden nodes
    // would reserve space for cards nobody can see, leaving holes in the middle
    // of the result.
    const laidOut = focusedId
      ? (() => {
          const { nodeIds, edgeIds } = neighbourhood(graph, focusedId);
          return {
            ...graph,
            entities: graph.entities.filter((e) => nodeIds.has(e.id)),
            relationships: graph.relationships.filter((r) => edgeIds.has(r.id)),
          };
        })()
      : graph;
    const positions = autoLayout(laidOut, view);

    // A one-shot class, not a permanent transition on .react-flow__node: a
    // standing transform transition fights dragging and makes every drag feel
    // like it is on ice.
    if (!reducedMotion) setResetting(true);
    setNodes((current) =>
      current.map((node) => ({ ...node, position: positions[node.id] ?? node.position })),
    );
    // Only persist a whole-diagram layout. A focused reset arranges a subset,
    // and saving that would strand every hidden table wherever it happened to
    // be when focus was applied.
    if (!focusedId) onPersist(positions, view);

    const settle = window.setTimeout(
      () => {
        setResetting(false);
        void fitView({ ...FIT_VIEW, duration: reducedMotion ? 0 : 400 });
      },
      reducedMotion ? 0 : RESET_GLIDE_MS,
    );
    return () => window.clearTimeout(settle);
  }, [graph, view, focusedId, reducedMotion, setNodes, onPersist, fitView]);

  /**
   * Bring a table into the half of the canvas the panel is not covering.
   *
   * The panel is up to 384px of a viewport that is often ~1500px, so a table on
   * the right-hand side would otherwise be hidden by the thing describing it.
   * Nudging the camera left by half the panel width is the difference between
   * polished and irritating.
   */
  const revealNode = useCallback(
    (entityId: string) => {
      const node = getNode(entityId);
      if (!node) return;
      const zoom = getZoom();
      const width = node.measured?.width ?? 260;
      const height = node.measured?.height ?? 80;
      setCenter(
        node.position.x + width / 2 + PANEL_WIDTH / 2 / zoom,
        node.position.y + height / 2,
        { zoom, duration: reducedMotion ? 0 : 400 },
      );
    },
    [getNode, getZoom, setCenter, reducedMotion],
  );

  const inspect = useCallback(
    (entityId: string) => {
      setInspectedId(entityId);
      // React Flow sets `selected` itself for a direct click, but not when the
      // panel navigates via a relationship link - so the ring is set here too,
      // or following an edge would leave the highlight on the previous table.
      setNodes((current) =>
        current.map((node) =>
          node.selected === (node.id === entityId)
            ? node
            : { ...node, selected: node.id === entityId },
        ),
      );
      revealNode(entityId);
    },
    [revealNode, setNodes],
  );

  /**
   * Drive the highlight ring from an explicit set of ids.
   *
   * We own selection rather than leaning on React Flow's own multi-select
   * (`multiSelectionKeyCode` is disabled below), so both the single-table and
   * multi-table paths set `node.selected` the same way - through here.
   */
  const applySelection = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      setNodes((current) =>
        current.map((node) =>
          node.selected === set.has(node.id) ? node : { ...node, selected: set.has(node.id) },
        ),
      );
    },
    [setNodes],
  );

  /** Ctrl-click: toggle a table in or out of the multi-selection. Opens the
   *  contextual flyout (and closes the single-table one) from the very first
   *  click, and no camera move - nudging on every add would be seasick. */
  const toggleMulti = useCallback(
    (entityId: string) => {
      setInspectedId(null);
      setSelectedIds((current) => {
        const next = toggle(current, entityId);
        applySelection(next);
        return next;
      });
    },
    [applySelection],
  );

  /** Plain click: leave any multi-selection and inspect this one table. */
  const selectSingle = useCallback(
    (entityId: string) => {
      setSelectedIds([]);
      inspect(entityId);
    },
    [inspect],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    applySelection([]);
  }, [applySelection]);

  /**
   * Escape clears the multi-selection - the one keyboard route out, now that a
   * stray pane click no longer does it. Only listens while there is a
   * selection to clear, and ignores the key entirely when it originates from a
   * text field: `SearchBar` already owns Escape for collapsing itself, and
   * stealing it here would fight that (and any other) input's own handling.
   */
  useEffect(() => {
    if (selectedIds.length === 0) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      clearSelection();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedIds.length, clearSelection]);

  /**
   * Hide everything not joined to `entityId`, then frame what is left.
   *
   * Uses React Flow's own `hidden` flag rather than filtering the arrays, so
   * node state and positions survive untouched and restoring is instant.
   */
  const focusOn = useCallback(
    (entityId: string) => {
      const { nodeIds, edgeIds } = neighbourhood(graph, entityId);
      setFocusedId(entityId);

      const doomedCount = graph.entities.filter((e) => !nodeIds.has(e.id)).length;
      const apply = () => {
        setNodes((current) =>
          current.map((n) => ({ ...n, className: undefined, hidden: !nodeIds.has(n.id) })),
        );
        setEdges((current) => current.map((e) => ({ ...e, hidden: !edgeIds.has(e.id) })));
        void fitView({
          ...FIT_VIEW,
          nodes: [...nodeIds].map((id) => ({ id })),
          duration: reducedMotion ? 0 : 400,
        });
      };

      if (reducedMotion || doomedCount === 0) {
        apply();
        return;
      }
      // Fade the departing cards first so they dissolve rather than blink out.
      setNodes((current) =>
        current.map((n) => (nodeIds.has(n.id) ? n : { ...n, className: "erd-fading" })),
      );
      window.setTimeout(apply, FADE_OUT_MS);
    },
    [graph, setNodes, setEdges, fitView, reducedMotion],
  );

  const clearFocus = useCallback(() => {
    setFocusedId(null);
    setNodes((current) => current.map((n) => (n.hidden ? { ...n, hidden: false } : n)));
    setEdges((current) => current.map((e) => (e.hidden ? { ...e, hidden: false } : e)));
    void fitView({ ...FIT_VIEW, duration: reducedMotion ? 0 : 400 });
  }, [setNodes, setEdges, fitView, reducedMotion]);

  /**
   * Jump to a search result.
   *
   * Three things have to happen before the camera moves, and all three are easy
   * to forget:
   *  - clear focus, or the target may be one of the nodes focus is hiding and
   *    the viewport flies to nothing;
   *  - expand the target when a *column* was picked, since keys mode may not be
   *    drawing the column that was searched for;
   *  - only then centre, so the measurement is of the final card size.
   */
  const jumpTo = useCallback(
    (entry: SearchEntry) => {
      if (focusedId) clearFocus();
      // A search jump is single-select; leave any multi-selection behind.
      setSelectedIds([]);

      if (entry.kind === "column" && effectiveMode(view, entry.entityId) !== "all") {
        applyView(setNodeMode(view, entry.entityId, "all"), [entry.entityId]);
      }

      setInspectedId(entry.entityId);
      setNodes((current) =>
        current.map((node) =>
          node.selected === (node.id === entry.entityId)
            ? node
            : { ...node, selected: node.id === entry.entityId },
        ),
      );
      // After the expand has been committed, so `measured` reflects the card
      // the user is about to look at.
      window.setTimeout(() => revealNode(entry.entityId), reducedMotion ? 0 : 60);
    },
    [focusedId, clearFocus, view, applyView, setNodes, revealNode, reducedMotion],
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange<TableNodeType>[]) => {
      onNodesChange(changes);

      // Persist only when a drag *ends*. A position change fires on every
      // animation frame while dragging; saving those would be one PUT per frame.
      const dragFinished = changes.some(
        (change) => change.type === "position" && change.dragging === false,
      );
      if (!dragFinished) return;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        // Positions only: a drag must not rewrite the view state, and the
        // backend reads an absent view_state as "leave the stored one alone".
        onPersist(currentPositions());
      }, SAVE_DEBOUNCE_MS);
    },
    [onNodesChange, onPersist, currentPositions],
  );

  return (
    <ErdActionsProvider value={actions}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      // React Flow only fires this when the pointer stayed put, so dragging a
      // table never opens the panel. Ctrl/Cmd-click multi-selects; a plain click
      // inspects one and drops any multi-selection.
      onNodeClick={(event, node) =>
        event.ctrlKey || event.metaKey ? toggleMulti(node.id) : selectSingle(node.id)
      }
      // A bare pane click only dismisses the single-table inspector. Clearing
      // a multi-selection needs a deliberate gesture (Escape, or the flyout's
      // own close button) - a pan-by-dragging surface is too easy to miss-click.
      onPaneClick={() => setInspectedId(null)}
      colorMode={dark ? "dark" : "light"}
      fitView
      fitViewOptions={FIT_VIEW}
      minZoom={0.05}
      maxZoom={2.5}
      // We own multi-selection through onNodeClick, so disable React Flow's own
      // key-driven additive selection - otherwise it would fight us for the
      // `selected` flag on every Ctrl-click.
      multiSelectionKeyCode={null}
      // The diagram is a *view*: tables move, but nobody draws a foreign key by
      // dragging. Connection handles stay for edge anchoring only.
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: false }}
      className={cn("h-full w-full", resetting && "erd-resetting")}
      aria-label={`Entity relationship diagram for ${graph.source.label}`}
    >
      <Background
        variant={BackgroundVariant.Lines}
        gap={20}
        lineWidth={1}
        color={palette.lines}
        bgColor={palette.background}
      />
      {/* One Panel for both, on a single rounded pill: two Panels at the same
          position would overlap, and the shared surface is what makes the pair
          read as one control. Both are equal-height ghost buttons; the search
          grows in place inside the pill and slides Display along, its results
          floating clear below. */}
      <Panel position="top-left">
        <div className="flex items-center gap-1 rounded-lg bg-popover p-1 shadow-sm ring-1 ring-foreground/10">
          <SearchBar graph={graph} onPick={jumpTo} />
          <div className="h-4 w-px shrink-0 bg-border" aria-hidden />
          <DisplayControls
            view={view}
            onDefaultMode={handleDefaultMode}
            onReset={handleReset}
            overrideCount={Object.keys(view.overrides).length}
          />
        </div>
      </Panel>
      {/* Mutually exclusive by construction: a Ctrl-click clears `inspectedId`,
          a plain click clears `selectedIds`. Both flyouts share `FlyoutPanel`,
          so switching cross-fades on the same frame. */}
      {selectedIds.length >= 1 ? (
        <SelectionFlyout
          graph={graph}
          selectedIds={selectedIds}
          onClose={clearSelection}
          onRemove={toggleMulti}
          onSelect={selectSingle}
          onAddBridge={toggleMulti}
        />
      ) : (
        <DetailFlyout
          graph={graph}
          entityId={inspectedId}
          focusedId={focusedId}
          onClose={() => setInspectedId(null)}
          onSelect={inspect}
          onFocus={focusOn}
        />
      )}
      {focusedId && (
        <FocusBanner
          entityName={graph.entities.find((e) => e.id === focusedId)?.name ?? focusedId}
          visible={nodes.filter((node) => !node.hidden).length}
          total={nodes.length}
          onClear={clearFocus}
        />
      )}
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeStrokeWidth={2} className="!bg-card" />
    </ReactFlow>
    </ErdActionsProvider>
  );
}

/** React Flow needs its provider above anything that uses its hooks, and the
 *  store is per-canvas rather than global. */
export function ErdCanvas(props: ErdCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
