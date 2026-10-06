import { prizeImageUrl } from '../api/prizes';
import ItemImage from './ItemImage';

type PrizeImageProps = {
  prize: { id: string; name: string; imageUpdatedAt?: string | null };
  size?: 'thumb' | 'large';
};

/** A prize's picture or placeholder (AC-PRZ-10, AC-PRZ-11). */
export default function PrizeImage({ prize, size = 'thumb' }: PrizeImageProps) {
  return <ItemImage name={prize.name} size={size} url={prizeImageUrl(prize)} />;
}
