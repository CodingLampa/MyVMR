type AirlineRules = Map<string, string[]>;  // key = "CS:TC"
type GenericRules = Map<string, string[]>;  // key = TC

export function generateVmr(airlineRules: AirlineRules, genericRules: GenericRules): string {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<ModelMatchRuleSet>'];

  const sortedGeneric = [...genericRules.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [tc, models] of sortedGeneric) {
    lines.push(`  <ModelMatchRule TypeCode="${esc(tc)}" ModelName="${esc(models.join('//'))}"/>`);
  }

  const sortedAirline = [...airlineRules.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, models] of sortedAirline) {
    const colonIdx = key.indexOf(':');
    const cs = key.slice(0, colonIdx);
    const tc = key.slice(colonIdx + 1);
    lines.push(`  <ModelMatchRule CallsignPrefix="${esc(cs)}" TypeCode="${esc(tc)}" ModelName="${esc(models.join('//'))}"/>`);
  }

  lines.push('</ModelMatchRuleSet>');
  return lines.join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
