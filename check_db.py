import sqlite3

conn = sqlite3.connect('server/app.db')
cursor = conn.cursor()

# Check tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("Tables:", [t[0] for t in tables])

# Check images table structure
if 'images' in [t[0] for t in tables]:
    cursor.execute("PRAGMA table_info(images)")
    columns = cursor.fetchall()
    print("\nImages table columns:")
    for col in columns:
        print(f"  {col[1]} ({col[2]})")
    
    # Check sample data
    cursor.execute("SELECT id, url FROM images LIMIT 3")
    rows = cursor.fetchall()
    print("\nSample image URLs:")
    for r in rows:
        print(f"  ID: {r[0]}, URL: {r[1]}")

conn.close()
