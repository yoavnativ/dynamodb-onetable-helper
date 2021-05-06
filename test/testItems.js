'use strict';

const expect = require('chai').expect;
const dynamodbHelper = require('../src/dynamoDbOneTableHelper');


const dbTestMapping = {
  "prefixId": "test#",
  "entity": "TestItem", 
  "pkAttribute": "id",
  "skAttribute": "name", 
  "dataAttribute": "email"
}


const config = require('config');

// const APP_TABLE_NAME = config.get('tables.appMainTableName');
// const CUSTOMERS_ID_PREFIX = config.get('tables.customersTable.prefix');
// const CUSTOMER_ENTITY = config.get('tables.customersTable.entity');

// const customerDbMapping = config.get('tables.customersTable.dbMapping');


// describe('Array', function() {
//   describe('#indexOf()', function() {
//     it('should return -1 when the value is not present', function() {
//       assert.equal([1, 2, 3].indexOf(4), -1);
//     });
//   });
// });


describe('DynamoDB Helper',  function() {
  let testId = '';
  const item = {
  name: 'Test Customer',
  email: 'TestEmail@mytest.net'
}
  it('adds a record to the DB', async function() {
    let res = await dynamodbHelper.addNewItem(item, dbTestMapping);
    expect(res.statusCode === 200);
    let body = JSON.parse(res.body);
    expect(body.message.includes('success'))
    expect(body.data.id.startsWith(dbTestMapping.prefixId)).to.be.true;
    testId = body.data.id;
  });

  it('gets a record from the DB', async function() {
    let res = await dynamodbHelper.getItemById(testId, dbTestMapping);
    expect(res.statusCode === 200);
    let body = JSON.parse(res.body);
    expect(body.message.includes('success'))
    expect(body.data.name === item.name);
    expect(body.data.email === item.email);
    expect(body.data.entity === dbTestMapping.entity);
  });

  it('updates a record in the DB', async function() {
    const updatedItem = {
      name: 'Updated Test Customer',
      email: 'UpdatedTestEmail@mytest.net'
    }

    // Update
    let res = await dynamodbHelper.updateItem(testId, updatedItem, dbTestMapping);
    expect(res.statusCode === 200);
    let body = JSON.parse(res.body);
    
    // Get the item to see that it was updated
    res = await dynamodbHelper.getItemById(testId, dbTestMapping);
    expect(res.statusCode === 200);
    body = JSON.parse(res.body);
    expect(body.message.includes('success'))
    expect(body.data.name === updatedItem.name);
    expect(body.data.email === updatedItem.email);
    expect(body.data.entity === dbTestMapping.entity);
    expect('updated' in body.data);
  });

  it('disables a record in the DB', async function() {
    let res = await dynamodbHelper.enableDisableItem(testId, false, dbTestMapping);
    expect(res.statusCode === 200);
    let body = JSON.parse(res.body);
    
    // Get the item to see that it was updated
    res = await dynamodbHelper.getItemById(testId, dbTestMapping);
    expect(res.statusCode === 200);
    body = JSON.parse(res.body);
    expect(body.message.includes('success'))
    expect(body.data.enabled === false);
    expect('updated' in body.data);
  });

  it('enables a record in the DB', async function() {
    let res = await dynamodbHelper.enableDisableItem(testId, true, dbTestMapping);
    expect(res.statusCode === 200);
    let body = JSON.parse(res.body);
    
    // Get the item to see that it was updated
    res = await dynamodbHelper.getItemById(testId, dbTestMapping);
    expect(res.statusCode === 200);
    body = JSON.parse(res.body);
    expect(body.message.includes('success'))
    expect(body.data.enabled === true);
    expect('updated' in body.data);
  });

  it('lists all records', async function() {
    let res = await dynamodbHelper.listItems(dbTestMapping);
    expect(res.statusCode === 200);
    let body = JSON.parse(res.body);
    expect(body.message.includes('success'));
    expect(body.data.length > 0);

    let counter = 0;
    for (let item of body.data) {
      expect(item.entity === dbTestMapping.entity);
      counter++;
    }

    // just making sure we checked all items
    expect(counter === body.data.length);
  });
});