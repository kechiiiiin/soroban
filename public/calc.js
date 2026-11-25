// 算盤 (soroban) — 住宅ローンと賃貸の総額比較 計算ロジック
// 純粋関数のみ。DOM には触れない。金額の単位は「万円」。

export const DEFAULTS = {
  years: 10,
  price: 4000,
  downPayment: 0,
  loanTermYears: 35,
  initialRate: 0.8,
  // 金利の変更は最大3行。年の昇順で適用。使わない行は fromYear: null
  rateChanges: [
    { fromYear: 6, rate: 1.3 },
    { fromYear: null, rate: null },
    { fromYear: null, rate: null },
  ],
  feeRate: 7, // 購入時諸費用率（%、物件価格に対して）
  propertyTax: 15, // 固定資産税・都市計画税（万円/年）
  managementFee: 1.5, // 管理費（万円/月）
  repairFund: 1.2, // 修繕積立金（万円/月、初期額）
  repairIncreaseRate: 10, // 修繕積立金の値上がり率（%）
  repairIncreaseInterval: 5, // 値上がりの間隔（年）
  insuranceBuy: 3, // 火災・地震保険（購入・万円/年）
  deductionRate: 0.7, // ローン控除率（%）
  deductionYears: 10, // ローン控除年数
  deductionCap: 3000, // ローン控除の対象残高の上限（万円）
  rent: 18, // 家賃（管理費込み・万円/月）
  depositMonths: 1, // 敷金（か月）
  keyMoneyMonths: 1, // 礼金（か月）
  agentFeeMonths: 1.1, // 仲介手数料（か月）
  guaranteeInitialRate: 50, // 保証会社・初回（家賃に対する%）
  guaranteeAnnual: 1, // 保証会社・2年目から毎年（万円）
  renewalInterval: 2, // 更新料の間隔（年）
  renewalMonths: 1, // 更新料（か月分の家賃）
  insuranceRent: 2, // 火災保険（賃貸・万円）
  insuranceRentInterval: 2, // 火災保険（賃貸）の間隔（年）
  movingCost: 20, // 引っ越し費用（万円・両方に1回）
};

// 文字列・空欄・不正値を数値化する。失敗したら 0（または指定の既定値）
export function toNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

// 指定した年に適用される年利（%）を返す
function rateForYear(year, initialRate, rateChanges) {
  let r = initialRate;
  const valid = (rateChanges || [])
    .filter((c) => c && c.fromYear !== null && c.fromYear !== undefined && c.fromYear !== "" && c.rate !== null && c.rate !== undefined && c.rate !== "")
    .map((c) => ({ fromYear: toNumber(c.fromYear), rate: toNumber(c.rate) }))
    .sort((a, b) => a.fromYear - b.fromYear);
  for (const c of valid) {
    if (year >= c.fromYear) r = c.rate;
  }
  return r;
}

// 毎月の返済額（元利均等）。remainingMonths <= 0 や balance <= 0 のときは 0
function monthlyPayment(balance, annualRatePercent, remainingMonths) {
  if (balance <= 0 || remainingMonths <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return balance / remainingMonths;
  const factor = Math.pow(1 + r, -remainingMonths);
  return (balance * r) / (1 - factor);
}

// ローンを月単位でシミュレーションし、N年分の元金・利息・各年末残高を返す
export function simulateLoan({ principal, termYears, initialRate, rateChanges, years }) {
  const totalMonths = Math.max(0, Math.round(termYears * 12));
  const simMonths = Math.min(Math.round(years * 12), totalMonths);

  let balance = principal;
  let totalPrincipal = 0;
  let totalInterest = 0;
  const yearEndBalances = []; // index 0 = 1年目末

  if (principal <= 0 || totalMonths <= 0) {
    for (let y = 0; y < years; y++) yearEndBalances.push(0);
    return { principal: 0, interest: 0, yearEndBalances };
  }

  let currentRate = null;
  let payment = 0;

  for (let month = 1; month <= totalMonths; month++) {
    const year = Math.floor((month - 1) / 12) + 1;
    const rateThisYear = rateForYear(year, initialRate, rateChanges);
    if (month === 1 || rateThisYear !== currentRate) {
      currentRate = rateThisYear;
      const remainingMonths = totalMonths - (month - 1);
      payment = monthlyPayment(balance, currentRate, remainingMonths);
    }

    const monthlyRate = currentRate / 100 / 12;
    const interest = balance * monthlyRate;
    let principalPaid = payment - interest;
    if (principalPaid > balance) principalPaid = balance;
    if (principalPaid < 0) principalPaid = 0;

    if (month <= simMonths) {
      totalInterest += interest;
      totalPrincipal += principalPaid;
    }

    balance -= principalPaid;
    if (balance < 0) balance = 0;

    if (month % 12 === 0) {
      yearEndBalances.push(balance);
    }
  }
  // 返済期間が終わっても比較年数が長い場合、残りの年は残高0
  while (yearEndBalances.length < years) yearEndBalances.push(0);

  return { principal: totalPrincipal, interest: totalInterest, yearEndBalances };
}

// 修繕積立金の N 年分合計（値上がりを反映、管理費は含まない）
export function calcRepairFundTotal(repairFund, increaseRate, interval, years) {
  let total = 0;
  const iv = Math.max(1, Math.round(interval));
  for (let k = 1; k <= years; k++) {
    const steps = Math.floor((k - 1) / iv);
    const amount = repairFund * Math.pow(1 + increaseRate / 100, steps);
    total += amount * 12;
  }
  return total;
}

// ローン控除の合計（総額から引く額。正の数で返す）
export function calcDeductionTotal(yearEndBalances, years, deductionYears, cap, rate) {
  const n = Math.min(years, deductionYears);
  let total = 0;
  for (let k = 1; k <= n; k++) {
    const balance = yearEndBalances[k - 1] || 0;
    const base = Math.min(balance, cap);
    total += base * (rate / 100);
  }
  return total;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// 購入側の内訳を計算する
export function calcBuy(input) {
  const years = Math.max(0, toNumber(input.years, DEFAULTS.years));
  const price = Math.max(0, toNumber(input.price, DEFAULTS.price));
  const downPayment = Math.max(0, toNumber(input.downPayment, DEFAULTS.downPayment));
  const loanTermYears = Math.max(0, toNumber(input.loanTermYears, DEFAULTS.loanTermYears));
  const initialRate = toNumber(input.initialRate, DEFAULTS.initialRate);
  const rateChanges = input.rateChanges || DEFAULTS.rateChanges;
  const feeRate = toNumber(input.feeRate, DEFAULTS.feeRate);
  const propertyTax = toNumber(input.propertyTax, DEFAULTS.propertyTax);
  const managementFee = toNumber(input.managementFee, DEFAULTS.managementFee);
  const repairFund = toNumber(input.repairFund, DEFAULTS.repairFund);
  const repairIncreaseRate = toNumber(input.repairIncreaseRate, DEFAULTS.repairIncreaseRate);
  const repairIncreaseInterval = toNumber(input.repairIncreaseInterval, DEFAULTS.repairIncreaseInterval);
  const insuranceBuy = toNumber(input.insuranceBuy, DEFAULTS.insuranceBuy);
  const deductionRate = toNumber(input.deductionRate, DEFAULTS.deductionRate);
  const deductionYears = toNumber(input.deductionYears, DEFAULTS.deductionYears);
  const deductionCap = toNumber(input.deductionCap, DEFAULTS.deductionCap);
  const movingCost = Math.max(0, toNumber(input.movingCost, DEFAULTS.movingCost));

  const principal = Math.max(0, price - downPayment);
  const loan = simulateLoan({ principal, termYears: loanTermYears, initialRate, rateChanges, years });

  const feeAmount = price * (feeRate / 100);
  const propertyTaxTotal = propertyTax * years;
  const managementTotal = managementFee * 12 * years;
  const repairTotal = calcRepairFundTotal(repairFund, repairIncreaseRate, repairIncreaseInterval, years);
  const insuranceTotal = insuranceBuy * years;
  const deductionTotal = calcDeductionTotal(loan.yearEndBalances, years, deductionYears, deductionCap, deductionRate);

  const items = {
    principal: round(loan.principal),
    interest: round(loan.interest),
    fee: round(feeAmount),
    tax: round(propertyTaxTotal),
    maintenance: round(managementTotal + repairTotal),
    insurance: round(insuranceTotal),
    deduction: -round(deductionTotal),
    movingCost: round(movingCost),
  };

  const total = round(
    items.principal +
      items.interest +
      items.fee +
      items.tax +
      items.maintenance +
      items.insurance +
      items.deduction +
      items.movingCost
  );

  return { years, items, total };
}

// 賃貸側の内訳を計算する
export function calcRent(input) {
  const years = Math.max(0, toNumber(input.years, DEFAULTS.years));
  const rent = Math.max(0, toNumber(input.rent, DEFAULTS.rent));
  const depositMonths = toNumber(input.depositMonths, DEFAULTS.depositMonths);
  const keyMoneyMonths = toNumber(input.keyMoneyMonths, DEFAULTS.keyMoneyMonths);
  const agentFeeMonths = toNumber(input.agentFeeMonths, DEFAULTS.agentFeeMonths);
  const guaranteeInitialRate = toNumber(input.guaranteeInitialRate, DEFAULTS.guaranteeInitialRate);
  const guaranteeAnnual = toNumber(input.guaranteeAnnual, DEFAULTS.guaranteeAnnual);
  const renewalInterval = Math.max(1, toNumber(input.renewalInterval, DEFAULTS.renewalInterval));
  const renewalMonths = toNumber(input.renewalMonths, DEFAULTS.renewalMonths);
  const insuranceRent = toNumber(input.insuranceRent, DEFAULTS.insuranceRent);
  const insuranceRentInterval = Math.max(1, toNumber(input.insuranceRentInterval, DEFAULTS.insuranceRentInterval));
  const movingCost = Math.max(0, toNumber(input.movingCost, DEFAULTS.movingCost));

  const rentTotal = rent * 12 * years;
  const depositEtc = rent * (depositMonths + keyMoneyMonths + agentFeeMonths);
  const guaranteeInitial = rent * (guaranteeInitialRate / 100);
  const guaranteeTotal = years > 0 ? guaranteeInitial + Math.max(0, years - 1) * guaranteeAnnual : 0;
  const renewalCount = years > 0 ? Math.floor((years - 1) / renewalInterval) : 0;
  const renewalTotal = renewalCount * (rent * renewalMonths);
  const insuranceCount = years > 0 ? Math.ceil(years / insuranceRentInterval) : 0;
  const insuranceTotal = insuranceCount * insuranceRent;

  const items = {
    rent: round(rentTotal),
    depositEtc: round(depositEtc),
    guarantee: round(guaranteeTotal),
    renewal: round(renewalTotal),
    insurance: round(insuranceTotal),
    movingCost: round(movingCost),
  };

  const total = round(
    items.rent + items.depositEtc + items.guarantee + items.renewal + items.insurance + items.movingCost
  );

  return { years, items, total };
}

// 購入・賃貸の両方を計算し、差額も返す
export function calculate(input) {
  const buy = calcBuy(input);
  const rent = calcRent(input);
  const diff = round(rent.total - buy.total); // 正なら購入が安い
  return { buy, rent, diff };
}

export function mergeWithDefaults(input) {
  const merged = { ...DEFAULTS, ...(input || {}) };
  if (!input || !input.rateChanges) merged.rateChanges = DEFAULTS.rateChanges.map((c) => ({ ...c }));
  return merged;
}
