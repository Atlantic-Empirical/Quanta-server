'use strict';

const _ = require("lodash");
const qlib = require("../QuantaLib/FIO-QuantaLib");

module.exports = {

    harness: (callback) => {
        flowNotify("us-east-1:69ba80be-9484-423c-9d23-b82c42ebc734", '', [testInput.yesterdayDateNet], testInput.thisWeek, testInput.thisMonth, callback);
    }

};

function flowNotify(userId, items, dateNets, thisWeek, thisMonth, callback) {
    // 🆘⚠️🔴🛑💰💵🏦🏆🏅👆👇☝️👍👎💸💩📈📉🤔😬🤗😖😏🤩😎🤯😳🤭😲🤤😋😉😡🤬😠😤😭😫😩😊☺️😇🙂🤑😨😱😥🔼🔽
    // ❗️✅

    let yesterdayDateNet = _.first(dateNets);
    let transactionCount = 5; //  _.chain(items).map('pulledTransactionCounts.yesterday').reduce((m, i) => m + i).value();

    qlib.notifs.notifyUser({
            userId: userId,
            title: 'Daily Update',
            subtitle: flowNotifSubtitle(yesterdayDateNet.netAmount),
            body: flowNotifBody(yesterdayDateNet, transactionCount, thisWeek, thisMonth),
            badgeCount: transactionCount,
            sound: 'default',
            collapseKey: 1,
            customData: {
                messageType: 1,
                date: yesterdayDateNet.date
            }
        },
        callback);
}

function flowNotifSubtitle(net) {
    if (net == 0) return 'YESTERDAY $' + qlib.obj.financialString(Math.abs(net));
    else return 'YESTERDAY ' + (net > 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(net)) + (net > 0 ? ' ✅' : '❗️');
}

function flowNotifBody(yesterdayDateNet, transactionCount, thisWeek, thisMonth) {
    var body = '';

    // YESTERDAY
    body += '   ' + transactionCount + ' Transaction' + (transactionCount != 1 ? 's' : '');
    body += ': $' + qlib.obj.financial(_.get(yesterdayDateNet, 'income', 0)) + ' In, $' + qlib.obj.financial(Math.abs(_.get(yesterdayDateNet, 'transactions.debits.totalAmount', 0))) + ' Out\n';

    // // WEEK
    // body += 'WEEK ';
    // let weekNet_soFar = _.get(thisWeek, 'periodSummary.netAmount', 0);
    // let weekNet_projection = _.get(thisWeek, 'projection.net', 0);
    // body += (weekNet_soFar >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(weekNet_soFar)) + (weekNet_soFar < 0 ? '❗' : ' ✅');
    // body += ' ⌁ ';
    // body += (weekNet_projection >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(weekNet_projection)) + (weekNet_projection < 0 ? '❗' : ' ✅') + '\n';

    // MONTH
    let monthName = qlib.moment().format('MMMM');
    let monthNet_soFar = _.get(thisMonth, 'periodSummary.netAmount', 0);
    let monthNet_projection = _.get(thisMonth, 'projection.net', 0);
    body += monthName.toUpperCase() + '\n';
    body += '   So far: ' + (monthNet_soFar >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(monthNet_soFar)) + (monthNet_soFar < 0 ? '❗️' : ' ✅') + '\n';
    // body += ' ⌁ ';
    body += '   Projection: ' + (monthNet_projection >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(monthNet_projection)) + (monthNet_projection < 0 ? '❗️' : ' ✅') + '\n';

    // body += 'MONTH ' + (monthNet_soFar >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(monthNet_soFar)) + (monthNet_soFar < 0 ? '❗️' : ' ✅');
    // body += ' ⌁ ';
    // body += (monthNet_projection >= 0 ? '▴' : '▾') + '$' + qlib.obj.financialString(Math.abs(monthNet_projection)) + (monthNet_projection < 0 ? '❗️' : ' ✅') + '\n';

    return body;
}

const testInput = {
    "yesterdayDateNet": {
        "date": "2019-03-27",
        "transactions": {
            "regularIncome": {
                "totalAmount": 0,
                "transactionIds": []
            },
            "transfers": {
                "totalAmount": 0,
                "transactionIds": []
            },
            "debits": {
                "totalAmount": -253.43,
                "transactionIds": [
                    "oY3NKjKVb0TeP1BAMMM5uAnJgzZJ6zsBezBqQ",
                    "bQVpzLzvAbI8qmNdzzzocp5V1KmVwKFqyQq3O",
                    "95ZXpDpz1Psb1VdAooomf5rkNaKkeaHdjMdEK",
                    "5maXpdpew6tqMVy8xxxoceAna0dn60tBPpB81",
                    "78JXe6enL9FOL05mXXXjs7KAdpvA0pTQM9QXr"
                ],
                "transactions": [{
                        "transaction_id": "oY3NKjKVb0TeP1BAMMM5uAnJgzZJ6zsBezBqQ",
                        "amount": 25.43,
                        "date": "2019-03-27",
                        "name": "Amazon",
                        "fioCategoryId": 1000,
                        "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                    },
                    {
                        "transaction_id": "bQVpzLzvAbI8qmNdzzzocp5V1KmVwKFqyQq3O",
                        "amount": 13.32,
                        "date": "2019-03-27",
                        "name": "Lyft",
                        "fioCategoryId": 6000,
                        "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                    },
                    {
                        "transaction_id": "95ZXpDpz1Psb1VdAooomf5rkNaKkeaHdjMdEK",
                        "amount": 55,
                        "date": "2019-03-27",
                        "name": "THE ECONOMIST NEWSPAPER",
                        "fioCategoryId": 4000,
                        "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                    },
                    {
                        "transaction_id": "5maXpdpew6tqMVy8xxxoceAna0dn60tBPpB81",
                        "amount": 157.69,
                        "date": "2019-03-27",
                        "name": "Amazon",
                        "fioCategoryId": 1000,
                        "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                    },
                    {
                        "transaction_id": "78JXe6enL9FOL05mXXXjs7KAdpvA0pTQM9QXr",
                        "amount": 1.99,
                        "date": "2019-03-27",
                        "name": "Google",
                        "fioCategoryId": 4000,
                        "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                    }
                ]
            },
            "deposits": {
                "totalAmount": 0,
                "transactionIds": []
            },
            "totalAmount": -253.43
        },
        "netAmount": -253.43,
        "income": 0
    },
    "thisWeek": {
        "periodId": "2019-W13",
        "windowSize": 7,
        "startDate": "2019-03-25",
        "endDate": "2019-03-31",
        "daysInRange": 7,
        "daysRemainingInPeriod": 4,
        "periodSummary": {
            "netAmount": -778.64,
            "income": 0,
            "transactions": {
                "totalAmount": -778.64,
                "deposits": {
                    "totalAmount": 0,
                    "transactionIds": []
                },
                "debits": {
                    "totalAmount": -778.64,
                    "transactionIds": [
                        "oY3NKjKVb0TeP1BAMMM5uAnJgzZJ6zsBezBqQ",
                        "bQVpzLzvAbI8qmNdzzzocp5V1KmVwKFqyQq3O",
                        "95ZXpDpz1Psb1VdAooomf5rkNaKkeaHdjMdEK",
                        "5maXpdpew6tqMVy8xxxoceAna0dn60tBPpB81",
                        "78JXe6enL9FOL05mXXXjs7KAdpvA0pTQM9QXr",
                        "1j0XprpNVgFgvVJNRRRbH7DZOYLze6hmnKbvV",
                        "dvdnZAVmw7cLJRRzrogmiLBwOQ9Lv1Ib4RmdB",
                        "PJkpzgzD7XfzDrvygggosEpq1RNYLzFmokwxk",
                        "ZE8Ozgz31Ls3nDgx111McdLoge5o1efRBZRwv",
                        "gEwOLBL94ysJVYX14446fB5e4DYeVDHqwpqPO",
                        "ndymERV7K1iqODDQdrvVTp5A5qBXYqFAQpPwN"
                    ],
                    "transactions": [{
                            "transaction_id": "oY3NKjKVb0TeP1BAMMM5uAnJgzZJ6zsBezBqQ",
                            "amount": 25.43,
                            "date": "2019-03-27",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "bQVpzLzvAbI8qmNdzzzocp5V1KmVwKFqyQq3O",
                            "amount": 13.32,
                            "date": "2019-03-27",
                            "name": "Lyft",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "95ZXpDpz1Psb1VdAooomf5rkNaKkeaHdjMdEK",
                            "amount": 55,
                            "date": "2019-03-27",
                            "name": "THE ECONOMIST NEWSPAPER",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "5maXpdpew6tqMVy8xxxoceAna0dn60tBPpB81",
                            "amount": 157.69,
                            "date": "2019-03-27",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "78JXe6enL9FOL05mXXXjs7KAdpvA0pTQM9QXr",
                            "amount": 1.99,
                            "date": "2019-03-27",
                            "name": "Google",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "1j0XprpNVgFgvVJNRRRbH7DZOYLze6hmnKbvV",
                            "amount": 63.66,
                            "date": "2019-03-26",
                            "name": "Conoco",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "dvdnZAVmw7cLJRRzrogmiLBwOQ9Lv1Ib4RmdB",
                            "amount": 150,
                            "date": "2019-03-26",
                            "name": "CHECKCARD SAN FRANCISCO CRO SAN FRANCISCO CA ON 03/24",
                            "fioCategoryId": 0,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "PJkpzgzD7XfzDrvygggosEpq1RNYLzFmokwxk",
                            "amount": 46.18,
                            "date": "2019-03-26",
                            "name": "Walgreens",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "ZE8Ozgz31Ls3nDgx111McdLoge5o1efRBZRwv",
                            "amount": 85.39,
                            "date": "2019-03-26",
                            "name": "CAVIAR FOOD DELIVERY",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "gEwOLBL94ysJVYX14446fB5e4DYeVDHqwpqPO",
                            "amount": 29.98,
                            "date": "2019-03-26",
                            "name": "Lyft",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "ndymERV7K1iqODDQdrvVTp5A5qBXYqFAQpPwN",
                            "amount": 150,
                            "date": "2019-03-25",
                            "name": "CHECKCARD 03/24 SAN FRANCISCO CROSSFIT",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        }
                    ]
                },
                "transfers": {
                    "totalAmount": 0,
                    "transactionIds": []
                },
                "regularIncome": {
                    "totalAmount": 0,
                    "transactionIds": []
                }
            },
            "balances": [{
                    "accountSubtype": "savings",
                    "startingBalance": 0.03,
                    "endingBalance": 0.03
                },
                {
                    "accountSubtype": "checking",
                    "startingBalance": 23437.77,
                    "endingBalance": 23137.77
                },
                {
                    "accountSubtype": "credit card",
                    "startingBalance": 8776.64,
                    "endingBalance": 9255.28
                }
            ],
            "spending": {
                "actual": -778.64,
                "target": -1,
                "projected": -2679.48
            }
        },
        "dayNets": [-253.43, -375.21, -150],
        "includesEndOfData": false,
        "projection": {
            "incomeTotal": 0,
            "spendTotal": -2679.48,
            "net": -2679.48
        },
        "userId": "us-east-1:69ba80be-9484-423c-9d23-b82c42ebc734",
        "createdTimestamp": 1553792991334
    },
    "thisMonth": {
        "periodId": "2019-03",
        "windowSize": 30,
        "startDate": "2019-03-01",
        "endDate": "2019-03-31",
        "daysInRange": 31,
        "daysRemainingInPeriod": 4,
        "periodSummary": {
            "netAmount": -1265.87,
            "income": 6873.2,
            "transactions": {
                "totalAmount": -8139.07,
                "deposits": {
                    "totalAmount": 0,
                    "transactionIds": []
                },
                "debits": {
                    "totalAmount": -8139.07,
                    "transactionIds": [
                        "oY3NKjKVb0TeP1BAMMM5uAnJgzZJ6zsBezBqQ",
                        "bQVpzLzvAbI8qmNdzzzocp5V1KmVwKFqyQq3O",
                        "95ZXpDpz1Psb1VdAooomf5rkNaKkeaHdjMdEK",
                        "5maXpdpew6tqMVy8xxxoceAna0dn60tBPpB81",
                        "78JXe6enL9FOL05mXXXjs7KAdpvA0pTQM9QXr",
                        "1j0XprpNVgFgvVJNRRRbH7DZOYLze6hmnKbvV",
                        "dvdnZAVmw7cLJRRzrogmiLBwOQ9Lv1Ib4RmdB",
                        "PJkpzgzD7XfzDrvygggosEpq1RNYLzFmokwxk",
                        "ZE8Ozgz31Ls3nDgx111McdLoge5o1efRBZRwv",
                        "gEwOLBL94ysJVYX14446fB5e4DYeVDHqwpqPO",
                        "ndymERV7K1iqODDQdrvVTp5A5qBXYqFAQpPwN",
                        "qMmbA4AY7qFNzqo0666afvjzKkbV9RIJDXNYV",
                        "34rXpapvMdC97KrZwww5U1YkrKNMR7cKo8D5a",
                        "BqMXzAzEvkuAVnODEEEgC4YLDn8aQrH93o4pA",
                        "vMjb4645dPF43YExqqqjs36901KAkycmpBR8E",
                        "kE1Oqkq08NsJa5Z3888At4jqdALgEVHRb4gj7",
                        "yMabJ1JoL0FVQOdZyyygsNDK4Zm9BwHORL6Mz",
                        "KjqYzgz5ZxF1akPV333xTkr53j0XveHQyZkXk",
                        "APOXzkzBAJIyjo7VDDD8h7zpgvBL51I6wko97",
                        "0zpdqb8RKyuoZ11XE4BAFJDv47Jr4wfrmAogd",
                        "vB4A1m0DYJik5EEVapLeHr6nz1rxzeCmAVzoX",
                        "M43pzgzwmxCVKmENRRRKUo4v98w63pHMpKmaZ",
                        "RZvXzgzPVOt0wadVoo8ntxPPyBBEM6HyejO6y",
                        "wMrbaLa9wgFP3EOeBBnJi0PxvKw4myHLyq3XL",
                        "dvdnZAVmw7cLJRRzrogbsOn3R4KoyYHbmmxLj",
                        "LrBNzMzd5xCeQA5PjjEOTZ5408EbyPC0mDx7J",
                        "mZ3DMan7yLudVPPMqynBHg4k9poB3vSMwwLQY",
                        "6JxXpwpN6LfdpvKRwwj4hN4QnMe9EvHaykjKw",
                        "Lvz8Q0aykZcqg558VKRZCmQ5MYk8ebU066nxK",
                        "bQVpzLzvAbI8qmNdzzj8FpN3dAR49KtqVngvJ",
                        "95ZXpDpz1Psb1VdAooabs5DbxM3ZOaCdL1kzk",
                        "w3avPoO1NZiNmOOVZvL1hAkPnM1KL4ULnnjgO",
                        "78JXe6enL9FOL05mXXrOI7jObokx3ptQaeDr5",
                        "6opPAzm4d8tYNKK8V5AZFJy4g87MD9IaBB4md",
                        "gEwOLBL94ysJVYX1448JsBZPg6OoJDIqvJ396",
                        "ZE8Ozgz31Ls3nDgx11v3tdQ9R6XrveURqmV7Q",
                        "Lvz8Q0aykZcqg558VKRbuZP3AJAx4BC0B01R7",
                        "OxKpzEzLgPIKVjz3DDAKFmBq8yQr46t8zyV1N",
                        "M43pzgzwmxCVKmENRRBVtqvb5190PgsM7o5yP",
                        "jEDOPKP0JMs5wxZeJJpRfbqrj366A7FReROe5",
                        "VE4pzgzvwrsybmejww5yFxQorgmLkPFrdVXDz",
                        "YEJezgzxD6sPjzqaDD31CpL9zrERBMtQPVqRK",
                        "epEOwPwvj3FaAnJLRRx0Hr40ZewzJMtdrVbA0",
                        "YEJezgzxD6sPjzqaDD3gHbRyNEgA9VFQp6wmz",
                        "Naypzmz6bMubo03B88JqSDv3K8MZm6HRwPLqN",
                        "XExpzgz0Lwsrm6PeLLk9SX56Z7RomNU4bpae1",
                        "APOXzkzBAJIyjo7VDDmetgqQpMxLnNu6nkrpv",
                        "vMjb4645dPF43YExqq1DC0Pa978AmBFm0BxyB",
                        "rDv3wxVd0AiExZZYDrwdH6bEnBQjN9CBJEkpx",
                        "kE1Oqkq08NsJa5Z3886gTdPKq7MgReURv4zPn",
                        "e0w95gm76ViM8JJVqXzzcj67emLjMxtddgzgx",
                        "8Z8epLp7DQtNEjzxVV4QIp6o0rQNAwCy1zE5X",
                        "xM4bxDxB6gFjKvO833q9Czw1XPOM7bUMRgbLp",
                        "dpMOd1d403FPkvR6EEDQFk6pp5rXdPsbyX9nO",
                        "7QeqvNb4w5Ue3558wp4Ofo8NXagzjZcQz3w9r",
                        "OxKpzEzLgPIKVjz3DDAdIabw7REbjzs8Vy1xN",
                        "mEqN3v3r59sELmPK55v3f8DRRzbNyrCM3gd5P",
                        "LrBNzMzd5xCeQA5PjjELUaAooprx0PF0mbYMV",
                        "8opB0RN56btY6zzrMmAbupBzwyAgN1UyOp0nR",
                        "D3dpz0zvjmCom1r3XXO3tm4zp81LBJSZZ981L",
                        "6opPAzm4d8tYNKK8V5yrHqkqB9mOr0iaVwJwM",
                        "1j0XprpNVgFgvVJNRRKNF7D1vkMjrZCmmeXKx",
                        "qMmbA4AY7qFNzqo066d0svjeZ1QBnzHJJ7bXL",
                        "BqMXzAzEvkuAVnODEELDU4YV1MyReLH99rAoJ",
                        "D3dpz0zvjmCom1r3XXOKCmZMaXZyVriZznqBx",
                        "dpMOd1d403FPkvR6EEDLIJ0RQg0mjYCb8E1J3",
                        "mEqN3v3r59sELmPK55vdC0Z9YnZeAvtMmq469",
                        "LrBNzMzd5xCeQA5PjjEqtVyMNLyjgbt0dAPr9",
                        "Lvz8Q0aykZcqg558VK34ugb9bdXyvKt0nMnzb",
                        "6JxXpwpN6LfdpvKRwwjYHPEgXxEw69CaVv91v",
                        "1opwBZeR5ktYzJJOZamXT9BqBK10rZCmevekv",
                        "P4zmLd9v5OsRwvvN70Z8TM5g5k9PKqcmBxBzz",
                        "1j0XprpNVgFgvVJNRRKVcKo3nYLmY6imokZ5O",
                        "zMxb8P8jDmF7JXw5KK3OCjprdkpqABFOzNB8a",
                        "DPz8gnN6XqTK0rr9PLaycVr7rNzZBJfZ9a9k4",
                        "wMrbaLa9wgFP3EOeBBnNIbmnQJmzX4tLe9MpJ",
                        "oY3NKjKVb0TeP1BAMM6XhMjPQD4B3gCBJ0wXk",
                        "VE4pzgzvwrsybmejww5kiQOvbzkjqMUrOJVe8",
                        "kJq6VvnMBzSk7ZZV10mDcbYa3gvB45FRJYLnm",
                        "bQVpzLzvAbI8qmNdzzj1iNXZ6Y9qj1Uq6an09",
                        "D3dpz0zvjmCom1r3XXO1uN3OqokAovtZzkre9",
                        "gEwOLBL94ysJVYX1448mFZNrpbJq94HqXEJoa",
                        "1j0XprpNVgFgvVJNRRKAuzZNzNL58atmdgEJw",
                        "95ZXpDpz1Psb1VdAooaPFDoXA1OqPNtdXJ1Yo",
                        "qMmbA4AY7qFNzqo066dOIVzdVdb08NUJyEPLM",
                        "6opPAzm4d8tYNKK8V5ywIZR7r1pbr5Cazx9oa",
                        "PJkpzgzD7XfzDrvyggnOSYq4Y4Ny67cmYAD89",
                        "BqMXzAzEvkuAVnODEELjhaLpap8KJPF9e7Q0E",
                        "6JxXpwpN6LfdpvKRwwjDteQaJkNQVvSaadxZn",
                        "KjqYzgz5ZxF1akPV33LYcx5yxy9kYeFQxmABq",
                        "LrBNzMzd5xCeQA5PjjEAcd0EzxnQx1t0dzQ55",
                        "34rXpapvMdC97KrZwwAxuMkvMvNdPJCKmAQjg",
                        "78JXe6enL9FOL05mXXrgujnweP3Y6dCQ3Zevk",
                        "D3dpz0zvjmCom1r3XXOViJLOpDgAYzCZRePK0",
                        "D3dpz0zvjmCom1r3XXOQfO15p701LKFZZADQy",
                        "LrBNzMzd5xCeQA5PjjEYUE4wm9Z4oPI00Eejn",
                        "nnBNy0yxo9I3xaDkEEN4hN6Jg1BA38UAQXzzX",
                        "XExpzgz0Lwsrm6PeLLkvF7wqRA6aKNs4rjEEe",
                        "Naypzmz6bMubo03B88JgF87eMQ3rB6fRYzjje",
                        "kE1Oqkq08NsJa5Z3886wfNqDNDM4QVtRVv0AA",
                        "OxKpzEzLgPIKVjz3DDAgiB57wD4goOC8oPyr1",
                        "M43pzgzwmxCVKmENRRBLhvDwBJPpxKFMdgoxV",
                        "pMybkrkYgaFz90avww68sjaORZ3JNACJeLYYz",
                        "EywpzjzArkCqzPVM44YLi3m6o5EnyMIp6qx3r",
                        "yMabJ1JoL0FVQOdZyyBquAKjAjrNvwIOjg9ny",
                        "RZvXzgzPVOt0wadVoo8Bty96rz1qoZHyVrwNn",
                        "Q8Apzgz19xFDX4aKppRqtLrQNZJ47PCEyo88D",
                        "YEJezgzxD6sPjzqaDD38TMk5Ra9XovsQqLyMJ",
                        "zMxb8P8jDmF7JXw5KK3vi13wLJvy4EUOn7obM",
                        "1j0XprpNVgFgvVJNRRK0U3MavqzMjEsmmapr1",
                        "gEwOLBL94ysJVYX1448OI4X50MJor1tqKrojP",
                        "95ZXpDpz1Psb1VdAooawINQrpROZX4UdxvY99",
                        "8Z8epLp7DQtNEjzxVV4aHaL5v9Qx1YcyvoMEa",
                        "VE4pzgzvwrsybmejww5zuMedRakLvnsrjPeMo",
                        "zk8r3vpBN9fOpww4EbRXuZyvobamXYUO8M3DV",
                        "78JXe6enL9FOL05mXXrbTdMKVJ3xwRUQ5bvnJ",
                        "oY3NKjKVb0TeP1BAMM6pSgRn0q4KPeTBbRXEw",
                        "ZE8Ozgz31Ls3nDgx11v8SgqLPZvr74TRke1g0",
                        "5maXpdpew6tqMVy8xx07uajAEorpDmcB4rJnJ",
                        "PJkpzgzD7XfzDrvyggnKfn07ZgY0rVImmpe5w",
                        "bQVpzLzvAbI8qmNdzzjpu105na94Z7UqDk0zY",
                        "jEDOPKP0JMs5wxZeJJp4T7wbmd14gNSRjE9ng",
                        "J0PpzMzA8LUoX9vDJJxMipjoxwkvZVUb7Kj4O"
                    ],
                    "transactions": [{
                            "transaction_id": "oY3NKjKVb0TeP1BAMMM5uAnJgzZJ6zsBezBqQ",
                            "amount": 25.43,
                            "date": "2019-03-27",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "bQVpzLzvAbI8qmNdzzzocp5V1KmVwKFqyQq3O",
                            "amount": 13.32,
                            "date": "2019-03-27",
                            "name": "Lyft",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "95ZXpDpz1Psb1VdAooomf5rkNaKkeaHdjMdEK",
                            "amount": 55,
                            "date": "2019-03-27",
                            "name": "THE ECONOMIST NEWSPAPER",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "5maXpdpew6tqMVy8xxxoceAna0dn60tBPpB81",
                            "amount": 157.69,
                            "date": "2019-03-27",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "78JXe6enL9FOL05mXXXjs7KAdpvA0pTQM9QXr",
                            "amount": 1.99,
                            "date": "2019-03-27",
                            "name": "Google",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "1j0XprpNVgFgvVJNRRRbH7DZOYLze6hmnKbvV",
                            "amount": 63.66,
                            "date": "2019-03-26",
                            "name": "Conoco",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "dvdnZAVmw7cLJRRzrogmiLBwOQ9Lv1Ib4RmdB",
                            "amount": 150,
                            "date": "2019-03-26",
                            "name": "CHECKCARD SAN FRANCISCO CRO SAN FRANCISCO CA ON 03/24",
                            "fioCategoryId": 0,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "PJkpzgzD7XfzDrvygggosEpq1RNYLzFmokwxk",
                            "amount": 46.18,
                            "date": "2019-03-26",
                            "name": "Walgreens",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "ZE8Ozgz31Ls3nDgx111McdLoge5o1efRBZRwv",
                            "amount": 85.39,
                            "date": "2019-03-26",
                            "name": "CAVIAR FOOD DELIVERY",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "gEwOLBL94ysJVYX14446fB5e4DYeVDHqwpqPO",
                            "amount": 29.98,
                            "date": "2019-03-26",
                            "name": "Lyft",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "ndymERV7K1iqODDQdrvVTp5A5qBXYqFAQpPwN",
                            "amount": 150,
                            "date": "2019-03-25",
                            "name": "CHECKCARD 03/24 SAN FRANCISCO CROSSFIT",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "qMmbA4AY7qFNzqo0666afvjzKkbV9RIJDXNYV",
                            "amount": 9.99,
                            "date": "2019-03-24",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "34rXpapvMdC97KrZwww5U1YkrKNMR7cKo8D5a",
                            "amount": 39.99,
                            "date": "2019-03-24",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "BqMXzAzEvkuAVnODEEEgC4YLDn8aQrH93o4pA",
                            "amount": 11,
                            "date": "2019-03-24",
                            "name": "PRESIDIO-CALE PRKNG",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "vMjb4645dPF43YExqqqjs36901KAkycmpBR8E",
                            "amount": 9.99,
                            "date": "2019-03-23",
                            "name": "Google",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "kE1Oqkq08NsJa5Z3888At4jqdALgEVHRb4gj7",
                            "amount": 4.99,
                            "date": "2019-03-23",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "yMabJ1JoL0FVQOdZyyygsNDK4Zm9BwHORL6Mz",
                            "amount": 53.11,
                            "date": "2019-03-23",
                            "name": "Baker Street Bistro",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "KjqYzgz5ZxF1akPV333xTkr53j0XveHQyZkXk",
                            "amount": 9.67,
                            "date": "2019-03-23",
                            "name": "Presidio Food Mart",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "APOXzkzBAJIyjo7VDDD8h7zpgvBL51I6wko97",
                            "amount": 9.99,
                            "date": "2019-03-23",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "0zpdqb8RKyuoZ11XE4BAFJDv47Jr4wfrmAogd",
                            "amount": 100,
                            "date": "2019-03-22",
                            "name": "SAN FRANCISCO CROSSFIT 03/19 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "vB4A1m0DYJik5EEVapLeHr6nz1rxzeCmAVzoX",
                            "amount": 100,
                            "date": "2019-03-22",
                            "name": "SAN FRANCISCO CROSSFIT 03/19 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "M43pzgzwmxCVKmENRRRKUo4v98w63pHMpKmaZ",
                            "amount": 10,
                            "date": "2019-03-22",
                            "name": "Kqed Inc",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "RZvXzgzPVOt0wadVoo8ntxPPyBBEM6HyejO6y",
                            "amount": 75.71,
                            "date": "2019-03-21",
                            "name": "FRAMEITEASY",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "wMrbaLa9wgFP3EOeBBnJi0PxvKw4myHLyq3XL",
                            "amount": 10,
                            "date": "2019-03-20",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "dvdnZAVmw7cLJRRzrogbsOn3R4KoyYHbmmxLj",
                            "amount": 100,
                            "date": "2019-03-20",
                            "name": "CHECKCARD 03/19 SAN FRANCISCO CROSSFIT",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "LrBNzMzd5xCeQA5PjjEOTZ5408EbyPC0mDx7J",
                            "amount": 108.89,
                            "date": "2019-03-20",
                            "name": "Comcast",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "mZ3DMan7yLudVPPMqynBHg4k9poB3vSMwwLQY",
                            "amount": 100,
                            "date": "2019-03-20",
                            "name": "CHECKCARD 03/19 SAN FRANCISCO CROSSFIT",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "6JxXpwpN6LfdpvKRwwj4hN4QnMe9EvHaykjKw",
                            "amount": 17.98,
                            "date": "2019-03-20",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "Lvz8Q0aykZcqg558VKRZCmQ5MYk8ebU066nxK",
                            "amount": 11.36,
                            "date": "2019-03-19",
                            "name": "NEXMO LTD. 03/15 PURCHASE LONDON",
                            "fioCategoryId": 5000,
                            "account_id": "Lvz8Q0aykZcqg558VKe3iaD86LaKoBUZL07rX"
                        },
                        {
                            "transaction_id": "bQVpzLzvAbI8qmNdzzj8FpN3dAR49KtqVngvJ",
                            "amount": 204.54,
                            "date": "2019-03-19",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "95ZXpDpz1Psb1VdAooabs5DbxM3ZOaCdL1kzk",
                            "amount": 129.05,
                            "date": "2019-03-19",
                            "name": "ORDERS@GOODEGGS.COM",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "w3avPoO1NZiNmOOVZvL1hAkPnM1KL4ULnnjgO",
                            "amount": 910.13,
                            "date": "2019-03-19",
                            "name": "AUDI FINCL, INC. DES:AUTO DEBIT ID:XXXXX0894000175 INDN:THOMAS R PURNELL-FISHE CO ID:XXXXX62409 WEB",
                            "fioCategoryId": 6000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "78JXe6enL9FOL05mXXrOI7jObokx3ptQaeDr5",
                            "amount": 10,
                            "date": "2019-03-19",
                            "name": "KARMA YOGA",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "6opPAzm4d8tYNKK8V5AZFJy4g87MD9IaBB4md",
                            "amount": 0.34,
                            "date": "2019-03-19",
                            "name": "INTERNATIONAL TRANSACTION FEE 03/15 NEXMO LTD. LONDON",
                            "fioCategoryId": 8000,
                            "account_id": "Lvz8Q0aykZcqg558VKe3iaD86LaKoBUZL07rX"
                        },
                        {
                            "transaction_id": "gEwOLBL94ysJVYX1448JsBZPg6OoJDIqvJ396",
                            "amount": 14.95,
                            "date": "2019-03-19",
                            "name": "Audible",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "ZE8Ozgz31Ls3nDgx11v3tdQ9R6XrveURqmV7Q",
                            "amount": 1,
                            "date": "2019-03-19",
                            "name": "ORDERS@GOODEGGS.COM",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "Lvz8Q0aykZcqg558VKRbuZP3AJAx4BC0B01R7",
                            "amount": 150,
                            "date": "2019-03-18",
                            "name": "SAN FRANCISCO CROSSFIT 03/15 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "OxKpzEzLgPIKVjz3DDAKFmBq8yQr46t8zyV1N",
                            "amount": 71.9,
                            "date": "2019-03-18",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "M43pzgzwmxCVKmENRRBVtqvb5190PgsM7o5yP",
                            "amount": 265.25,
                            "date": "2019-03-18",
                            "name": "VCA 799",
                            "fioCategoryId": 2000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "jEDOPKP0JMs5wxZeJJpRfbqrj366A7FReROe5",
                            "amount": 13.98,
                            "date": "2019-03-18",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "VE4pzgzvwrsybmejww5yFxQorgmLkPFrdVXDz",
                            "amount": 8.4,
                            "date": "2019-03-18",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "YEJezgzxD6sPjzqaDD31CpL9zrERBMtQPVqRK",
                            "amount": 276.64,
                            "date": "2019-03-17",
                            "name": "MACROSTIE WINERY & VINEYARDS",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "epEOwPwvj3FaAnJLRRx0Hr40ZewzJMtdrVbA0",
                            "amount": 90,
                            "date": "2019-03-17",
                            "name": "T-Mobile",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "YEJezgzxD6sPjzqaDD3gHbRyNEgA9VFQp6wmz",
                            "amount": 6,
                            "date": "2019-03-17",
                            "name": "KARMA YOGA",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "Naypzmz6bMubo03B88JqSDv3K8MZm6HRwPLqN",
                            "amount": 25,
                            "date": "2019-03-17",
                            "name": "FASTRAK CSC TOLLS",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "XExpzgz0Lwsrm6PeLLk9SX56Z7RomNU4bpae1",
                            "amount": 8.68,
                            "date": "2019-03-16",
                            "name": "Lyft",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "APOXzkzBAJIyjo7VDDmetgqQpMxLnNu6nkrpv",
                            "amount": 232.44,
                            "date": "2019-03-16",
                            "name": "TST* CHE FICO",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "vMjb4645dPF43YExqq1DC0Pa978AmBFm0BxyB",
                            "amount": 13.99,
                            "date": "2019-03-16",
                            "name": "Netflix",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "rDv3wxVd0AiExZZYDrwdH6bEnBQjN9CBJEkpx",
                            "amount": 150,
                            "date": "2019-03-15",
                            "name": "SAN FRANCISCO CROSSFIT 03/12 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "kE1Oqkq08NsJa5Z3886gTdPKq7MgReURv4zPn",
                            "amount": 12.53,
                            "date": "2019-03-15",
                            "name": "Lyft",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "e0w95gm76ViM8JJVqXzzcj67emLjMxtddgzgx",
                            "amount": 358.7,
                            "date": "2019-03-14",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "Lvz8Q0aykZcqg558VKe3iaD86LaKoBUZL07rX"
                        },
                        {
                            "transaction_id": "8Z8epLp7DQtNEjzxVV4QIp6o0rQNAwCy1zE5X",
                            "amount": 9.99,
                            "date": "2019-03-14",
                            "name": "Spotify",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "xM4bxDxB6gFjKvO833q9Czw1XPOM7bUMRgbLp",
                            "amount": 16.26,
                            "date": "2019-03-14",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "dpMOd1d403FPkvR6EEDQFk6pp5rXdPsbyX9nO",
                            "amount": 136.7,
                            "date": "2019-03-13",
                            "name": "ARDUINO STORE",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "7QeqvNb4w5Ue3558wp4Ofo8NXagzjZcQz3w9r",
                            "amount": 129.15,
                            "date": "2019-03-13",
                            "name": "101DOMAIN 03/12 PURCHASE",
                            "fioCategoryId": 9000,
                            "account_id": "Lvz8Q0aykZcqg558VKe3iaD86LaKoBUZL07rX"
                        },
                        {
                            "transaction_id": "OxKpzEzLgPIKVjz3DDAdIabw7REbjzs8Vy1xN",
                            "amount": 17.95,
                            "date": "2019-03-13",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "mEqN3v3r59sELmPK55v3f8DRRzbNyrCM3gd5P",
                            "amount": 35,
                            "date": "2019-03-13",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "LrBNzMzd5xCeQA5PjjELUaAooprx0PF0mbYMV",
                            "amount": 24.68,
                            "date": "2019-03-12",
                            "name": "Interest Charge on Purchases",
                            "fioCategoryId": 8000,
                            "account_id": "APOXzkzBAJIyjo7VDDomh0XnpNjOjLF66513L"
                        },
                        {
                            "transaction_id": "8opB0RN56btY6zzrMmAbupBzwyAgN1UyOp0nR",
                            "amount": 500,
                            "date": "2019-03-12",
                            "name": "Plaid Inc. DES:Bill.com ID:016MBKSRI102XRX INDN:Flow Capital LLC CO ID:XXXXX95317 WEB PMT INFO:Plaid Inc. - Inv #5PJ9PV0-1902",
                            "fioCategoryId": 6000,
                            "account_id": "Lvz8Q0aykZcqg558VKe3iaD86LaKoBUZL07rX"
                        },
                        {
                            "transaction_id": "D3dpz0zvjmCom1r3XXO3tm4zp81LBJSZZ981L",
                            "amount": 42.97,
                            "date": "2019-03-11",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "6opPAzm4d8tYNKK8V5yrHqkqB9mOr0iaVwJwM",
                            "amount": 150,
                            "date": "2019-03-11",
                            "name": "SAN FRANCISCO CROSSFIT 03/08 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "1j0XprpNVgFgvVJNRRKNF7D1vkMjrZCmmeXKx",
                            "amount": 6,
                            "date": "2019-03-11",
                            "name": "KARMA YOGA",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "qMmbA4AY7qFNzqo066d0svjeZ1QBnzHJJ7bXL",
                            "amount": 10,
                            "date": "2019-03-09",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "BqMXzAzEvkuAVnODEELDU4YV1MyReLH99rAoJ",
                            "amount": 9.99,
                            "date": "2019-03-08",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "D3dpz0zvjmCom1r3XXOKCmZMaXZyVriZznqBx",
                            "amount": 9.99,
                            "date": "2019-03-08",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "dpMOd1d403FPkvR6EEDLIJ0RQg0mjYCb8E1J3",
                            "amount": 33.16,
                            "date": "2019-03-08",
                            "name": "Allstate",
                            "fioCategoryId": 6000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "mEqN3v3r59sELmPK55vdC0Z9YnZeAvtMmq469",
                            "amount": 52.04,
                            "date": "2019-03-08",
                            "name": "CAVIAR",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "LrBNzMzd5xCeQA5PjjEqtVyMNLyjgbt0dAPr9",
                            "amount": 9.99,
                            "date": "2019-03-08",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "Lvz8Q0aykZcqg558VK34ugb9bdXyvKt0nMnzb",
                            "amount": 150,
                            "date": "2019-03-08",
                            "name": "CHECKCARD 03/08 SAN FRANCISCO CROSSFIT",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "6JxXpwpN6LfdpvKRwwjYHPEgXxEw69CaVv91v",
                            "amount": 9.99,
                            "date": "2019-03-08",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "1opwBZeR5ktYzJJOZamXT9BqBK10rZCmevekv",
                            "amount": 100,
                            "date": "2019-03-07",
                            "name": "SAN FRANCISCO CROSSFIT 03/05 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "P4zmLd9v5OsRwvvN70Z8TM5g5k9PKqcmBxBzz",
                            "amount": 10.35,
                            "date": "2019-03-07",
                            "name": "Google",
                            "fioCategoryId": 4000,
                            "account_id": "Lvz8Q0aykZcqg558VKe3iaD86LaKoBUZL07rX"
                        },
                        {
                            "transaction_id": "1j0XprpNVgFgvVJNRRKVcKo3nYLmY6imokZ5O",
                            "amount": 10,
                            "date": "2019-03-07",
                            "name": "KARMA YOGA",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "zMxb8P8jDmF7JXw5KK3OCjprdkpqABFOzNB8a",
                            "amount": 157.71,
                            "date": "2019-03-07",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "DPz8gnN6XqTK0rr9PLaycVr7rNzZBJfZ9a9k4",
                            "amount": 100,
                            "date": "2019-03-07",
                            "name": "SAN FRANCISCO CROSSFIT 03/05 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "wMrbaLa9wgFP3EOeBBnNIbmnQJmzX4tLe9MpJ",
                            "amount": 242.38,
                            "date": "2019-03-07",
                            "name": "PETPLAN USA",
                            "fioCategoryId": 2000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "oY3NKjKVb0TeP1BAMM6XhMjPQD4B3gCBJ0wXk",
                            "amount": 78.94,
                            "date": "2019-03-06",
                            "name": "PILLPACK LLC",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "VE4pzgzvwrsybmejww5kiQOvbzkjqMUrOJVe8",
                            "amount": 13.34,
                            "date": "2019-03-05",
                            "name": "SIRIUS RADIO",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "kJq6VvnMBzSk7ZZV10mDcbYa3gvB45FRJYLnm",
                            "amount": 0.25,
                            "date": "2019-03-05",
                            "name": "CCSF MTA IPS PRKNG METE 03/04 PURCHASE",
                            "fioCategoryId": 6000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "bQVpzLzvAbI8qmNdzzj1iNXZ6Y9qj1Uq6an09",
                            "amount": 10.98,
                            "date": "2019-03-05",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "D3dpz0zvjmCom1r3XXO1uN3OqokAovtZzkre9",
                            "amount": 57.5,
                            "date": "2019-03-05",
                            "name": "OMNIPET INC",
                            "fioCategoryId": 2000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "gEwOLBL94ysJVYX1448mFZNrpbJq94HqXEJoa",
                            "amount": 26.33,
                            "date": "2019-03-05",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "1j0XprpNVgFgvVJNRRKAuzZNzNL58atmdgEJw",
                            "amount": 9.99,
                            "date": "2019-03-04",
                            "name": "Google",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "95ZXpDpz1Psb1VdAooaPFDoXA1OqPNtdXJ1Yo",
                            "amount": 10,
                            "date": "2019-03-04",
                            "name": "Nest Labs",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "qMmbA4AY7qFNzqo066dOIVzdVdb08NUJyEPLM",
                            "amount": 27,
                            "date": "2019-03-04",
                            "name": "KARMA YOGA",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "6opPAzm4d8tYNKK8V5ywIZR7r1pbr5Cazx9oa",
                            "amount": 150,
                            "date": "2019-03-04",
                            "name": "SAN FRANCISCO CROSSFIT 02/28 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "PJkpzgzD7XfzDrvyggnOSYq4Y4Ny67cmYAD89",
                            "amount": 25,
                            "date": "2019-03-04",
                            "name": "KARMA YOGA",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "BqMXzAzEvkuAVnODEELjhaLpap8KJPF9e7Q0E",
                            "amount": 136.68,
                            "date": "2019-03-03",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "6JxXpwpN6LfdpvKRwwjDteQaJkNQVvSaadxZn",
                            "amount": 77.28,
                            "date": "2019-03-03",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "KjqYzgz5ZxF1akPV33LYcx5yxy9kYeFQxmABq",
                            "amount": 14.93,
                            "date": "2019-03-03",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "LrBNzMzd5xCeQA5PjjEAcd0EzxnQx1t0dzQ55",
                            "amount": 77.28,
                            "date": "2019-03-03",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "34rXpapvMdC97KrZwwAxuMkvMvNdPJCKmAQjg",
                            "amount": 44.15,
                            "date": "2019-03-03",
                            "name": "CAVIAR",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "78JXe6enL9FOL05mXXrgujnweP3Y6dCQ3Zevk",
                            "amount": 15.2,
                            "date": "2019-03-03",
                            "name": "Amazon",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "D3dpz0zvjmCom1r3XXOViJLOpDgAYzCZRePK0",
                            "amount": 1,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "D3dpz0zvjmCom1r3XXOQfO15p701LKFZZADQy",
                            "amount": 80.28,
                            "date": "2019-03-02",
                            "name": "WAYFAIR.COM",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "LrBNzMzd5xCeQA5PjjEYUE4wm9Z4oPI00Eejn",
                            "amount": 50,
                            "date": "2019-03-02",
                            "name": "KARMA YOGA",
                            "fioCategoryId": 3000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "nnBNy0yxo9I3xaDkEEN4hN6Jg1BA38UAQXzzX",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "XExpzgz0Lwsrm6PeLLkvF7wqRA6aKNs4rjEEe",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "Naypzmz6bMubo03B88JgF87eMQ3rB6fRYzjje",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "kE1Oqkq08NsJa5Z3886wfNqDNDM4QVtRVv0AA",
                            "amount": 16.99,
                            "date": "2019-03-02",
                            "name": "CREDITSECURE",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "OxKpzEzLgPIKVjz3DDAgiB57wD4goOC8oPyr1",
                            "amount": 3.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "M43pzgzwmxCVKmENRRBLhvDwBJPpxKFMdgoxV",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "pMybkrkYgaFz90avww68sjaORZ3JNACJeLYYz",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "EywpzjzArkCqzPVM44YLi3m6o5EnyMIp6qx3r",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "yMabJ1JoL0FVQOdZyyBquAKjAjrNvwIOjg9ny",
                            "amount": 95,
                            "date": "2019-03-02",
                            "name": "THE BATTERY",
                            "fioCategoryId": 5000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "RZvXzgzPVOt0wadVoo8Bty96rz1qoZHyVrwNn",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "Q8Apzgz19xFDX4aKppRqtLrQNZJ47PCEyo88D",
                            "amount": 0.99,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "YEJezgzxD6sPjzqaDD38TMk5Ra9XovsQqLyMJ",
                            "amount": 1,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "zMxb8P8jDmF7JXw5KK3vi13wLJvy4EUOn7obM",
                            "amount": 1,
                            "date": "2019-03-02",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "1j0XprpNVgFgvVJNRRK0U3MavqzMjEsmmapr1",
                            "amount": 79,
                            "date": "2019-03-01",
                            "name": "Club Nautique",
                            "fioCategoryId": 5000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "gEwOLBL94ysJVYX1448OI4X50MJor1tqKrojP",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "95ZXpDpz1Psb1VdAooawINQrpROZX4UdxvY99",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "8Z8epLp7DQtNEjzxVV4aHaL5v9Qx1YcyvoMEa",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "VE4pzgzvwrsybmejww5zuMedRakLvnsrjPeMo",
                            "amount": 5,
                            "date": "2019-03-01",
                            "name": "PROTONMAIL GENEVA ZH",
                            "fioCategoryId": 4000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "zk8r3vpBN9fOpww4EbRXuZyvobamXYUO8M3DV",
                            "amount": 499,
                            "date": "2019-03-01",
                            "name": "AZURE DENTAL 02/27 PURCHASE",
                            "fioCategoryId": 3000,
                            "account_id": "kJq6VvnMBzSk7ZZV10vXIyAmZRn0LVhRJakgX"
                        },
                        {
                            "transaction_id": "78JXe6enL9FOL05mXXrbTdMKVJ3xwRUQ5bvnJ",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "oY3NKjKVb0TeP1BAMM6pSgRn0q4KPeTBbRXEw",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "ZE8Ozgz31Ls3nDgx11v8SgqLPZvr74TRke1g0",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "5maXpdpew6tqMVy8xx07uajAEorpDmcB4rJnJ",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "PJkpzgzD7XfzDrvyggnKfn07ZgY0rVImmpe5w",
                            "amount": 25,
                            "date": "2019-03-01",
                            "name": "Google",
                            "fioCategoryId": 4000,
                            "account_id": "kE1Oqkq08NsJa5Z38856uNxRqea5agHRR1VNm"
                        },
                        {
                            "transaction_id": "bQVpzLzvAbI8qmNdzzjpu105na94Z7UqDk0zY",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "jEDOPKP0JMs5wxZeJJp4T7wbmd14gNSRjE9ng",
                            "amount": 1,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        },
                        {
                            "transaction_id": "J0PpzMzA8LUoX9vDJJxMipjoxwkvZVUb7Kj4O",
                            "amount": 0.99,
                            "date": "2019-03-01",
                            "name": "iTunes",
                            "fioCategoryId": 1000,
                            "account_id": "KjqYzgz5ZxF1akPV33kLuxdm5VNaNXIQQJx44"
                        }
                    ]
                },
                "transfers": {
                    "totalAmount": 11163.64,
                    "transactionIds": [
                        "6JxXpwpN6LfdpvKRwwjeto3VV1BpnvSayg6JX",
                        "xyx0qJvPNoIENOOry1JPSz48be7dMLUM5Yn8r",
                        "Lvz8Q0aykZcqg558VK3ztR9Rrbv1B6I0dZMZb",
                        "PJkpzgzD7XfzDrvyggnytEp9Zo0rKqImmBZkE"
                    ]
                },
                "regularIncome": {
                    "totalAmount": 0,
                    "transactionIds": []
                }
            },
            "balances": [{
                    "accountSubtype": "savings",
                    "startingBalance": 0.03,
                    "endingBalance": 0.03
                },
                {
                    "accountSubtype": "checking",
                    "startingBalance": 32788.87,
                    "endingBalance": 23137.77
                },
                {
                    "accountSubtype": "credit card",
                    "startingBalance": 10767.31,
                    "endingBalance": 9255.28
                }
            ],
            "spending": {
                "actual": -8139.07,
                "target": -1,
                "projected": -10039.91
            }
        },
        "dayNets": [-253.43, -375.21, -150, -60.98, -87.75, -210, -75.71,
            6.79, -937.71, -165.87, -53.98,
            88.55,
            181.13, -41.29,
            24.86, -181.02,
            144.69,
            343.66,
            333.66,
            68.5, -276.78,
            264.72,
            235.26,
            121.67, -21.86,
            86.48, -274.25
        ],
        "includesEndOfData": false,
        "projection": {
            "incomeTotal": 6873.199999999998,
            "spendTotal": -10039.91,
            "net": -3166.71
        },
        "userId": "us-east-1:69ba80be-9484-423c-9d23-b82c42ebc734",
        "createdTimestamp": 1553792991334
    }
};
