export interface PasswordStrength {
  level: number;
  label: string;
  color: string;
}

/**
 * Shared password-strength heuristic used across every password-entry
 * surface (register, reset-password) so the visual meter and thresholds
 * never drift between screens.
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { level: 0, label: "", color: "" };
  }

  let strength = 0;
  const checks = {
    length: password.length >= 6,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^a-zA-Z0-9]/.test(password),
  };

  if (checks.length) strength++;
  if (checks.lowercase) strength++;
  if (checks.uppercase) strength++;
  if (checks.number) strength++;
  if (checks.special) strength++;

  if (strength <= 2) {
    return { level: 1, label: "Weak", color: "bg-red-500" };
  } else if (strength === 3) {
    return { level: 2, label: "Fair", color: "bg-orange-500" };
  } else if (strength === 4) {
    return { level: 3, label: "Good", color: "bg-yellow-500" };
  } else {
    return { level: 4, label: "Strong", color: "bg-green-500" };
  }
}
