import { DerivativeHolding, DerivativeTransaction, Form4Parsed, nonDerivativeHolding, nonDerivativeTransaction } from "../types.js";

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
    is_amendment: 0,
    aff10b5One: 0,
    isOfficer: 0,
    isDirector: 0,
    isOther: 0,
    officerTitle: null,
    isTenPercentOwner: 0,
    nonDerivativeTransaction: [],
    derivativeTransaction: [],
    nonDerivativeHolding: [],
    derivativeHolding: [],
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

  const { footnotes } = formData;

  let flatNotes = null;
  if (Array.isArray(footnotes)) {
    const footnoteArray: { footnote: any; } = footnotes[0];
    if (typeof footnoteArray === 'object' && footnoteArray.hasOwnProperty('footnote')) {
      flatNotes = Array.isArray(footnoteArray.footnote) ? footnoteArray.footnote.join(' --- ') : footnoteArray.footnote;
    }
  }

  // The prefixes are included with every line of the transaction - This information doesn't change per-transaction. So, if we have an exercise and sale in the same Form 4 it will include the same prefix info for each row of that form.
  const { accession, issuerCik, rptOwnerName, issuerTradingSymbol, periodOfReport, documentType, aff10b5One, isOfficer, isDirector, isOther, officerTitle, isTenPercentOwner, derivativeTransaction, nonDerivativeTransaction, derivativeHolding, nonDerivativeHolding } = formData;
  const colPrefix = ['is_amendment', 'notes', 'accession', 'cik', 'owner_name', 'period_of_report', 'form_type', 'ten5_1', 'is_officer', 'is_director', 'is_other', 'officer_title', 'is_ten_percent'];
  const rowPrefix = [isAmendment(documentType), flatNotes, accession, issuerCik, rptOwnerName, periodOfReport, toString(documentType), boolToInt(aff10b5One), boolToInt(isOfficer), boolToInt(isDirector), boolToInt(isOther), officerTitle, boolToInt(isTenPercentOwner)];

  const exerciseIdSeed = `${accession}:${rptOwnerName.replaceAll(' ', '_')}:${issuerTradingSymbol}`;

  const { transactionColumns, accumulatedTransactionRows } = processDerivNonDeriv(derivativeTransaction, nonDerivativeTransaction, nonDerivativeHolding, derivativeHolding, exerciseIdSeed);

  let COLS = [...colPrefix, ...transactionColumns];
  let ROWS = accumulatedTransactionRows.map((transaction: any[]) => [...rowPrefix, ...transaction]);

  // If no transactions or holdings -- we do this bc if no accumulated transactions, there won't be any prefixes
  if ([derivativeTransaction, nonDerivativeTransaction, nonDerivativeHolding, derivativeHolding].every((v: any[]) => v.length === 0)) {
    COLS = colPrefix;
    ROWS = [rowPrefix];
  }

  return { cols: COLS, rows: ROWS };
}

/**
 * Find pairings of derivative/nonDerivative
 * @param derivative 
 * @param nonDerivative 
 */
function processDerivNonDeriv(
  derivatives: DerivativeTransaction[],
  nonDerivatives: nonDerivativeTransaction[],
  nonDerivativeHoldings: nonDerivativeHolding[],
  derivativeHoldings: DerivativeHolding[],
  exerciseIdSeed: string): ProcessDerivNonDerivRtn {

  let exerciseGroupId = null;

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
    'equity_swap_involved',
    'nature_of_ownership',
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
      transactionShares || 0,
      conversionOrExercisePrice,
      transactionCode,
      equitySwapInvolved || 0,
      null,
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
      transactionShares || 0,
      transactionPricePerShare,
      transactionCode,
      equitySwapInvolved || 0,
      null,
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
    ];

    accumulatedTransactionRows.push(transactionFieldValues);
  }

  // derivative holdings
  for (const derivativeHolding of derivativeHoldings) {

    const {
      securityTitle,
      conversionOrExercisePrice,
      exerciseDate,
      expirationDate,
      underlyingSecurityTitle,
      underlyingSecurityShares,
      sharesOwnedFollowingTransaction,
      directOrIndirectOwnership,

    } = derivativeHolding;

    // create sql inserts array
    const transactionFieldValues = [
      'derivative holding',             // 'security_type',
      securityTitle,                    // 'security_title',
      '',                               // 'transaction_date',
      null,                             // 'acquired_disposed',
      0,                                // 'transaction_shares',
      conversionOrExercisePrice,        // 'conversion_exercise_price',
      'holding',                             // 'transaction_code',
      0,                                // 'equity_swap_involved',
      null,                             // 'nature_of_ownership',
      null,                             // 'is_option_exercise',
      null,                             // 'is_from_exercise',
      null,                             // 'is_exercise_related_sale',
      null,                             // 'transaction_voluntary',
      directOrIndirectOwnership,        // 'ownership_form',
      exerciseDate,                     // 'date_exercisable',
      underlyingSecurityTitle,          // 'underlying_title',
      underlyingSecurityShares,         // 'underlying_shares',
      sharesOwnedFollowingTransaction,  // 'sec_owned_post_trx',
      null,                             // 'exercise_group_id',                     
    ];

    accumulatedTransactionRows.push(transactionFieldValues);
  }

  // non-derivative holdings
  for (const nonDerivativeHolding of nonDerivativeHoldings) {

    const {
      securityTitle,
      sharesOwnedFollowingTransaction,
      directOrIndirectOwnership,

    } = nonDerivativeHolding;

    // create sql inserts array
    const transactionFieldValues = [
      'non-derivative holding',         // 'security_type',
      securityTitle,                    // 'security_title',
      '',                               // 'transaction_date',
      null,                             // 'acquired_disposed',
      0,                                // 'transaction_shares',
      null,                             // 'conversion_exercise_price',
      'holding',                             // 'transaction_code',
      0,                                // 'equity_swap_involved',
      null,                             // 'nature_of_ownership',
      null,                             // 'is_option_exercise',
      null,                             // 'is_from_exercise',
      null,                             // 'is_exercise_related_sale',
      null,                             // 'transaction_voluntary',
      directOrIndirectOwnership,        // 'ownership_form',
      null,                             // 'date_exercisable',
      null,                             // 'underlying_title',
      null,                             // 'underlying_shares',
      sharesOwnedFollowingTransaction,  // 'sec_owned_post_trx',
      null,                             // 'exercise_group_id',                    
    ];

    accumulatedTransactionRows.push(transactionFieldValues);
  }

  // Ensure no undefined values in accumulatedTransactionRows
  const sanitizedRows = accumulatedTransactionRows.map(row =>
    row.map(value => value === undefined ? null : value)
  );

  return { transactionColumns, accumulatedTransactionRows: sanitizedRows };
}

