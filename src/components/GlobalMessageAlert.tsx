"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function GlobalMessageAlert() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const success = searchParams.get("success");
  const error = searchParams.get("error");

  useEffect(() => {
    const message = success || error;
    if (!message) return;
    alert(message);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("success");
    nextParams.delete("error");
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [error, pathname, router, searchParams, success]);

  return null;
}
