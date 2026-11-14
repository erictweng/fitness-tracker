import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines; blanks for null", () => {
    expect(csvCell('Chicken, "grilled"')).toBe('"Chicken, ""grilled"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
  });
  it("neutralises spreadsheet formulas in text", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5 kcal")).toBe("'-5 kcal");
    expect(csvCell(-5)).toBe("-5");
  });
  it("header + rows with a fixed column order", () => {
    expect(toCsv([{ a: 1, b: "x" }, { b: "y" }], ["a", "b"])).toBe("a,b\r\n1,x\r\n,y\r\n");
    expect(toCsv([], ["a"])).toBe("a\r\n");
  });
});
