# Using the PHP JSON endpoints (save_data.php / get_data.php)

This project includes two simple endpoints to store and retrieve JSON files under the `data/` directory:

- `save_data.php` — POST JSON body { key: 'erp_students', data: [...] } to save to `data/erp_students.json`.
- `get_data.php` — GET `?key=erp_students` to retrieve the saved JSON.

These are minimal examples intended for local development and testing. They do not provide authentication — add JWT/session checks before using in production.

## Run locally with PHP built-in server (Windows PowerShell)

1. Make sure PHP is installed and available in PATH. In PowerShell, check:

```powershell
php -v
```

2. From the project root (where `save_data.php` is located), run the built-in server:

```powershell
cd 'C:\Users\satya\Desktop\astra_erp.github.io-master\astra_erp.github.io-master'
php -S 0.0.0.0:8000
```

3. Open `http://localhost:8000/teacher.html` in your browser.

## Example client usage (in browser console or your JS code)

```js
// Save students array
await erpJsonApi.saveData('erp_students', [{id:'ST001',name:'Alice'},{id:'ST002',name:'Bob'}]);

// Get students
const students = await erpJsonApi.getData('erp_students');
console.log(students);
```

## curl examples

Save:

```powershell
curl -X POST "http://localhost:8000/save_data.php" -H "Content-Type: application/json" -d "{ \"key\": \"erp_students\", \"data\": [{\"id\":\"ST001\",\"name\":\"Alice\"} ] }"
```

Get:

```powershell
curl "http://localhost:8000/get_data.php?key=erp_students"
```

## Security notes

- These endpoints do not authenticate requests. Do not expose them publicly without adding authentication (JWT/session checks) and input validation.
- Files are written under `data/` in the project; ensure the directory is secure in production and not served directly if sensitive.
- Consider using a database for concurrent access and better integrity for production apps.

## Next steps you can ask me to do

- Add JWT-based protection wrapper (`require_jwt.php`) and example tokens.
- Add file upload / import/export UI in the admin pages.
- Switch to a small SQLite backend instead of file-based JSON for concurrency.
