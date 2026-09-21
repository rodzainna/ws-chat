import { useEffect, useState } from "react";
import { subscribeReauthState, type ReauthState } from "@/lib/apollo";

export function ReauthBanner() {
  const [state, setState] = useState<ReauthState>({
    active: false,
    message: "",
  });

  useEffect(() => subscribeReauthState(setState), []);

  if (!state.active) return null;

  return (
    <div className="sticky top-0 z-50 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      {state.message}
    </div>
  );
}
