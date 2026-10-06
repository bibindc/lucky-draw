import { useState } from 'react';
import { Gift } from 'lucide-react';

type ItemImageProps = { name: string; url: string | null; size?: 'thumb' | 'large' };

/** An item's picture, or a gift icon when it has none or the image fails to load (prizes, complimentary options). */
export default function ItemImage({ name, url, size = 'thumb' }: ItemImageProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) {
    return <span aria-label={`${name} (no image)`} className={`prize-image placeholder ${size}`} role="img"><Gift size={size === 'large' ? 26 : 17} /></span>;
  }
  return <img alt={name} className={`prize-image ${size}`} loading="lazy" onError={() => setFailed(url)} src={url} />;
}
