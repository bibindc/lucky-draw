/** Types and calls for the public, read-only API (07-public-website.md §6). */

export type DrawStatus = 'UPCOMING' | 'IN_PROGRESS' | 'RESULTS_SOON' | 'COMPLETED';

export type PublicPrize = {
  id: string;
  name: string;
  description: string | null;
  rank: number;
  valuePaise: number | null;
  quantity: number;
  imageUpdatedAt: string | null;
};

export type PublicDraw = {
  id: string;
  drawNumber: number;
  scheduledAt: string;
  status: DrawStatus;
  prizeCount: number;
  roundsCompleted: number;
  totalRounds: number | null;
  prizes: PublicPrize[];
};

export type PublicWinner = {
  id: string;
  round: number;
  name: string;
  participantNumber: number;
  prize: { name: string; rank: number };
  drawNumber: number;
  drawnAt: string;
};

export type PublicSite = {
  contact: {
    organizerName: string | null;
    contactPhone: string | null;
    whatsappNumber: string | null;
    contactEmail: string | null;
    joinNote: string | null;
  };
  campaign: {
    name: string;
    status: string;
    durationMonths: number;
    drawCount: number;
    perDrawAmountPaise: number;
    totalAmountPaise: number;
  } | null;
  stats: {
    members: number;
    drawsCompleted: number;
    totalDraws: number;
    winners: number;
    prizeUnits: number;
    prizeValuePaise: number;
  } | null;
  draws: PublicDraw[];
  nextDraw: Omit<PublicDraw, 'prizes'> | null;
  complimentaryOptions: { id: string; name: string; description: string | null; valuePaise: number | null; imageUpdatedAt: string | null }[];
  recentWinners: PublicWinner[];
  pastResults: { drawNumber: number; scheduledAt: string; heldAt: string | null; mode: 'AUTOMATIC' | 'MANUAL' | null; winners: PublicWinner[] }[];
};

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export async function getPublicSite(): Promise<PublicSite> {
  const response = await fetch(`${apiBaseUrl}/public/site`);
  if (!response.ok) throw new Error(`The draw details could not be loaded (${response.status}).`);
  return (await response.json()) as PublicSite;
}

/** Public image URL, or null when the item has no image (AC-PUB-10). */
export function imageUrl(collection: 'prizes' | 'complimentary-options', item: { id: string; imageUpdatedAt: string | null }) {
  if (!item.imageUpdatedAt) return null;
  return `${apiBaseUrl}/public/${collection}/${item.id}/image?v=${encodeURIComponent(item.imageUpdatedAt)}`;
}

/** The next not-yet-completed draw that has prizes: what visitors can still win. */
export function nextDrawWithPrizes(site: PublicSite) {
  return site.draws.find((draw) => draw.status !== 'COMPLETED' && draw.prizes.length > 0) ?? null;
}
