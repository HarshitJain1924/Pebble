const AsyncStorage = require('@react-native-async-storage/async-storage/jest/async-storage-mock').default;

async function testStorage() {
  await AsyncStorage.setItem("pebble:v1:tasks:ws1", JSON.stringify({ "t-1": { title: "foo" } }));
  console.log("After set:", await AsyncStorage.getItem("pebble:v1:tasks:ws1"));
  
  await AsyncStorage.removeItem("pebble:v1:tasks:ws1");
  console.log("After remove:", await AsyncStorage.getItem("pebble:v1:tasks:ws1"));
}

testStorage().catch(console.error);
