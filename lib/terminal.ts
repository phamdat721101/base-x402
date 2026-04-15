// ANSI escape code helpers — zero dependencies
const esc = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;

export const bold = esc("1");
export const dim = esc("2");
export const green = esc("32");
export const yellow = esc("33");
export const red = esc("31");
export const cyan = esc("36");
export const magenta = esc("35");

export const ok = (s: string) => green(`✅ ${s}`);
export const warn = (s: string) => yellow(`⚠  ${s}`);
export const fail = (s: string) => red(`❌ ${s}`);
export const info = (s: string) => cyan(`🔍 ${s}`);
export const money = (s: string) => green(`💰 ${s}`);

export function banner(title: string, lines: string[]) {
  const w = 60;
  console.log(cyan("─".repeat(w)));
  console.log(bold(cyan(`  ${title}`)));
  console.log(cyan("─".repeat(w)));
  lines.forEach((l) => console.log(`  ${l}`));
  console.log(cyan("─".repeat(w)));
}

export function section(title: string) {
  console.log(`\n${bold(yellow(`--- ${title} ---`))}`);
}
