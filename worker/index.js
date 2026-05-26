
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =====================================
    // HEALTH
    // =====================================

    if (url.pathname === "/api/health") {
      const result = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all();

      return json({
        ok: true,
        tables: result.results.map((row) => row.name),
      });
    }

    // =====================================
    // IMPORT CSV
    // =====================================

    if (
      url.pathname === "/api/import" &&
      request.method === "POST"
    ) {
      try {
        const formData = await request.formData();

        const file = formData.get("file");

        if (!file) {
          return json({ error: "No file uploaded" }, 400);
        }

        const csvText = await file.text();

        const records = parseCsv(csvText);
        const limitedRecords = records.slice(0, 50);

        let imported = 0;
        let duplicates = 0;
        let customersCreated = 0;

        for (const row of limitedRecords) {
          const transactionNumber = row["מספר עסקה"];
          const customerNumber = row["מספר לקוח"];

          if (!transactionNumber) continue;

          // =========================
          // DUPLICATE CHECK
          // =========================

          const existingTransaction = await env.DB.prepare(
            `
            SELECT id
            FROM transactions
            WHERE cardcom_transaction_number = ?
            `
          )
            .bind(transactionNumber)
            .first();

          if (existingTransaction) {
            duplicates++;
            continue;
          }

          // =========================
          // FIND / CREATE CUSTOMER
          // =========================

          let customer = await env.DB.prepare(
            `
            SELECT *
            FROM customers
            WHERE cardcom_customer_number = ?
            `
          )
            .bind(customerNumber)
            .first();

          if (!customer) {
            const result = await env.DB.prepare(
              `
              INSERT INTO customers (
                cardcom_customer_number,
                name,
                email,
                id_number,
                current_last4,
                monthly_amount
              )
              VALUES (?, ?, ?, ?, ?, ?)
              `
            )
              .bind(
                customerNumber,
                row["שם בעל הכרטיס"] || null,
                row["אימייל"] || null,
                row["ת.ז."] || null,
                row["4 ספרות אחרונות"] || null,
                row["סכום"] || null
              )
              .run();

            customer = {
              id: result.meta.last_row_id,
            };

            customersCreated++;
          }

          // =========================
          // RESPONSE CATEGORY
          // =========================

          const responseText = row["תשובה"] || "";

          let responseCategory = "UNKNOWN";

          if (
            responseText.includes("העסקה בוצעה בהצלחה")
          ) {
            responseCategory = "SUCCESS";
          } else if (
            responseText.includes("עסקת אישור תקינה") ||
            responseText.includes("עסקת בדיקה תקינה")
          ) {
            responseCategory = "IGNORE_TEST_AUTH";
          } else if (
            responseText.includes("הכרטיס אינו בתוקף") ||
            responseText.includes("מספר כרטיס שגוי") ||
            responseText.includes("חסום") ||
            responseText.includes("גנוב")
          ) {
            responseCategory = "CARD_REPLACE_REQUIRED";
          } else {
            responseCategory = "SOFT_DECLINE";
          }

          // =========================
          // INSERT TRANSACTION
          // =========================

          await env.DB.prepare(
            `
            INSERT INTO transactions (
              customer_id,
              cardcom_transaction_number,
              transaction_date,
              transaction_time,
              response_text,
              response_category,
              amount,
              last4,
              transaction_type,
              brand,
              cardholder_name,
              email,
              id_number,
              cardcom_customer_number,
              charge_location
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
            .bind(
              customer.id,
              transactionNumber,
              row["תאריך"] || null,
              row["שעה"] || null,
              responseText,
              responseCategory,
              row["סכום"] || null,
              row["4 ספרות אחרונות"] || null,
              row["סוג עסקה"] || null,
              row["מותג"] || null,
              row["שם בעל הכרטיס"] || null,
              row["אימייל"] || null,
              row["ת.ז."] || null,
              customerNumber,
              row["מקום ביצוע חיוב"] || null
            )
            .run();

          imported++;
        }

        return json({
          ok: true,
          imported,
          duplicates,
          customersCreated,
        });
      } catch (err) {
        return json({
          error: err.message,
          stack: err.stack,
        });
      }
    }

    return json({ error: "Not found" }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : "";
    });

    return row;
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}