import { AbordagemPrepView } from "./AbordagemPrepView";
import { listClinicsForPrep, getApproachWindowAction, getApproachTimingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AbordagemPrepPage() {
  const [clinics, window, timing] = await Promise.all([listClinicsForPrep(), getApproachWindowAction(), getApproachTimingAction()]);
  return <AbordagemPrepView clinics={clinics} window={window} timing={timing} />;
}
