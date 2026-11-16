import { AbordagemPrepView } from "./AbordagemPrepView";
import { listClinicsForPrep, getApproachWindowAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AbordagemPrepPage() {
  const [clinics, window] = await Promise.all([listClinicsForPrep(), getApproachWindowAction()]);
  return <AbordagemPrepView clinics={clinics} window={window} />;
}
