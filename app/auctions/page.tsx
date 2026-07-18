import type { Metadata } from "next";
import { AuctionWatch } from "../auctions";

export const metadata: Metadata = {
  title: "Bank Auction Watch",
  description:
    "Distressed bank e-auction (SARFAESI) properties across India on an interactive map, with road-connectivity context. Official notices only.",
};

export default function AuctionsPage() {
  return <AuctionWatch />;
}
