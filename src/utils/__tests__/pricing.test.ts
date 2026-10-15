import {
  GST_RATE,
  calculateGST,
  calculateTotalWithGST,
  paymentService,
} from '../../services/payment';

describe('GST calculation', () => {
  it('exposes the 18% rate constant', () => {
    expect(GST_RATE).toBe(18);
  });

  it('calculateGST is exactly round(amount * 0.18)', () => {
    expect(calculateGST(100)).toBe(18);
    expect(calculateGST(0)).toBe(0);
    expect(calculateGST(1000)).toBe(180);
    // rounding cases
    expect(calculateGST(55)).toBe(10); // 9.9 -> 10
    expect(calculateGST(999)).toBe(180); // 179.82 -> 180
    expect(calculateGST(50)).toBe(9); // 9.0 -> 9
  });

  it('calculateGST matches the formula for arbitrary inputs', () => {
    for (const amt of [1, 7, 49, 123, 4567, 99999]) {
      expect(calculateGST(amt)).toBe(Math.round(amt * 0.18));
    }
  });

  it('calculateTotalWithGST adds GST to the base amount', () => {
    expect(calculateTotalWithGST(100)).toBe(118);
    expect(calculateTotalWithGST(0)).toBe(0);
    expect(calculateTotalWithGST(999)).toBe(999 + 180);
  });
});

describe('paymentService.calculateDiscount', () => {
  it('returns the original price when the promo is invalid', () => {
    expect(paymentService.calculateDiscount(1000, { valid: false, message: 'no' }))
      .toEqual({ discountAmount: 0, finalPrice: 1000 });
  });

  it('applies a percentage discount (rounded)', () => {
    expect(paymentService.calculateDiscount(1000, { valid: true, message: 'ok', discount_percent: 10 }))
      .toEqual({ discountAmount: 100, finalPrice: 900 });
    // rounding: 10% of 999 = 99.9 -> 100
    expect(paymentService.calculateDiscount(999, { valid: true, message: 'ok', discount_percent: 10 }))
      .toEqual({ discountAmount: 100, finalPrice: 899 });
  });

  it('applies a flat-amount discount', () => {
    expect(paymentService.calculateDiscount(1000, { valid: true, message: 'ok', discount_amount: 250 }))
      .toEqual({ discountAmount: 250, finalPrice: 750 });
  });

  it('prefers percentage when both percent and amount are present', () => {
    const r = paymentService.calculateDiscount(1000, {
      valid: true, message: 'ok', discount_percent: 10, discount_amount: 500,
    });
    expect(r).toEqual({ discountAmount: 100, finalPrice: 900 });
  });

  it('never lets the final price go below zero', () => {
    expect(paymentService.calculateDiscount(1000, { valid: true, message: 'ok', discount_amount: 5000 }))
      .toEqual({ discountAmount: 5000, finalPrice: 0 });
  });

  it('is a no-op when valid but no discount fields are set', () => {
    expect(paymentService.calculateDiscount(1000, { valid: true, message: 'ok' }))
      .toEqual({ discountAmount: 0, finalPrice: 1000 });
  });
});
