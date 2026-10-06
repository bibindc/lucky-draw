import { useState } from 'react';
import { Gift } from 'lucide-react';

type ItemVisualProps = { name: string; url: string | null; className?: string };

/** A prize or gift image, or a decorative placeholder when there is none (or it fails to load). */
export default function ItemVisual({ name, url, className = '' }: ItemVisualProps) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) return <img alt={name} className={`item-visual ${className}`} loading="lazy" onError={() => setFailed(true)} src={url} />;
  return <div aria-hidden="true" className={`item-visual placeholder ${className}`}><Gift size={34} strokeWidth={1.5} /></div>;
}
