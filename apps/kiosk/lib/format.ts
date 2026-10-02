export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

/** "Sugar" + "2" -> "Sugar 2"; "Milk" + "Oat Milk" -> "Oat Milk". */
export function formatOptionLabel(groupName: string, optionName: string): string {
  return /^\d+$/.test(optionName) ? `${groupName} ${optionName}` : optionName;
}

export function pluralize(count: number, word: string, plural = `${word}s`): string {
  return `${count} ${count === 1 ? word : plural}`;
}
