const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('inventory change journal survives script cache eviction', () => {
  const source = fs.readFileSync('Backend/InventoryRead.js','utf8');
  const cache = new Map(), properties = new Map();
  const propertyStore = {
    setProperty(key,value){properties.set(key,value);},
    getProperty(key){return properties.get(key)||null;},
    deleteProperty(key){properties.delete(key);},
  };
  const context = vm.createContext({
    console,
    CacheService:{getScriptCache(){return {
      put(key,value){cache.set(key,value);},
      get(key){return cache.get(key)||null;},
    };}},
    PropertiesService:{getScriptProperties(){return propertyStore;}},
  });
  vm.runInContext(source.slice(0,source.indexOf('function recordInventoryChangedCodes_')),context);
  const version='sheet-1:epoch:revision-1',event={fromVersion:'old',version,codes:['A']};
  context.writeInventoryChangeEvent_(version,event,3600);
  cache.clear();
  assert.equal(JSON.stringify(context.readInventoryChangeEvent_(version)),JSON.stringify(event));
});
