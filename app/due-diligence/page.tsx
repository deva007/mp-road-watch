import type { Metadata } from "next";
import { DueDiligence } from "../due-diligence";

export const metadata: Metadata = {
  title: "Due-Diligence Pack",
  description:
    "Structured land due-diligence for bank auction properties: ownership, circle rates, litigation, CERSAI charges, RERA and road connectivity — all from official public sources.",
};

export default function DueDiligencePage() {
  return <DueDiligence />;
}
