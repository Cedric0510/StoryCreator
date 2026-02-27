function toBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export const allowSelfSignup = toBoolean(
  process.env.NEXT_PUBLIC_ENABLE_SELF_SIGNUP,
  false,
);
