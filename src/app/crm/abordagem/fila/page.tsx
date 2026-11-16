import { FilaView } from "./FilaView";
import { getApproachBoardAction } from "../../(global)/abordagem/actions";

export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const board = await getApproachBoardAction();
  return <FilaView initialAccounts={board.accounts} initialWindow={board.window} />;
}
