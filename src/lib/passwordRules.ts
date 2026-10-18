/** One place for the password rule, used by "choose a new password" and "change password". */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z\u0600-\u06FF]/.test(pw) || !/[0-9]/.test(pw)) return 'Mix letters and numbers.';
  if (/^(.)\1+$/.test(pw)) return 'That password is too simple.';
  return null;
}
