import { AbordagemPrepView } from "./AbordagemPrepView";
import { listClinicsForPrep, getApproachWindowAction, getApproachTimingAction, isFollowerToolAvailableAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AbordagemPrepPage() {
  const [clinics, window, timing, showFollowerToolLink] = await Promise.all([
    listClinicsForPrep(),
    getApproachWindowAction(),
    getApproachTimingAction(),
    isFollowerToolAvailableAction(),
  ]);
  return <AbordagemPrepView clinics={clinics} window={window} timing={timing} showFollowerToolLink={showFollowerToolLink} />;
}
