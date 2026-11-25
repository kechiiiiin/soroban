import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  mergeWithDefaults,
  calculate,
  simulateLoan,
  toNumber,
  yearMarks,
  totalsByYears,
  findCrossoverYear,
} from "../public/calc.js";

function near(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} ± ${tolerance}, got ${actual}`
  );
}

test("検算: 初期値のまま N=10", () => {
  const input = mergeWithDefaults({ years: 10 });
  const result = calculate(input);

  near(result.buy.items.interest, 362, 1, "利息");
  near(result.buy.items.principal, 997, 1, "元金");
  near(-result.buy.items.deduction, 210, 1, "ローン控除");
  near(result.buy.total, 1960, 1, "購入の総額");
  near(result.rent.total, 2336, 1, "賃貸の総額");
});

test("金利変更なし・3000万・35年・1%・N=35: 返済総額が元利均等の公式値と一致", () => {
  const rateChanges = [
    { fromYear: null, rate: null },
    { fromYear: null, rate: null },
    { fromYear: null, rate: null },
  ];
  const loan = simulateLoan({
    principal: 3000,
    termYears: 35,
    initialRate: 1.0,
    rateChanges,
    years: 35,
  });
  const totalPaid = loan.principal + loan.interest;

  const r = 1.0 / 100 / 12;
  const n = 35 * 12;
  const payment = (3000 * r) / (1 - Math.pow(1 + r, -n));
  const expectedTotal = payment * n;

  near(totalPaid, expectedTotal, 0.01, "返済総額");
});

test("N=1: 更新料0回・賃貸保険1回", () => {
  const input = mergeWithDefaults({ years: 1 });
  const result = calculate(input);

  assert.equal(result.rent.items.renewal, 0, "更新料は0回分（0万円）のはず");
  near(result.rent.items.insurance, DEFAULTS.insuranceRent, 0.001, "火災保険は1回分");
});

test("頭金=価格のとき、借入0で利息0・控除0", () => {
  const input = mergeWithDefaults({ years: 10, downPayment: DEFAULTS.price });
  const result = calculate(input);

  assert.equal(result.buy.items.principal, 0);
  assert.equal(result.buy.items.interest, 0);
  assert.equal(result.buy.items.deduction, -0 === result.buy.items.deduction ? -0 : 0);
  near(result.buy.items.deduction, 0, 0.001, "ローン控除");
});

test("toNumber: 空欄・不正値は0扱いで落ちない", () => {
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber("abc"), 0);
  assert.equal(toNumber("1,234"), 1234);
  assert.equal(toNumber("12.5"), 12.5);
});

test("calculate: 不正な入力でも落ちない", () => {
  const input = mergeWithDefaults({
    years: "",
    price: "abc",
    downPayment: null,
    initialRate: undefined,
  });
  assert.doesNotThrow(() => calculate(input));
});

test("totalsByYears: 初期値で years=[10] の結果は既存のN=10総額と一致", () => {
  const input = mergeWithDefaults({});
  const [row] = totalsByYears(input, [10]);

  assert.equal(row.years, 10);
  near(row.buyTotal, 1960, 1, "購入総額");
  near(row.rentTotal, 2336, 1, "賃貸総額");
});

test("yearMarks: 返済期間32年の対象年は5..30,32", () => {
  assert.deepEqual(yearMarks(32), [5, 10, 15, 20, 25, 30, 32]);
});

test("yearMarks: 5の倍数の返済期間はそのまま・5未満は1本・上限50年", () => {
  assert.deepEqual(yearMarks(20), [5, 10, 15, 20]);
  assert.deepEqual(yearMarks(3), [3]);
  assert.deepEqual(yearMarks(0), []);
  assert.deepEqual(yearMarks(60), [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
});

test("findCrossoverYear: 初期値では返済期間中に購入が賃貸を下回る年がある", () => {
  const input = mergeWithDefaults({});
  const year = findCrossoverYear(input, DEFAULTS.loanTermYears);
  assert.ok(typeof year === "number" && year >= 1 && year <= DEFAULTS.loanTermYears);

  const before = calculate({ ...input, years: year - 1 });
  const at = calculate({ ...input, years: year });
  if (year > 1) {
    assert.ok(before.buy.total >= before.rent.total, "逆転の前年はまだ購入が高い/同額のはず");
  }
  assert.ok(at.buy.total < at.rent.total, "その年で購入が賃貸を下回るはず");
});
