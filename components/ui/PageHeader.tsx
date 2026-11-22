export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      <p className="text-sm font-medium uppercase tracking-[0.14em] text-cc-primary">{eyebrow}</p>
      <h1 className="font-display text-3xl text-cc-ink sm:text-4xl">{title}</h1>
      {description ? <div className="max-w-2xl text-base text-cc-muted">{description}</div> : null}
      {children}
    </header>
  );
}
