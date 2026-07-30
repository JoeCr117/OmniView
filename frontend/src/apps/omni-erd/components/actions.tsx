"use client";

import { createContext, useContext } from "react";

/**
 * What a card can ask the canvas to do.
 *
 * React Flow builds node components itself, so a node cannot be handed props
 * directly - the usual workaround is to stuff callbacks into `node.data`. That
 * is worse than it looks: node data is compared to decide whether to re-render,
 * so an unstable callback re-renders every card on every parent render, and
 * stabilising it with a ref means reading that ref during render, which the
 * React compiler rejects outright.
 *
 * A context sidesteps both. Data stays pure description, the callback stays out
 * of the comparison, and only the cards that actually changed re-render.
 *
 * Lives in its own module rather than in ErdCanvas because TableNode imports it
 * and ErdCanvas imports TableNode.
 */
export interface ErdActions {
  /** Advance one card through all -> keys -> none -> all. */
  cycleMode: (entityId: string) => void;
}

const ErdActionsContext = createContext<ErdActions>({ cycleMode: () => {} });

export const ErdActionsProvider = ErdActionsContext.Provider;

export function useErdActions(): ErdActions {
  return useContext(ErdActionsContext);
}
