// ── THORX Engine B — CPX Research embedded widgets ───────────────────────────
// Thin React wrappers over the CPX script tag v2.0 library (loaded via
// @/lib/cpx-script). Config comes from GET /api/surveys → `cpx` (null when
// CPX is unconfigured / user capped / rank-gated) — nothing here renders
// unless the server says the user may actually earn.
//
//   CpxSurveyWall         Design 1 fullscreen widget (Work tab, theme_style 1,
//                         ordered by best money per CPX revenue guidance)
//   CpxSurveyNotification Design 4 popup (bottom-right, portal-wide) — CPX
//                         attributes ~240% average revenue lift to it

import { useEffect, useRef } from "react";
import {
  registerCpxElement,
  unregisterCpxElement,
  type CpxGeneralConfig,
} from "@/lib/cpx-script";

export interface CpxConfig {
  appId: string;
  extUserId: string;
  secureHash: string;
  email: string;
  username: string;
}

const WALL_DIV_ID = "thorx-cpx-wall";
const NOTIFICATION_DIV_ID = "thorx-cpx-notification";

function toGeneral(cpx: CpxConfig): CpxGeneralConfig {
  return {
    appId: cpx.appId,
    extUserId: cpx.extUserId,
    secureHash: cpx.secureHash,
    email: cpx.email ?? "",
    username: cpx.username ?? "",
  };
}

/** Design 1 — fullscreen survey widget embedded in the Engine B Work tab. */
export function CpxSurveyWall({ cpx }: { cpx: CpxConfig }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    registerCpxElement(
      toGeneral(cpx),
      { div_id: WALL_DIV_ID, theme_style: 1, order_by: 2, limit_surveys: 8 },
      node,
    );
    return () => unregisterCpxElement(WALL_DIV_ID);
    // Identity primitives only: a refetch producing an equal config must not
    // re-trigger a script re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpx.appId, cpx.extUserId, cpx.secureHash]);

  return (
    <div
      ref={ref}
      id={WALL_DIV_ID}
      style={{ maxWidth: 950, margin: "0 auto", minHeight: 420 }}
      data-testid="cpx-survey-wall"
    />
  );
}

/** Design 4 — "new survey available" notification, fixed bottom-right. */
export function CpxSurveyNotification({ cpx }: { cpx: CpxConfig }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    registerCpxElement(
      toGeneral(cpx),
      // No text + no link → CPX default copy ("earn XX in XX minutes") with
      // the survey opening directly — the highest-engagement variant.
      { div_id: NOTIFICATION_DIV_ID, theme_style: 4, position: 5, text: "", link: "", newtab: true },
      node,
    );
    return () => unregisterCpxElement(NOTIFICATION_DIV_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpx.appId, cpx.extUserId, cpx.secureHash]);

  return <div ref={ref} id={NOTIFICATION_DIV_ID} aria-hidden="true" />;
}
