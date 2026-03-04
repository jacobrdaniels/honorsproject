import { describe, expect, it } from 'vitest';

import { parseCsvFileContents, parseExpectedFilesList } from './importKenFrench';

describe('importKenFrench helpers', () => {
  it('parses expected file lists with comments', () => {
    expect(parseExpectedFilesList(`
# comment
F-F_Research_Data_Factors.csv

F-F_Momentum_Factor.csv
`)).toEqual([
      'F-F_Research_Data_Factors.csv',
      'F-F_Momentum_Factor.csv',
    ]);
  });

  it('parses Ken French CSV content until the footer section', () => {
    const rows = parseCsvFileContents(`
This file was created using the 202602 CRSP database.

,Mkt-RF,SMB,HML,RF
192607,   2.89,  -2.55,  -2.39,   0.22
192608,   2.64,  -1.14,   3.81,   0.25

 Annual Factors: January-December
`);

    expect(rows).toEqual([
      {
        period: '1926-07-01',
        values: {
          'Mkt-RF': 2.89,
          SMB: -2.55,
          HML: -2.39,
          RF: 0.22,
        },
      },
      {
        period: '1926-08-01',
        values: {
          'Mkt-RF': 2.64,
          SMB: -1.14,
          HML: 3.81,
          RF: 0.25,
        },
      },
    ]);
  });
});
