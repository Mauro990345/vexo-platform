import { FilaView } from "./FilaView";
import { getApproachBoardAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const board = await getApproachBoardAction();
  return <FilaView initialBoard={board} />;
}
