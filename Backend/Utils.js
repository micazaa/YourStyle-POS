function roundToTwo(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function toProperCase(str) {
  if (!str) return "";
  return str.toString().toLowerCase().replace(/(^|[\s\-\/])([a-z])/g, (m, sep, chr) => sep + chr.toUpperCase());
}

function numberToWordsPeso(amount) {
  const num = Math.round((amount || 0) * 100) / 100;
  if (num === 0) return "Zero Pesos Only";

  const pesos = Math.floor(Math.abs(num));
  const centavos = Math.round((Math.abs(num) - pesos) * 100);

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function threeDigits(x) {
    let str = "";
    if (x >= 100) { str += ones[Math.floor(x / 100)] + " Hundred "; x %= 100; }
    if (x >= 20) { str += tens[Math.floor(x / 10)] + " "; x %= 10; if (x > 0) str += ones[x] + " "; }
    else if (x > 0) { str += ones[x] + " "; }
    return str.trim();
  }

  function integerToWords(n) {
    if (n === 0) return "Zero";
    const millions = Math.floor(n / 1000000);
    const thousands = Math.floor((n % 1000000) / 1000);
    const remainder = n % 1000;
    let parts = [];
    if (millions > 0) parts.push(threeDigits(millions) + " Million");
    if (thousands > 0) parts.push(threeDigits(thousands) + " Thousand");
    if (remainder > 0) parts.push(threeDigits(remainder));
    return parts.join(" ").trim();
  }

  let result = integerToWords(pesos) + (pesos === 1 ? " Peso" : " Pesos");
  if (centavos > 0) {
    result += " and " + integerToWords(centavos) + (centavos === 1 ? " Centavo" : " Centavos");
  }
  result += " Only";
  return (num < 0 ? "Negative " : "") + result;
}