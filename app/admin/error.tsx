"use client";

import { RouteError } from "@/components/route-error";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} home={{ href: "/admin", label: "Ke dashboard" }} />;
}
