import { COMMON_PASSWORDS } from "./data/common-passwords";

const commonPasswords: ReadonlySet<string> = new Set(COMMON_PASSWORDS);

const KEYBOARD_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;
const KEYBOARD_SEQUENCES = KEYBOARD_ROWS.flatMap((row) => [row, [...row].reverse().join("")]);
const PRODUCT_WORD_WITH_DIGITS = /^(?:password|demi|admin)\d*$/u;
/** Repeating a unit of up to four characters (aaaaaaaa, 12121212, abcdabcd) is as guessable as one character. */
const MAX_REPEATED_UNIT = 4;

function isRepeatedUnit(characters: readonly string[]): boolean {
  for (let unit = 1; unit <= MAX_REPEATED_UNIT && unit < characters.length; unit += 1) {
    if (characters.every((character, index) => character === characters[index % unit])) return true;
  }
  return false;
}

/** Each next character is one code point up (or one down) from the previous; digits wrap 9→0 and 0→9. */
function isSteppedRun(characters: readonly string[], step: 1 | -1): boolean {
  const isDigits = characters.every((character) => /^[0-9]$/u.test(character));
  const isLetters = characters.every((character) => /^[a-z]$/u.test(character));
  if (!isDigits && !isLetters) return false;

  return characters.every((character, index) => {
    if (index === 0) return true;
    const previous = characters[index - 1] ?? "";
    if (isDigits) return Number(character) === (Number(previous) + step + 10) % 10;
    return (character.codePointAt(0) ?? 0) - (previous.codePointAt(0) ?? 0) === step;
  });
}

function isKeyboardRun(value: string): boolean {
  return KEYBOARD_SEQUENCES.some((sequence) => sequence.includes(value));
}

/**
 * True when the password is a common password or a generated guessable pattern. Comparison is case-insensitive; the
 * caller enforces length first, so only values of at least PASSWORD_MIN_LENGTH code points reach this check.
 */
export function isBlocklistedPassword(password: string): boolean {
  const value = password.toLowerCase();
  const characters = [...value];

  return commonPasswords.has(value) ||
    PRODUCT_WORD_WITH_DIGITS.test(value) ||
    isRepeatedUnit(characters) ||
    isSteppedRun(characters, 1) ||
    isSteppedRun(characters, -1) ||
    isKeyboardRun(value);
}
