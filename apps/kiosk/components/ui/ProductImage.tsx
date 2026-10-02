'use client';

import { Coffee } from 'lucide-react';
import { useState } from 'react';
import { assetUrl } from '@/lib/config';

interface Props {
  src: string | null;
  alt: string;
  className?: string;
}

/** Product artwork from the API with a graceful fallback when missing/broken. */
export function ProductImage({ src, alt, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const url = assetUrl(src);
  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-caramel-500/40 to-espresso-700 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Coffee className="size-1/3 text-crema-100/80" aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className={`object-cover ${className}`}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
