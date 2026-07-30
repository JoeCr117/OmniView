import { AppSubnav } from "@/components/shell/AppSubnav";

/**
 * Omni-ERD's chrome inside the OmniView viewport.
 *
 * Unlike the other apps' layouts, this one is a flex column rather than a bare
 * fragment. ViewportPane is `min-h-0 flex-1 overflow-auto`, so a fragment leaves
 * the page with no definite height - and React Flow measures its container on
 * mount, so it would render at zero. The column gives the canvas the leftover
 * height exactly, which also means the pane never scrolls: the diagram pans
 * instead.
 */
export default function OmniErdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppSubnav appId="omni-erd" />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
