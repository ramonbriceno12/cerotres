type BrandProps = {
  className?: string;
  alt?: string;
};

/** Isotype "03" — black bg removed visually via blend on brand surfaces. */
export function BrandIso({ className = 'h-12 w-12', alt = '03' }: BrandProps) {
  return (
    <img
      src="/assets/img/iso.png"
      alt={alt}
      className={`select-none object-contain ${className}`}
      style={{ mixBlendMode: 'lighten' }}
      draggable={false}
    />
  );
}

/** Full wordmark "cero tres". */
export function BrandLogo({ className = 'h-16 w-auto', alt = 'cero tres' }: BrandProps) {
  return (
    <img
      src="/assets/img/logo.png"
      alt={alt}
      className={`select-none object-contain ${className}`}
      style={{ mixBlendMode: 'lighten' }}
      draggable={false}
    />
  );
}

/** Clean menu header: one mark, one line of support. */
export function MenuBrandHero({
  subtitle,
  closedLabel,
}: {
  subtitle: string;
  closedLabel?: string | null;
}) {
  return (
    <header
      className="px-4 pb-4 text-center"
      style={{ paddingTop: 'calc(1.25rem + env(safe-area-inset-top))' }}
    >
      <BrandLogo className="mx-auto h-[4.75rem] w-auto max-w-[15rem] sm:h-[5.25rem] sm:max-w-[17rem]" />
      <p className="mt-3 text-sm text-cream-dim">{subtitle}</p>
      {closedLabel ? (
        <p className="mt-3 inline-flex max-w-full rounded-pill bg-danger/15 px-3 py-1.5 text-xs text-cream">
          {closedLabel}
        </p>
      ) : null}
    </header>
  );
}

/** Fallback mark when a product has no photo. */
export function BrandPlaceholder({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-surface-2 ${className}`}>
      <BrandIso className="h-10 w-10 opacity-90" />
    </div>
  );
}
