/**
 * Chrome-less layout for authentication pages: no header, no sidebar, just
 * centered content. The real login form lands in M6.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-6">{children}</main>;
}
