import { AppSubnav } from "@/components/shell/AppSubnav";

/** ExpenseTracker's chrome inside the OmniView viewport: its own tab bar. */
export default function ExpenseTrackerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSubnav appId="expense-tracker" />
      {children}
    </>
  );
}
