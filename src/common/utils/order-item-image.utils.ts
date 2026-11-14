function extractAxisImageUrl(axisValues: unknown): string | null {
  if (!axisValues || typeof axisValues !== 'object') {
    return null;
  }

  for (const val of Object.values(axisValues)) {
    if (typeof val !== 'string') continue;
    for (const part of val.split('|')) {
      const trimmed = part.trim();
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/img/')
      ) {
        return trimmed;
      }
    }
  }

  return null;
}

/**
 * Resolves the representative thumbnail path/URL for an order item, prioritizing
 * variant-level imagery before falling back to product-level images.
 */
export function resolveOrderItemImageUrl(orderItem: any): string | null {
  if (!orderItem) return null;

  if (orderItem.variant?.imageUrl) {
    return orderItem.variant.imageUrl;
  }

  const variantAxisImage = extractAxisImageUrl(orderItem.variant?.axisValues);
  if (variantAxisImage) {
    return variantAxisImage;
  }

  if (orderItem.item?.variants && Array.isArray(orderItem.item.variants)) {
    const matchedVariant = orderItem.item.variants.find(
      (v: any) =>
        (orderItem.variantId && v.id === orderItem.variantId) ||
        (orderItem.variant?.id && v.id === orderItem.variant.id),
    );
    if (matchedVariant) {
      if (matchedVariant.imageUrl) {
        return matchedVariant.imageUrl;
      }
      const matchedAxisImage = extractAxisImageUrl(matchedVariant.axisValues);
      if (matchedAxisImage) {
        return matchedAxisImage;
      }
    }
  }

  if (orderItem.item?.mainImage) {
    return orderItem.item.mainImage;
  }
  if (
    Array.isArray(orderItem.item?.images) &&
    orderItem.item.images.length > 0
  ) {
    return orderItem.item.images[0];
  }

  return null;
}
