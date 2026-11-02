// Deterministic spoken script for Call reminders. Spec: _scratch/reminders-v2-plan.md D-17 and D.5.
// No network, no React Native imports. Pure, so it is unit-tested.

import type { VoiceLanguage } from '../../types/reminder';

// One emoji part: pictographs, skin tone modifiers, regional indicators, and the variation selectors
// and keycap combining mark (U+FE0E, U+FE0F, U+20E3) that come with emoji.
const EMOJI_PART_RE = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[︎️⃣]/u;
// Zero width joiner. Removed only when it joins emoji; Indic conjuncts keep their ZWJ.
const ZWJ = '‍';
const WHITESPACE_RE = /\s+/g;
const ENDS_WITH_PUNCTUATION_RE = /[.!?]$/;
const ENGLISH_ALREADY_SPOKEN_RE = /^(hey|hi|hello|please|you|it['’]s|time)\b/i;
const KANNADA_RE = /[ಀ-೿]/;
const DEVANAGARI_RE = /[ऀ-ॿ]/;

// Output limit of the reminder-call-audio edge function.
export const SPOKEN_MAX_CHARS = 500;

export function stripEmoji(text: string): string {
  const parts = Array.from(text);
  const isEmojiPart = (p: string | undefined): boolean => p !== undefined && EMOJI_PART_RE.test(p);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (EMOJI_PART_RE.test(p)) continue;
    if (p === ZWJ && (isEmojiPart(parts[i - 1]) || isEmojiPart(parts[i + 1]))) continue;
    out += p;
  }
  return out;
}

function collapse(text: string): string {
  return text.replace(WHITESPACE_RE, ' ').trim();
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

function ensureEnding(text: string): string {
  return ENDS_WITH_PUNCTUATION_RE.test(text) ? text : `${text}.`;
}

// Truncate by code point so a surrogate pair is never split.
function capLength(text: string): string {
  const chars = Array.from(text);
  return chars.length <= SPOKEN_MAX_CHARS ? text : chars.slice(0, SPOKEN_MAX_CHARS).join('');
}

/**
 * Builds the sentence the voice will say.
 * Returns '' when nothing speakable is left (for example, an emoji-only text).
 */
export function spokenScript(text: string, language: VoiceLanguage): string {
  const cleaned = collapse(stripEmoji(text));
  if (cleaned.length === 0) return '';

  let script: string;
  switch (language) {
    case 'hi-IN':
      script = `नमस्ते, आपका रिमाइंडर: ${cleaned}`;
      break;
    case 'mr-IN':
      script = `नमस्कार, तुमचा रिमाइंडर: ${cleaned}`;
      break;
    case 'kn-IN':
      script = `ನಮಸ್ಕಾರ, ನಿಮ್ಮ ಜ್ಞಾಪನೆ: ${cleaned}`;
      break;
    case 'en-IN':
    default:
      if (ENGLISH_ALREADY_SPOKEN_RE.test(cleaned)) {
        script = `Hey, ${cleaned}`;
      } else {
        script = `Hey, you need to ${lowerFirst(cleaned)}`;
      }
      script = ensureEnding(script);
      break;
  }
  return capLength(script);
}

export interface ScriptLanguageHint {
  language: VoiceLanguage | null;
  /** True when the script could be Hindi or Marathi (both use Devanagari). */
  ambiguous: boolean;
}

/**
 * Suggests a voice language from the script of the text, for the editor hint.
 * Kannada script suggests kn-IN. Devanagari suggests hi-IN but is ambiguous (Hindi or Marathi).
 */
export function detectScriptLanguage(text: string): ScriptLanguageHint {
  if (KANNADA_RE.test(text)) return { language: 'kn-IN', ambiguous: false };
  if (DEVANAGARI_RE.test(text)) return { language: 'hi-IN', ambiguous: true };
  return { language: null, ambiguous: false };
}
