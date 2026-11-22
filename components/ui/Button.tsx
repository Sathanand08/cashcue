const VARIANTS = {
  primary: "bg-cc-primary text-white hover:bg-cc-primary-hover",
  secondary: "border border-cc-border bg-cc-card text-cc-ink hover:bg-cc-bg",
  danger: "bg-cc-danger text-white hover:bg-cc-danger-fg",
  ghost: "text-cc-muted hover:bg-cc-bg hover:text-cc-ink",
} as const;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${VARIANTS[variant]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
