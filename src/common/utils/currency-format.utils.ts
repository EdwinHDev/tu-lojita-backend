export interface ExchangeRateEmailContext {
  enabled: boolean;
  rate: number;
  currency?: string;
  symbol?: string;
  source?: string;
  mode?: 'AUTO' | 'MANUAL';
  updatedAt?: string;
}

/**
 * Formats a monetary amount in Bolívares (VES) according to Venezuelan commercial standard (#.##0,00).
 */
export function formatBs(amountInUsd: number, rate: number): string {
  const bs = (amountInUsd || 0) * (rate || 0);
  const formatted = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bs);
  return `Bs. ${formatted}`;
}

/**
 * Generates dual pricing data (USD base + Bolívares reference) for plain text and HTML.
 */
export function formatDualPrice(
  amountInUsd: number,
  rateContext?: ExchangeRateEmailContext | null,
): { usd: string; bs: string | null; combined: string; combinedHtml: string } {
  const num = Number(amountInUsd || 0);
  const usd = `$${num.toFixed(2)}`;

  if (
    !rateContext ||
    rateContext.enabled === false ||
    !rateContext.rate ||
    rateContext.rate <= 0
  ) {
    return {
      usd,
      bs: null,
      combined: usd,
      combinedHtml: `<span style="font-weight: 700; color: #1E293B;">${usd}</span>`,
    };
  }

  const bs = formatBs(num, rateContext.rate);
  return {
    usd,
    bs,
    combined: `${usd} (~ ${bs})`,
    combinedHtml: `<span style="font-weight: 700; color: #1E293B;">${usd}</span> <span style="font-size: 13px; color: #64748B; font-weight: normal;">(~ ${bs})</span>`,
  };
}

/**
 * Renders email-safe HTML for a table cell (e.g., items, subtotals, or order lines).
 */
export function renderDualPriceCellHtml(
  amountInUsd: number,
  rateContext?: ExchangeRateEmailContext | null,
  options?: { align?: 'left' | 'right' | 'center'; usdColor?: string },
): string {
  const align = options?.align || 'right';
  const usdColor = options?.usdColor || '#1E293B';
  const num = Number(amountInUsd || 0);
  const usd = `$${num.toFixed(2)}`;

  if (
    !rateContext ||
    rateContext.enabled === false ||
    !rateContext.rate ||
    rateContext.rate <= 0
  ) {
    return `<div style="text-align: ${align}; font-weight: 600; color: ${usdColor}; font-size: 14px;">${usd}</div>`;
  }

  const bs = formatBs(num, rateContext.rate);
  return `<div style="text-align: ${align};"><div style="font-weight: 700; color: ${usdColor}; font-size: 14px;">${usd}</div><div style="font-size: 11px; color: #64748B; font-weight: 500; margin-top: 2px;">~ ${bs}</div></div>`;
}

/**
 * Renders a subtle notice badge clarifying that the Bolívares reference corresponds to the issuance date.
 */
export function renderIssuanceDateNotice(
  dateFormatted: string,
  rateContext?: ExchangeRateEmailContext | null,
): string {
  if (
    !rateContext ||
    rateContext.enabled === false ||
    !rateContext.rate ||
    rateContext.rate <= 0
  ) {
    return '';
  }

  return `
    <div style="background-color: #FEFCE8; border: 1px solid #FEF08A; border-radius: 10px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; color: #854D0E; text-align: center; line-height: 1.4;">
      ℹ️ <strong>Nota informativa:</strong> La referencia en Bolívares corresponde al día de emisión de este correo (${dateFormatted}), calculada a la tasa oficial del BCV.
    </div>
  `;
}

/**
 * Renders the official BCV exchange rate footnote at the bottom of the email.
 */
export function renderExchangeRateFooterNote(
  dateFormatted: string,
  rateContext?: ExchangeRateEmailContext | null,
): string {
  if (
    !rateContext ||
    rateContext.enabled === false ||
    !rateContext.rate ||
    rateContext.rate <= 0
  ) {
    return '';
  }

  const rateFormatted = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rateContext.rate);

  return `
    <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 16px 0 0 0; line-height: 1.5;">
      * Referencia en Bolívares calculada a la tasa oficial del Banco Central de Venezuela (BCV): Bs. ${rateFormatted} / USD (Fecha de emisión: ${dateFormatted}).
    </p>
  `;
}

