const DIGRAPHS = new Map([
  ["dž", "џ"], ["Dž", "Џ"], ["DŽ", "Џ"],
  ["lj", "љ"], ["Lj", "Љ"], ["LJ", "Љ"],
  ["nj", "њ"], ["Nj", "Њ"], ["NJ", "Њ"],
]);

const LETTERS = new Map(Object.entries({
  a: "а", b: "б", c: "ц", č: "ч", ć: "ћ", d: "д", đ: "ђ", e: "е", f: "ф", g: "г",
  h: "х", i: "и", j: "ј", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р",
  s: "с", š: "ш", t: "т", u: "у", v: "в", z: "з", ž: "ж",
  A: "А", B: "Б", C: "Ц", Č: "Ч", Ć: "Ћ", D: "Д", Đ: "Ђ", E: "Е", F: "Ф", G: "Г",
  H: "Х", I: "И", J: "Ј", K: "К", L: "Л", M: "М", N: "Н", O: "О", P: "П", R: "Р",
  S: "С", Š: "Ш", T: "Т", U: "У", V: "В", Z: "З", Ž: "Ж",
}));

export function serbianLatinToCyrillic(value) {
  let result = "";
  for (let index = 0; index < value.length;) {
    const pair = value.slice(index, index + 2);
    const digraph = DIGRAPHS.get(pair);
    if (digraph) {
      result += digraph;
      index += 2;
      continue;
    }
    const character = value[index];
    result += LETTERS.get(character) ?? character;
    index += 1;
  }
  return result;
}
