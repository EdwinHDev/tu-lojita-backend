/**
 * Utilidad de moderación de contenido y filtrado de lenguaje abusivo / estafas en el chat.
 */

// Lista de patrones de lenguaje abusivo, ofensivo severo y amenazas
const ABUSE_PATTERNS = [
  /\b(hij[oa]s?\s*de\s*put[ao]s?|hdp)\b/i,
  /\b(malparid[ao]s?)\b/i,
  /\b(coño\s*de\s*tu\s*madre|cdtm)\b/i,
  /\b(mamag[uü]ev[ao]s?)\b/i,
  /\b(maldit[ao]s?)\b/i,
  /\b(estafador(a)?|ladron(a)?|rater[ao]|estafando)\b/i,
  /\b(te\s*voy\s*a\s*(matar|golpear|partir|quemar))\b/i,
  /\b(mu[eé]rete)\b/i,
];

// Lista de patrones de intentos de fraude, phishing o pagos por canales no autorizados
const SCAM_PATTERNS = [
  /\b(pasa(me)?\s*(tu)?\s*(clave|contrase[nñ]a|token|otp))\b/i,
  /\b(pago\s*por\s*fuera|pagame\s*por\s*fuera)\b/i,
  /\b(transfiere(me)?\s*a\s*mi\s*cuenta\s*personal)\b/i,
  /\b(telegram\.me\/|t\.me\/|bit\.ly\/|tinyurl\.com\/)/i,
];

export interface ModerationResult {
  isValid: boolean;
  reason?: string;
  matchedCategory?: 'ABUSE' | 'SCAM';
}

export function filterChatContent(content: string): ModerationResult {
  if (!content || !content.trim()) {
    return { isValid: true };
  }

  const normalized = content.toLowerCase().trim();

  for (const pattern of ABUSE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isValid: false,
        reason:
          'El mensaje contiene lenguaje ofensivo o inapropiado que infringe nuestras normas comunitarias.',
        matchedCategory: 'ABUSE',
      };
    }
  }

  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isValid: false,
        reason:
          'El mensaje contiene patrones sospechosos de fraude, solicitud de credenciales o transacciones no autorizadas.',
        matchedCategory: 'SCAM',
      };
    }
  }

  return { isValid: true };
}
