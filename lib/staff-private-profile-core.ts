export function privateProfileAccessCode(
  fullName: string,
  phoneNumber: string,
) {
  const name = fullName.toLocaleLowerCase().replace(/[^a-z\d]/g, "");
  const digits = phoneNumber.replace(/\D/g, "");
  if (!name || digits.length < 4) return null;
  return `${name}${digits.slice(-4)}`;
}

export function maskPhoneNumber(phoneNumber: string | null | undefined) {
  const digits = String(phoneNumber ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : null;
}
