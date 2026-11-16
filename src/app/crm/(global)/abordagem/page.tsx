import { AbordagemPrepView } from "./AbordagemPrepView";
import { listClinicsForPrep } from "./actions";

export const dynamic = "force-dynamic";

export default async function AbordagemPrepPage() {
  const clinics = await listClinicsForPrep();
  return <AbordagemPrepView clinics={clinics} />;
}
