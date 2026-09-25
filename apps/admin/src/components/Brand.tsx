type BrandProps = {
  className?: string;
  alt?: string;
};

/**
 * Admin is light UI — keep the iso inside a dark badge so the black artwork
 * reads as intentional brand chrome, not a floating square.
 */
export function BrandIsoBadge({ className = 'h-9 w-9', alt = '03' }: BrandProps) {
  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-lg bg-stone-950 ${className}`}>
      <img
        src="/assets/img/iso.png"
        alt={alt}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

export function BrandLogoOnDark({ className = 'h-14 w-auto', alt = 'cero tres' }: BrandProps) {
  return (
    <span className="inline-flex overflow-hidden rounded-xl bg-stone-950 p-2">
      <img
        src="/assets/img/logo.png"
        alt={alt}
        className={`object-contain ${className}`}
        draggable={false}
      />
    </span>
  );
}
