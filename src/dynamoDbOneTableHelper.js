/* eslint-disable no-underscore-dangle */
'use strict';

var AWS = require('aws-sdk');
const config = require('config');
const { v4: uuidv4 } = require('uuid');

const APP_TABLE_NAME = config.get('tables.appMainTableName');

const region = config.get('aws.region');
AWS.config.update({ region: region });
const dynamoDbClient = new AWS.DynamoDB();

/**
 * Add OR Replace an item
 * @param {*} id containing id, 
 * @param {*} item containing new item to add, 
 * @param {*} dbMapping item OneTable mapping: prefixId, entity, pkAttribute, skAttribute, dataAttribute 
 * 
 * @returns {string} the new id
 */
// eslint-disable-next-line max-params
async function _putItem(id, item, dbMapping, update = false) {
    try {
        const docClient = new AWS.DynamoDB.DocumentClient();

        const currentTime = Date.now();

        let tableItem = {};
        Object.assign(tableItem, item);
        tableItem.id = id;
        tableItem.PK = tableItem[dbMapping.pkAttribute];
        tableItem.SK = tableItem[dbMapping.skAttribute];
        tableItem.Data = tableItem[dbMapping.dataAttribute];
        tableItem.entity = dbMapping.entity;
        if (update) {
            tableItem.updated = currentTime;
        } else {
            tableItem.created = currentTime;
        }
        delete tableItem[dbMapping.pkAttribute];
        delete tableItem[dbMapping.skAttribute];
        delete tableItem[dbMapping.dataAttribute];

        const params = {
            TableName: APP_TABLE_NAME,
            Item: tableItem
        };

        console.log(`Put item ${dbMapping.entity}...`);
        const result = await docClient.put(params).promise();

        // create the data table for the customer
        console.log('Put item:', JSON.stringify(result, null, 2));

        return {
            statusCode: 200,
            body: JSON.stringify(
                {
                    message: `Put item (${dbMapping.entity}) - success`,
                    data: { id: id }
                },
                null,
                2
            ),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(
                {
                    message: `Put item (${dbMapping.entity}) - error`,
                    data: {},
                    input: item,
                    error: error.message,
                },
                null,
                2
            ),
        };
    }
}

/**
 * Add new item
 * @param {*} item containing new item to add, 
 * @param {*} dbMapping item OneTable mapping: prefixId, entity, pkAttribute, skAttribute, dataAttribute 
 * 
 * @returns {string} the new id
 */
// eslint-disable-next-line no-underscore-dangle
function addNewItem(item, dbMapping) {
    const id = dbMapping.prefixId.concat(uuidv4());
    return _putItem(id, item, dbMapping);
}

async function getItemById(id, dbMapping) {
    const docClient = new AWS.DynamoDB.DocumentClient();

    try {
        var params = {
            TableName: APP_TABLE_NAME,
            KeyConditionExpression: "#PK = :S",
            ExpressionAttributeNames: {
                "#PK": "PK"
            },
            ExpressionAttributeValues: {
                ":S": id
            }
        };

        console.log(`get ${dbMapping.entity} ${id}`);
        // const result = await docClient.get(params).promise();
        const result = await docClient.query(params).promise();

        if (result.Items.length > 0) {
            let tableItem = result.Items[0];

            // replace PK, SK, Data according to the mapping
            tableItem[dbMapping.pkAttribute] = tableItem.PK;
            tableItem[dbMapping.skAttribute] = tableItem.SK;
            tableItem[dbMapping.dataAttribute] = tableItem.Data;

            delete tableItem.PK;
            delete tableItem.SK;
            delete tableItem.Data;

            return {
                statusCode: 200,
                body: JSON.stringify(
                    {
                        message: `get item (${dbMapping.entity}) - success`,
                        data: tableItem
                    },
                    null,
                    2
                )
            };
        } else {
            return {
                statusCode: 404,
                body: JSON.stringify(
                    {
                        message: `get item (${dbMapping.entity}) - not found`,
                        data: { input: id }
                    },
                    null,
                    2
                )
            };
        }
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(
                {
                    message: `add new item (${dbMapping.entity}) - error`,
                    data: {},
                    input: id,
                    error: error.message,
                },
                null,
                2
            ),
        };
    }
}

async function listItems(dbMapping) {
    const statement = {
        "Statement": `SELECT *\nFROM ${APP_TABLE_NAME}\nWHERE begins_with("PK", '${dbMapping.prefixId}')`
    }

    try {
        const result = await dynamoDbClient.executeStatement(statement).promise();

        // need to change PK, SK, Data to readable names
        let resultItems = [];

        for (let tableItem of result.Items) {

            tableItem[dbMapping.pkAttribute] = tableItem.PK;
            tableItem[dbMapping.skAttribute] = tableItem.SK;
            tableItem[dbMapping.dataAttribute] = tableItem.Data;

            delete tableItem.PK;
            delete tableItem.SK;
            delete tableItem.Data;

            const item = AWS.DynamoDB.Converter.unmarshall(tableItem)
            resultItems.push(item);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(
                {
                    message: `listItems (${dbMapping.entity}) - success`,
                    data: resultItems
                },
                null,
                2
            )
        }
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(
                {
                    message: `listItems (${dbMapping.entity}) - error`,
                    data: {},
                    input: id,
                    error: error.message,
                },
                null,
                2
            ),
        };
    }
}

async function updateItem(id, updatedData, dbMapping) {
    const docClient = new AWS.DynamoDB.DocumentClient();

    const getItemResult = await getItemById(id, dbMapping);

    let result = null;

    const currentData = JSON.parse(getItemResult.body).data;
    try {
        if (getItemResult.statusCode !== 200) {
            return getItemResult;
        }

        let clonedItem = {};
        Object.assign(clonedItem, updatedData);
        clonedItem.created = currentData.created;

        // If replacing PK or SK - need to add new record and then delete the old one.
        if (currentData[dbMapping.pkAttribute] == updatedData[dbMapping.pkAttribute] &&
            currentData[dbMapping.skAttribute] == updatedData[dbMapping.skAttribute]) {
            // NO need to add a new record and delete currrent one as PK and SK didn't change.

            result = await _putItem(id, clonedItem, dbMapping, true);
        } else {
            result = await _putItem(id, clonedItem, dbMapping, true);
            // need to add a new record and delete currrent one

            console.log('Updating customer: Deleting the old record...');

            const deleteParams = {
                TableName: APP_TABLE_NAME,
                Key: {
                    PK: currentData[dbMapping.pkAttribute],
                    SK: currentData[dbMapping.skAttribute]
                }
            };
            await docClient.delete(deleteParams).promise();
        }

        return result;
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(
                {
                    message: 'updateItem - error',
                    data: {},
                    input: id,
                    error: error.message,
                },
                null,
                2
            ),
        };

    }
}


async function enableDisableItem(id, enabled, dbMapping) {
    const docClient = new AWS.DynamoDB.DocumentClient();

    let getItemResult = await getItemById(id, dbMapping);

    let result = null;

    const currentData = JSON.parse(getItemResult.body).data;
    try {
        if (getItemResult.statusCode !== 200) {
            return getItemResult;
        }

        getItemResult.enabled = enabled;
        getItemResult.updated = new Date();

        result = await _putItem(id, clonedItem, dbMapping, true);

        return result;
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(
                {
                    message: 'enableDisableItem - error',
                    data: {},
                    input: {
                        id, enabled
                    },
                    error: error.message,
                },
                null,
                2
            ),
        };

    }
}

module.exports = {
    addNewItem,
    getItemById,
    listItems,
    updateItem,
    enableDisableItem,
};