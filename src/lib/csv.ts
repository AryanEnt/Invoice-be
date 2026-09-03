export function toCsv(columns: Array<{ key: string; label: string }>, rows: Array<Record<string, string>>): string {
  const header = columns.map((column) => escapeCsv(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column.key] ?? "")).join(","));
  return [header, ...body].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}
