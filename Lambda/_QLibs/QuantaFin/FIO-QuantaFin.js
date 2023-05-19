// FIO-QuantaFin

'use strict';
require('../QuantaLib/FIO-QuantaLib');

module.exports = {

    streams: require('./FIO-Analysis-Streamification'),
    income: require('./FIO-Analysis-Income'),
    dateNets: require('./FIO-Analysis-DateNets'),
    periods: require('./FIO-Analysis-Periodification'),
    statement: require('./FIO-Analysis-Statementing'),
    savings: require('./FIO-Analysis-Savings'),
    creditUtilization: require('./FIO-Analysis-CreditUtilization'),
    userHome: require('./FIO-Analysis-UserHome'),
    transaction_categorization: require("./FIO-Transaction-Categorize"),
    spending: require('./QIO-Analysis-Spending'),

};
