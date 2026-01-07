/**
 * Format a number with specified decimal places
 * @param value The number to format
 * @param decimals Number of decimal places
 * @returns Formatted number as string
 */
export const formatNumber = (value: number | string, decimals: number): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

/**
 * Format a price with appropriate decimal places
 * @param price Price to format
 * @returns Formatted price string
 */
export const formatPrice = (price: number | string): string => {
  return formatNumber(price, 2);
};

/**
 * Format a quantity with appropriate decimal places
 * @param quantity Quantity to format
 * @returns Formatted quantity string
 */
export const formatQuantity = (quantity: number | string): string => {
  return formatNumber(quantity, 6);
};

/**
 * Format a timestamp to a readable time string
 * @param timestamp Timestamp in milliseconds
 * @returns Formatted time string
 */
export const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString();
};

/**
 * Calculate the total value of an order
 * @param price Price per unit
 * @param quantity Number of units
 * @returns Total value as a number
 */
export const calculateTotal = (price: number | string, quantity: number | string): number => {
  const priceNum = typeof price === 'string' ? parseFloat(price) : price;
  const qtyNum = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  
  if (isNaN(priceNum) || isNaN(qtyNum)) return 0;
  return priceNum * qtyNum;
};

/**
 * Format a large number with K, M, B suffixes
 * @param num Number to format
 * @param decimals Number of decimal places
 * @returns Formatted string with suffix
 */
export const formatLargeNumber = (num: number, decimals = 2): string => {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(decimals) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K';
  }
  return num.toFixed(decimals);
};
