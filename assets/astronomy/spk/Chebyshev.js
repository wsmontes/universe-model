export function evaluateChebyshev(coefficients, x) {
    const n = coefficients.length;
    if (n === 0)
        return 0;
    if (n === 1)
        return coefficients[0] ?? 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = n - 1; i >= 1; i -= 1) {
        const coefficient = coefficients[i] ?? 0;
        const b = coefficient + 2 * x * b1 - b2;
        b2 = b1;
        b1 = b;
    }
    return (coefficients[0] ?? 0) + x * b1 - b2;
}
export function evaluateChebyshevWithDerivative(coefficients, x) {
    const n = coefficients.length;
    if (n === 0)
        return { value: 0, derivativeByX: 0 };
    if (n === 1)
        return { value: coefficients[0] ?? 0, derivativeByX: 0 };
    let b1 = 0;
    let b2 = 0;
    let d1 = 0;
    let d2 = 0;
    for (let i = n - 1; i >= 1; i -= 1) {
        const coefficient = coefficients[i] ?? 0;
        const b = coefficient + 2 * x * b1 - b2;
        const d = 2 * b1 + 2 * x * d1 - d2;
        b2 = b1;
        b1 = b;
        d2 = d1;
        d1 = d;
    }
    return {
        value: (coefficients[0] ?? 0) + x * b1 - b2,
        derivativeByX: b1 + x * d1 - d2,
    };
}
