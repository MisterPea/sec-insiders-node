import { DerivativeTransaction, Form4Parsed, nonDerivativeTransaction } from "../types.js";

type TransactionColumns = string[];
type AccumulatedTransactions = (string | number | null)[][];
type ProcessDerivNonDerivRtn = {
  transactionColumns: TransactionColumns;
  accumulatedTransactionRows: AccumulatedTransactions;
};

export default function formFourProcessor(flatJson: Form4Parsed) {
  // Possible keys from form 4
  const formData = {
    accession: '',
    issuerCik: '',
    issuerTradingSymbol: '',
    rptOwnerName: '',
    periodOfReport: '',
    documentType: '4',
    aff10b5One: 0,
    isOfficer: 0,
    isDirector: 0,
    isOther: 0,
    officerTitle: null,
    isTenPercentOwner: 0,
    nonDerivativeTransaction: [],
    derivativeTransaction: [],
    footnotes: []
  };

  const isAmendment = (formType: string | number): 0 | 1 => String(formType).toUpperCase().includes('/A') ? 1 : 0;
  const toString = (v: any) => (v === undefined || v === null ? null : String(v));
  const boolToInt = (v: any) => typeof v === 'number' ? v : (v === false ? 0 : 1); // return v if number else, convert to number

  // If values exist in flatJson and formData, assign them
  Object.keys(formData).forEach((key) => {
    if (flatJson[key as keyof Form4Parsed]) {
      (formData as any)[key] = flatJson[key as keyof Form4Parsed];
    }
  });

  const { accession, issuerCik, rptOwnerName, issuerTradingSymbol, periodOfReport, documentType, aff10b5One, isOfficer, isDirector, isOther, officerTitle, isTenPercentOwner, derivativeTransaction, nonDerivativeTransaction, footnotes } = formData;
  const colPrefix = ['accession', 'cik', 'owner_name', 'period_of_report', 'form_type', 'ten5_1', 'is_officer', 'is_director', 'is_other', 'officer_title', 'is_ten_percent'];
  const rowPrefix = [accession, issuerCik, rptOwnerName, periodOfReport, toString(documentType), boolToInt(aff10b5One), boolToInt(isOfficer), boolToInt(isDirector), boolToInt(isOther), officerTitle, boolToInt(isTenPercentOwner)];

  const exerciseIdSeed = `${accession}:${rptOwnerName.replaceAll(' ', '_')}:${issuerTradingSymbol}`;

  const { transactionColumns, accumulatedTransactionRows } = processDerivNonDeriv(derivativeTransaction, nonDerivativeTransaction, exerciseIdSeed);
  const COLS = [...colPrefix, ...transactionColumns];
  const ROWS = accumulatedTransactionRows.map((transaction: any[]) => [...rowPrefix, ...transaction]);
  return { cols: COLS, rows: ROWS };
}

/**
 * Find pairings of derivative/nonDerivative
 * @param derivative 
 * @param nonDerivative 
 */
function processDerivNonDeriv(derivatives: DerivativeTransaction[], nonDerivatives: nonDerivativeTransaction[], exerciseIdSeed: string): ProcessDerivNonDerivRtn {
  // if(!derivatives.length || !nonDerivatives.length) return; // no matches possible

  type DerivativeTotals = {
    strike: number,
    quantity: number;
  };

  let exerciseGroupId = '';

  // derivativeTransaction with transactionCode === 'M'
  const hasDerivativeM = derivatives.some(
    (tx) => tx.transactionCode === 'M'
  );

  // nonDerivativeTransaction: M and A exists
  const hasNonDerivMA = nonDerivatives.some(
    (tx) =>
      tx.transactionCode === 'M' &&
      tx.transactionAcquiredDisposedCode === 'A'
  );

  const hasDerivativeExercise = hasDerivativeM && hasNonDerivMA;

  const accumulatedTransactionRows = [];

  const transactionColumns = [
    'security_type',
    'security_title',
    'transaction_date',
    'acquired_disposed',
    'transaction_shares',
    'conversion_exercise_price',
    'transaction_code',
    'is_option_exercise',
    'is_from_exercise',
    'is_exercise_related_sale',
    'transaction_voluntary',
    'ownership_form',
    'date_exercisable',
    'underlying_title',
    'underlying_shares',
    'sec_owned_post_trx',
    'exercise_group_id',
    'notes'
  ];

  // derivatives
  for (const derivative of derivatives) {

    const {
      securityTitle,
      conversionOrExercisePrice,
      transactionDate,
      transactionCode,
      equitySwapInvolved,
      transactionShares,
      transactionAcquiredDisposedCode,
      exerciseDate,
      expirationDate,
      underlyingSecurityTitle,
      underlyingSecurityShares,
      sharesOwnedFollowingTransaction,
      directOrIndirectOwnership
    } = derivative;

    // The non-conversion transactions - remaining are 'M','C','O', and 'X'
    let isOptionExercise = 1;
    if (transactionCode === 'E' || transactionCode === 'H') {
      isOptionExercise = 0;
    }
    exerciseGroupId = `${exerciseIdSeed}:${underlyingSecurityShares}:${transactionDate.replaceAll('-', '')}:${conversionOrExercisePrice}`;

    // create sql inserts array
    const transactionFieldValues = [
      'derivative',
      securityTitle,
      transactionDate,
      transactionAcquiredDisposedCode,
      transactionShares,
      conversionOrExercisePrice,
      transactionCode,
      isOptionExercise,
      0,
      0,
      null,
      directOrIndirectOwnership,
      exerciseDate,
      underlyingSecurityTitle,
      underlyingSecurityShares,
      sharesOwnedFollowingTransaction,
      exerciseGroupId,
      null
    ];

    accumulatedTransactionRows.push(transactionFieldValues);
  }

  // non-derivatives
  for (const nonDerivative of nonDerivatives) {

    const {
      securityTitle,
      transactionDate,
      transactionCode,
      equitySwapInvolved,
      transactionShares,
      transactionPricePerShare,
      transactionAcquiredDisposedCode,
      sharesOwnedFollowingTransaction,
      directOrIndirectOwnership
    } = nonDerivative;

    const transactionFieldValues = [
      'non-derivative',
      securityTitle,
      transactionDate,
      transactionAcquiredDisposedCode,
      transactionShares,
      transactionPricePerShare,
      transactionCode,
      0,
      transactionCode === 'M' ? 1 : 0, // is from option exercise
      (hasDerivativeExercise && ['F', 'D', 'S'].includes(transactionCode) && transactionAcquiredDisposedCode === 'D') ? 1 : 0, // is options related sale
      null,
      directOrIndirectOwnership,
      null,
      null,
      null,
      sharesOwnedFollowingTransaction,
      (['A', 'M', 'I'].includes(transactionCode) && transactionAcquiredDisposedCode === 'A') ? exerciseGroupId : null, // is in exercise group
      null,
    ];

    accumulatedTransactionRows.push(transactionFieldValues);
  }

  // Ensure no undefined values in accumulatedTransactionRows
  const sanitizedRows = accumulatedTransactionRows.map(row =>
    row.map(value => value === undefined ? null : value)
  );
  return { transactionColumns, accumulatedTransactionRows: sanitizedRows };
}


// {
//   accession: '0001127602-25-020266',
//   issuerCik: 66740,
//   rptOwnerName: 'Goralski Christian T JR',
//   periodOfReport: '2025-08-07',
//   documentType: 4,
//   aff10b5One: 0,
//   isOfficer: 1,
//   isDirector: 0,
//   isOther: 0,
//   officerTitle: 'Group President',
//   isTenPercentOwner: 0,
//   nonDerivativeTransaction: [
//     {
//       securityTitle: 'Common Stock',
//       transactionDate: '2025-08-07',
//       transactionFormType: 4,
//       transactionCode: 'M',
//       equitySwapInvolved: 0,
//       transactionTimeliness: '',
//       transactionShares: 6650,
//       transactionPricePerShare: 130.14,
//       transactionAcquiredDisposedCode: 'A',
//       sharesOwnedFollowingTransaction: 9065.149,
//       directOrIndirectOwnership: 'D'
//     },
//     {
//       securityTitle: 'Common Stock',
//       transactionDate: '2025-08-07',
//       transactionFormType: 4,
//       transactionCode: 'S',
//       equitySwapInvolved: 0,
//       transactionTimeliness: '',
//       transactionShares: 6165,
//       transactionPricePerShare: 150.1801,
//       transactionAcquiredDisposedCode: 'D',
//       sharesOwnedFollowingTransaction: 2900.149,
//       footnoteId: [Array],
//       directOrIndirectOwnership: 'D'
//     }
//   ],
//   derivativeTransaction: [
//     {
//       securityTitle: 'Non-qualified Stock Option (Right to Buy)',
//       conversionOrExercisePrice: 130.14,
//       transactionDate: '2025-08-07',
//       transactionFormType: 4,
//       transactionCode: 'M',
//       equitySwapInvolved: 0,
//       transactionTimeliness: '',
//       transactionShares: 6650,
//       transactionPricePerShare: 0,
//       transactionAcquiredDisposedCode: 'D',
//       exerciseDate: '2017-02-02',
//       expirationDate: '2026-02-02',
//       underlyingSecurityTitle: 'Common Stock',
//       underlyingSecurityShares: 6650,
//       sharesOwnedFollowingTransaction: 0,
//       directOrIndirectOwnership: 'D'
//     }
//   ],
//   footnotes: [ { footnote: [Array] } ]
// }
