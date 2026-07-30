import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A single headline number.
 *
 * This existed four times over - once each in the Admin Portal's Costs, Jobs
 * and Overview pages plus its Users table - as four slightly different private
 * `Kpi` components. One component now, with the union of what they needed: an
 * optional caption, and an optional href that turns the whole card into a link.
 */
export function KpiCard({
  label,
  value,
  caption,
  href,
  className,
}: {
  label: string;
  value: string | number;
  caption?: string;
  href?: string;
  className?: string;
}) {
  const card = (
    <Card
      className={cn(
        "h-full",
        href && "transition-colors group-hover:border-primary/40 group-hover:bg-accent/40",
        className,
      )}
    >
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        {caption && <CardDescription>{caption}</CardDescription>}
      </CardHeader>
    </Card>
  );

  if (!href) return card;

  return (
    <Link href={href} className="group rounded-xl outline-none focus-visible:ring-3">
      {card}
    </Link>
  );
}
