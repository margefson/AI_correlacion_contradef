import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== Testing category INSERT ===');

// Test 1: INSERT without description (should use NULL)
try {
  await conn.execute(
    "INSERT INTO categories (name, description, color) VALUES (?, ?, ?)",
    ['TestCat1', null, '#22d3ee']
  );
  console.log('Test 1 (null description): OK');
} catch(e) { console.error('Test 1 FAIL:', e.message); }

// Test 2: INSERT with empty string description
try {
  await conn.execute(
    "INSERT INTO categories (name, description, color) VALUES (?, ?, ?)",
    ['TestCat2', '', '#22d3ee']
  );
  console.log('Test 2 (empty string description): OK');
} catch(e) { console.error('Test 2 FAIL:', e.message); }

// Test 3: INSERT without description column at all
try {
  await conn.execute(
    "INSERT INTO categories (name, color) VALUES (?, ?)",
    ['TestCat3', '#22d3ee']
  );
  console.log('Test 3 (no description column): OK');
} catch(e) { console.error('Test 3 FAIL:', e.message); }

// Cleanup
await conn.execute("DELETE FROM categories WHERE name IN ('TestCat1', 'TestCat2', 'TestCat3')");
console.log('Cleanup done');
conn.end();
