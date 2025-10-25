# Seeding demo data

This project includes demo seed data for local development. The seeding populates localStorage keys and also includes server-side JSON files under `data/` so the included PHP endpoints (`get_data.php`/`save_data.php`) can return the same data.

What is seeded

- `erp_students` — 10 demo students (id, studentId, name, email, course, branch, semester, year, rollNo, attendancePct, subjects, status, enrollmentDate)
- `erp_examinations` — demo exam marks for those students
- `erp_attendance` — demo attendance records for those students

How the seeding works

- On first page load the client calls `loadSampleData()` (in `script.js`) which checks for existing arrays in localStorage and fills them if empty.
- After seeding localStorage, the client will attempt a non-blocking server sync using `erpJsonApi.saveData` (if available) to persist the demo data to `data/*.json` via `save_data.php`.

Resetting the demo data locally

1. Open browser devtools > Application > Local Storage > select the site.
2. Remove the keys: `erp_students`, `erp_examinations`, `erp_attendance`, and `erp_user_data`.
3. Reload any page in the app — `loadSampleData()` will seed the demo data again.

Persisting the demo data to the server manually

If you want to overwrite the `data/*.json` files on the server, you can either:

- Use the app (on first load it attempts a non-blocking save). Or,
- Use the included helper `js/json-api.js` from your browser console:

```javascript
// Example (run in browser console on the project pages):
(async function(){
  const students = JSON.parse(localStorage.getItem('erp_students')||'[]');
  await window.erpJsonApi.saveData('erp_students', students);
  const exams = JSON.parse(localStorage.getItem('erp_examinations')||'[]');
  await window.erpJsonApi.saveData('erp_examinations', exams);
  const attendance = JSON.parse(localStorage.getItem('erp_attendance')||'[]');
  await window.erpJsonApi.saveData('erp_attendance', attendance);
  console.log('Saved demo data to server');
})();
```

Notes

- The automatic server-sync is non-blocking and will not overwrite server files if the PHP endpoint is unavailable.
- The server files are plain JSON under `data/` and can be edited directly if desired.
