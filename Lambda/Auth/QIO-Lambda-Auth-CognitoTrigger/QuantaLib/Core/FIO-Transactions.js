// FIO-Transactions

'use strict';
const _ = require('lodash');

module.exports = {

    transactionIsRecognizedIncome: (transaction, userIncome) => _transactionIsRecognizedIncome(transaction, userIncome),
    transactionIsRecognizedTransferOrRefund: transaction => _transactionIsRecognizedTransferOrRefund(transaction),
    addTypeToTransaction: (tx, accounts) => _addTypeToTransaction(tx, accounts),

};

function _transactionIsRecognizedIncome(transaction, userIncome) {
    if (_.inRange(transaction.fioCategoryId, 200, 299)) return true; // transaction is already flagged as income
    if (_.includes(userIncome.tidsForActiveStreams, transaction.transaction_id)) return true; // transaction is included in userIncome
    return false; // transaction is not recognized income
}

function _transactionIsRecognizedTransferOrRefund(transaction) {
    return _.inRange(transaction.fioCategoryId, 100, 199) || _.inRange(transaction.fioCategoryId, 300, 399);
}

function _addTypeToTransaction(tx, accounts) {
    // deposit
    //   regularIncome
    //   investmentIncome
    //   other
    // debit
    //   general
    // transfer (net zero)
    //   general
    //   refund
    //   creditCardPayment
    //   toLiquidSavings
    //   toLongTermSavings
    let accountType = accountTypeForTransaction(tx, accounts);
    // console.log(accountType);
    // console.log(tx.name);
    // console.log(tx.amount);

    if (_transactionIsRecognizedTransferOrRefund(tx)) {
        tx.qioTransactionType = "transfer";
        tx.qioTransactionSubtype = "general";
    }
    else {
        if (accountType == "depository") {
            if (tx.amount > 0) {
                tx.qioTransactionType = "debit";
                tx.qioTransactionSubtype = "general";
            }
            else {
                tx.qioTransactionType = "deposit";
                tx.qioTransactionSubtype = "general";
            }
        }
        else if (accountType == "credit") {
            if (tx.amount > 0) { // Credit card balance has gone up
                tx.qioTransactionType = "debit";
                tx.qioTransactionSubtype = "general";
            }
            else {
                tx.qioTransactionType = "transfer";
                tx.qioTransactionSubtype = "creditCardPaymentOrRefund";
            }
        }
    }
    // console.log(tx.qioTransactionType);
}

function accountTypeForTransaction(tx, accounts) {
    let a = _.find(accounts, A => A.masterAccountId == tx.masterAccountId);
    return a.type;
}
