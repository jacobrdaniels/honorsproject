import { describe, expect, it } from 'vitest';

import { buildFactorRegressionResponseFromStoredRows, FactorRegressionInputError } from './factorRegression';
import type { StoredFactorRow } from '../db/factorDataRepository';
import type { StoredPriceBar } from '../db/marketDataRepository';
import type { FactorColumnKey, FactorFrequency, FactorRequest } from '../types';

function toIsoDate(dayOffset: number): string {
  const baseDate = new Date('2024-01-02T00:00:00Z');
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
  return baseDate.toISOString().slice(0, 10);
}

function createPriceSeries(symbol: string, returns: number[]): StoredPriceBar[] {
  const rows: StoredPriceBar[] = [];
  let price = 100;

  rows.push({
    symbol,
    tradingDay: toIsoDate(0),
    open: price,
    high: price,
    low: price,
    close: price,
    adjustedClose: price,
    volume: 1000,
  });

  returns.forEach((dailyReturn, index) => {
    price *= 1 + dailyReturn;
    rows.push({
      symbol,
      tradingDay: toIsoDate(index + 1),
      open: price,
      high: price,
      low: price,
      close: price,
      adjustedClose: price,
      volume: 1000,
    });
  });

  return rows;
}

function createFactorRow(
  factorSet: string,
  period: string,
  marketExcess: number,
  smb: number,
  hml: number,
  momentum: number,
  rmw = 0,
  cma = 0,
  riskFree = 0.0001,
): StoredFactorRow {
  return {
    factorSet,
    period,
    marketExcess: marketExcess * 100,
    smb: smb * 100,
    hml: hml * 100,
    momentum: momentum * 100,
    rmw: rmw * 100,
    cma: cma * 100,
    riskFree: riskFree * 100,
  };
}

function buildDailyRegressionFixture(
  factors: FactorColumnKey[],
  observationCount = 90,
): {
  input: FactorRequest;
  priceRows: StoredPriceBar[];
  factorRows: StoredFactorRow[];
} {
  const dailyAlpha = 0.0003;
  const riskFree = 0.0001;
  const returns: number[] = [];
  const factorRows: StoredFactorRow[] = [];

  for (let index = 0; index < observationCount; index += 1) {
    const marketExcess = (((index * 7) % 17) - 8) * 0.0011;
    const smb = (((index * 5) % 13) - 6) * 0.0009;
    const hml = (((index * 3) % 11) - 5) * 0.0008;
    const momentum = (((index * 11) % 19) - 9) * 0.0007;
    const totalReturn = riskFree
      + dailyAlpha
      + (1.2 * marketExcess)
      + (0.4 * smb)
      - (0.6 * hml)
      + (0.25 * momentum);

    returns.push(totalReturn);
    factorRows.push(createFactorRow('us_ff6_daily', toIsoDate(index + 1), marketExcess, smb, hml, momentum, 0.0005, -0.0004, riskFree));
  }

  return {
    input: {
      allocations: 'AAA:100',
      startDate: toIsoDate(0),
      endDate: toIsoDate(observationCount),
      rebalanceMode: 'none',
      method: 'OLS',
      frequency: 'daily' as FactorFrequency,
      factors,
    },
    priceRows: createPriceSeries('AAA', returns),
    factorRows,
  };
}

function firstOfMonth(offset: number): string {
  const baseDate = new Date(Date.UTC(2022, 0, 1));
  baseDate.setUTCMonth(baseDate.getUTCMonth() + offset);
  return baseDate.toISOString().slice(0, 10);
}

function lastDayOfMonthIso(offset: number): string {
  const baseDate = new Date(Date.UTC(2022, 0, 1));
  baseDate.setUTCMonth(baseDate.getUTCMonth() + offset + 1);
  baseDate.setUTCDate(0);
  return baseDate.toISOString().slice(0, 10);
}

function buildMonthlyRegressionFixture(monthCount = 30): {
  input: FactorRequest;
  priceRows: StoredPriceBar[];
  factorRows: StoredFactorRow[];
} {
  const monthlyAlpha = 0.004;
  const monthlyRiskFree = 0.002;
  const daysPerMonth = 20;
  const factorRows: StoredFactorRow[] = [];
  const priceRows: StoredPriceBar[] = [];

  let price = 100;
  let openingDate = new Date(Date.UTC(2021, 11, 31));
  priceRows.push({
    symbol: 'AAA',
    tradingDay: openingDate.toISOString().slice(0, 10),
    open: price,
    high: price,
    low: price,
    close: price,
    adjustedClose: price,
    volume: 1000,
  });

  for (let monthIndex = 0; monthIndex < monthCount; monthIndex += 1) {
    const marketExcess = (((monthIndex * 5) % 11) - 5) * 0.01;
    const smb = (((monthIndex * 3) % 7) - 3) * 0.008;
    const hml = (((monthIndex * 2) % 5) - 2) * 0.006;
    const monthlyReturn = monthlyRiskFree + monthlyAlpha + (1.1 * marketExcess) + (0.3 * smb) - (0.4 * hml);
    const dailyMultiplier = (1 + monthlyReturn) ** (1 / daysPerMonth);

    factorRows.push(createFactorRow(
      'us_ff3_weekly',
      firstOfMonth(monthIndex),
      marketExcess,
      smb,
      hml,
      0,
      0,
      0,
      monthlyRiskFree,
    ));

    const lastDay = new Date(lastDayOfMonthIso(monthIndex));
    for (let dayIndex = 1; dayIndex <= daysPerMonth; dayIndex += 1) {
      const tradingDay = new Date(lastDay);
      tradingDay.setUTCDate(lastDay.getUTCDate() - (daysPerMonth - dayIndex));
      price *= dailyMultiplier;
      priceRows.push({
        symbol: 'AAA',
        tradingDay: tradingDay.toISOString().slice(0, 10),
        open: price,
        high: price,
        low: price,
        close: price,
        adjustedClose: price,
        volume: 1000,
      });
    }

    openingDate = lastDay;
  }

  return {
    input: {
      allocations: 'AAA:100',
      startDate: firstOfMonth(0),
      endDate: firstOfMonth(monthCount - 1),
      rebalanceMode: 'none',
      method: 'OLS',
      frequency: 'monthly' as FactorFrequency,
      factors: ['marketExcess', 'smb', 'hml'],
    },
    priceRows,
    factorRows,
  };
}

describe('factorRegression', () => {
  it('recovers known coefficients from aligned daily factor data for a four-factor selection', () => {
    const fixture = buildDailyRegressionFixture(['marketExcess', 'smb', 'hml', 'momentum']);
    const response = buildFactorRegressionResponseFromStoredRows(
      fixture.input,
      fixture.priceRows,
      fixture.factorRows,
    );

    expect(response.regressionMethod).toBe('OLS');
    expect(response.frequency).toBe('daily');
    expect(response.selectedFactors).toEqual(['marketExcess', 'smb', 'hml', 'momentum']);
    expect(response.summary.observations).toBe(90);
    expect(response.summary.rSquared).toBeCloseTo(1, 4);
    expect(response.summary.annualizedAlpha).toBeCloseTo(7.56, 2);
    expect(response.factors.find((factor) => factor.name === 'MKT-RF')?.exposure).toBeCloseTo(1.2, 3);
    expect(response.factors.find((factor) => factor.name === 'SMB')?.exposure).toBeCloseTo(0.4, 3);
    expect(response.factors.find((factor) => factor.name === 'HML')?.exposure).toBeCloseTo(-0.6, 3);
    expect(response.factors.find((factor) => factor.name === 'MOM')?.exposure).toBeCloseTo(0.25, 3);
    expect(response.coverage.factorStatus).toBe('full');
    expect(response.series).toHaveLength(90);
    expect(response.rolling.length).toBeGreaterThan(0);
    expect(response.riskReturnAttribution.name).toBe('Portfolio');
    expect(response.riskReturnAttribution.terms.map((term) => term.name)).toEqual(['Market', 'SMB', 'HML', 'MOM', 'Alpha']);
    expect(response.riskReturnAttribution.cumulativeReturn).toBeCloseTo(
      response.series[response.series.length - 1]?.cumulativePortfolioReturn ?? 0,
      2,
    );
    expect(response.riskReturnAttribution.terms.reduce((total, term) => total + (term.returnContribution ?? 0), 0)).toBeCloseTo(100, 1);
    expect(response.riskReturnAttribution.terms.reduce((total, term) => total + (term.riskContribution ?? 0), 0)).toBeCloseTo(100, 1);
  });

  it('runs with a user-selected subset of factors and only reports those in the output', () => {
    const fixture = buildDailyRegressionFixture(['marketExcess', 'smb']);
    const response = buildFactorRegressionResponseFromStoredRows(
      fixture.input,
      fixture.priceRows,
      fixture.factorRows,
    );

    expect(response.selectedFactors).toEqual(['marketExcess', 'smb']);
    expect(response.factors.map((factor) => factor.name)).toEqual(['MKT-RF', 'SMB']);
    expect(response.factors.find((factor) => factor.name === 'MKT-RF')?.exposure).toBeDefined();
  });

  it('throws a clear error when too few aligned observations are available', () => {
    const fixture = buildDailyRegressionFixture(['marketExcess'], 10);

    expect(() => buildFactorRegressionResponseFromStoredRows(
      fixture.input,
      fixture.priceRows,
      fixture.factorRows,
    )).toThrowError(FactorRegressionInputError);
    expect(() => buildFactorRegressionResponseFromStoredRows(
      fixture.input,
      fixture.priceRows,
      fixture.factorRows,
    )).toThrowError(/Only 10 aligned daily observations were available/);
  });

  it('rejects factors that are not available at the requested frequency', () => {
    const fixture = buildDailyRegressionFixture(['marketExcess']);
    const weeklyInput: FactorRequest = {
      ...fixture.input,
      frequency: 'weekly',
      factors: ['marketExcess', 'momentum'],
    };

    expect(() => buildFactorRegressionResponseFromStoredRows(
      weeklyInput,
      fixture.priceRows,
      fixture.factorRows,
    )).toThrowError(/weekly factor dataset does not provide MOM/);
  });

  it('rejects an empty factor selection', () => {
    const fixture = buildDailyRegressionFixture(['marketExcess']);
    const emptyInput: FactorRequest = { ...fixture.input, factors: [] };

    expect(() => buildFactorRegressionResponseFromStoredRows(
      emptyInput,
      fixture.priceRows,
      fixture.factorRows,
    )).toThrowError(/at least one factor/);
  });

  it('names the missing factor when a required factor column is absent', () => {
    const fixture = buildDailyRegressionFixture(['marketExcess', 'smb', 'hml', 'momentum']);
    const fixtureWithoutMomentum = {
      ...fixture,
      factorRows: fixture.factorRows.map((row) => ({ ...row, momentum: null })),
    };

    expect(() => buildFactorRegressionResponseFromStoredRows(
      fixtureWithoutMomentum.input,
      fixtureWithoutMomentum.priceRows,
      fixtureWithoutMomentum.factorRows,
    )).toThrowError(/MOM/);
    expect(() => buildFactorRegressionResponseFromStoredRows(
      fixtureWithoutMomentum.input,
      fixtureWithoutMomentum.priceRows,
      fixtureWithoutMomentum.factorRows,
    )).toThrowError(FactorRegressionInputError);
  });

  it('compounds daily portfolio returns into monthly buckets and runs the regression', () => {
    const fixture = buildMonthlyRegressionFixture(30);
    const response = buildFactorRegressionResponseFromStoredRows(
      fixture.input,
      fixture.priceRows,
      fixture.factorRows,
    );

    expect(response.frequency).toBe('monthly');
    expect(response.selectedFactors).toEqual(['marketExcess', 'smb', 'hml']);
    expect(response.summary.observations).toBe(30);
    expect(response.summary.rSquared).toBeGreaterThan(0.99);
    expect(response.factors.find((factor) => factor.name === 'MKT-RF')?.exposure).toBeCloseTo(1.1, 2);
    expect(response.factors.find((factor) => factor.name === 'SMB')?.exposure).toBeCloseTo(0.3, 2);
    expect(response.factors.find((factor) => factor.name === 'HML')?.exposure).toBeCloseTo(-0.4, 2);
    expect(response.series.every((point) => point.period.endsWith('-01'))).toBe(true);
  });
});
