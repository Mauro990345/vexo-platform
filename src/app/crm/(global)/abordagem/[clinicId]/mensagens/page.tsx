import { notFound } from "next/navigation";
import { MensagensView } from "./MensagensView";
import { getApproachMessagesAction, getClinicNameAction, getClinicsForMessagesCopyAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function MensagensPage({ params }: { params: { clinicId: string } }) {
  const [clinicName, messages, otherClinics] = await Promise.all([
    getClinicNameAction(params.clinicId),
    getApproachMessagesAction(params.clinicId),
    getClinicsForMessagesCopyAction(params.clinicId),
  ]);
  if (!clinicName) notFound();

  return (
    <MensagensView
      clinicId={params.clinicId}
      clinicName={clinicName}
      messages={messages}
      otherClinics={otherClinics}
    />
  );
}
