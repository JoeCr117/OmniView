import { UsersTable } from "@/apps/admin-portal/components/UsersTable";

export default function UsersPage() {
  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Users &amp; Access</h1>
      <UsersTable />
    </main>
  );
}
