export const maximum = (values) => values.reduce((a, b) => Math.max(a, b), 0);
export const percentile = (values, fraction) =>
  values.length
    ? [...values].sort((a, b) => a - b)[
        Math.min(values.length - 1, Math.floor(values.length * fraction))
      ]
    : null;
