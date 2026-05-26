export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      const result = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all();

      return json({
        ok: true,
        tables: result.results.map((row) => row.name),
      });
    }

    if (url.pathname === "/api/import" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return json({ error: "No file uploaded" }, 400);
        }

        const csvText = await file.text();
        const records = parseCsv(csvText);

        let imported = 0;
        let duplicates = 0;
        let customersCreated = 0;
        let newCases = 0;
        let updatedCases = 0;
        let closedCases = 0;
        let cardReplacementsDetected = 0;

        for (const row of records) {
          const transactionNumber = clean(row["מספר עסקה"]);
          const customerNumber = clean(row["מספר לקוח"]);

          if (!transactionNumber) continue;

          const existingTransaction = await env.DB.prepare(`
            SELECT id FROM transactions
            WHERE cardcom_transaction_number = ?
          `).bind(transactionNumber).first();

          if (existingTransaction) {
            duplicates++;
            continue;
          }

          let customer = await env.DB.prepare(`
            SELECT * FROM customers
            WHERE cardcom_customer_number = ?
          `).bind(customerNumber).first();

          if (!customer) {
            const result = await env.DB.prepare(`
              INSERT INTO customers (
                cardcom_customer_number,
                name,
                email,
                id_number,
                current_last4,
                monthly_amount
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
              customerNumber,
              clean(row["שם בעל הכרטיס"]) || null,
              clean(row["אימייל"]) || null,
              clean(row["ת.ז."]) || null,
              clean(row["4 ספרות אחרונות"]) || null,
              clean(row["סכום"]) || null
            ).run();

            customer = { id: result.meta.last_row_id };
            customersCreated++;
          }

          const responseText = clean(row["תשובה"]);
          const responseCategory = categorizeResponse(responseText);

          await env.DB.prepare(`
            INSERT INTO transactions (
              customer_id,
              cardcom_transaction_number,
              transaction_date,
              transaction_time,
              transaction_datetime,
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            customer.id,
            transactionNumber,
            clean(row["תאריך"]) || null,
            clean(row["שעה"]) || null,
            buildDateTime(row),
            responseText || null,
            responseCategory,
            clean(row["סכום"]) || null,
            clean(row["4 ספרות אחרונות"]) || null,
            clean(row["סוג עסקה"]) || null,
            clean(row["מותג"]) || null,
            clean(row["שם בעל הכרטיס"]) || null,
            clean(row["אימייל"]) || null,
            clean(row["ת.ז."]) || null,
            customerNumber,
            clean(row["מקום ביצוע חיוב"]) || null
          ).run();

          const caseStats = await processDebtCase(
            env,
            row,
            customer,
            responseCategory
          );

          newCases += caseStats.newCases;
          updatedCases += caseStats.updatedCases;
          closedCases += caseStats.closedCases;
          cardReplacementsDetected += caseStats.cardReplacementsDetected;

          imported++;
        }

        return json({
          ok: true,
          rowsParsed: records.length,
          imported,
          duplicates,
          customersCreated,
          newCases,
          updatedCases,
          closedCases,
          cardReplacementsDetected,
        });
      } catch (err) {
        return json({
          ok: false,
          error: err.message,
          stack: err.stack,
        }, 500);
      }
    }
    if (url.pathname === "/api/debt-cases" && request.method === "GET") {
  const result = await env.DB.prepare(`
    SELECT
      dc.id,
      dc.status,
      dc.first_failed_at,
      dc.last_failed_at,
      dc.failure_count,
      dc.last_failure_reason,
      dc.card_replaced,
      dc.card_replaced_at,
      dc.current_last4,
      dc.closed_at,

      c.cardcom_customer_number,
      c.name,
      c.email,
      c.id_number,
      c.monthly_amount

    FROM debt_cases dc
    JOIN customers c ON c.id = dc.customer_id
    WHERE dc.closed_at IS NULL
    ORDER BY dc.last_failed_at DESC
    LIMIT 1000
  `).all();

  return json({
    ok: true,
    total: result.results.length,
    cases: result.results,
  });
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

function clean(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\u00A0/g, " ")
    .trim();
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map(clean);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = clean(values[index]);
    });

    return row;
  });
}

function detectDelimiter(headerLine) {
  const candidates = [",", ";", "\t"];
  let bestDelimiter = ",";
  let bestCount = 0;

  for (const delimiter of candidates) {
    const count = splitCsvLine(headerLine, delimiter).length;

    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function splitCsvLine(line, delimiter = ",") {
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
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function categorizeResponse(responseText) {
  if (responseText.includes("העסקה בוצעה בהצלחה")) {
    return "SUCCESS";
  }

  if (
    responseText.includes("עסקת אישור תקינה") ||
    responseText.includes("עסקת בדיקה תקינה")
  ) {
    return "IGNORE_TEST_AUTH";
  }

  if (
    responseText.includes("הכרטיס אינו בתוקף") ||
    responseText.includes("מספר כרטיס שגוי") ||
    responseText.includes("חסום") ||
    responseText.includes("גנוב")
  ) {
    return "CARD_REPLACE_REQUIRED";
  }

  return "SOFT_DECLINE";
}

function isRecurringCharge(row) {
  return clean(row["מקום ביצוע חיוב"]) === "הוראת קבע";
}

function isLowProfile(row) {
  return clean(row["מקום ביצוע חיוב"]) === "דף פרופיל נמוך";
}

function isFailure(category) {
  return category === "SOFT_DECLINE" || category === "CARD_REPLACE_REQUIRED";
}

function isPositiveCardAction(category) {
  return category === "SUCCESS" || category === "IGNORE_TEST_AUTH";
}

function buildDateTime(row) {
  const date = clean(row["תאריך"]);
  const time = clean(row["שעה"]) || "00:00";

  const parts = date.split("/");
  if (parts.length !== 3) return null;

  const [day, month, year] = parts;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${time}`;
}

async function getOpenDebtCase(env, customerId) {
  return await env.DB.prepare(`
    SELECT *
    FROM debt_cases
    WHERE customer_id = ?
      AND closed_at IS NULL
    LIMIT 1
  `).bind(customerId).first();
}

async function createCaseEvent(env, caseId, customerId, type, text) {
  await env.DB.prepare(`
    INSERT INTO case_events (
      case_id,
      customer_id,
      event_type,
      event_text
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    caseId,
    customerId,
    type,
    text || null
  ).run();
}

async function processDebtCase(env, row, customer, responseCategory) {
  const transactionDateTime = buildDateTime(row);
  const last4 = clean(row["4 ספרות אחרונות"]);
  const responseText = clean(row["תשובה"]);

  const stats = {
    newCases: 0,
    updatedCases: 0,
    closedCases: 0,
    cardReplacementsDetected: 0,
  };

  const openCase = await getOpenDebtCase(env, customer.id);

  if (isRecurringCharge(row) && isFailure(responseCategory)) {
    if (!openCase) {
      const status =
        responseCategory === "CARD_REPLACE_REQUIRED"
          ? "CARD_REPLACE_REQUIRED"
          : "ACTIVE_CARD_AUDIT";

      const result = await env.DB.prepare(`
        INSERT INTO debt_cases (
          customer_id,
          status,
          first_failed_at,
          last_failed_at,
          first_failed_last4,
          current_last4,
          failure_count,
          last_failure_reason,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        customer.id,
        status,
        transactionDateTime,
        transactionDateTime,
        last4 || null,
        last4 || null,
        responseText || null
      ).run();

      await createCaseEvent(
        env,
        result.meta.last_row_id,
        customer.id,
        "CASE_OPENED",
        `נפתח תיק בעקבות כשל הוראת קבע: ${responseText}`
      );

      stats.newCases++;
    } else {
      const nextStatus =
        responseCategory === "CARD_REPLACE_REQUIRED"
          ? "CARD_REPLACE_REQUIRED"
          : openCase.status;

      await env.DB.prepare(`
        UPDATE debt_cases
        SET
          status = ?,
          last_failed_at = ?,
          current_last4 = ?,
          failure_count = failure_count + 1,
          last_failure_reason = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        nextStatus,
        transactionDateTime,
        last4 || openCase.current_last4,
        responseText || null,
        openCase.id
      ).run();

      await createCaseEvent(
        env,
        openCase.id,
        customer.id,
        "CASE_UPDATED_FAILED_TRANSACTION",
        `עודכן תיק בעקבות כשל נוסף: ${responseText}`
      );

      stats.updatedCases++;
    }
  }

  if (
    isRecurringCharge(row) &&
    responseCategory === "SUCCESS" &&
    openCase
  ) {
    await env.DB.prepare(`
      UPDATE debt_cases
      SET
        status = 'CLOSED_SUCCESS',
        last_success_at = ?,
        closed_at = ?,
        close_reason = 'Recurring charge succeeded',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      transactionDateTime,
      transactionDateTime,
      openCase.id
    ).run();

    await createCaseEvent(
      env,
      openCase.id,
      customer.id,
      "CASE_CLOSED_SUCCESS",
      "התיק נסגר בעקבות הוראת קבע שעברה בהצלחה"
    );

    stats.closedCases++;
  }

  if (
    isLowProfile(row) &&
    openCase &&
    isPositiveCardAction(responseCategory) &&
    last4 &&
    openCase.current_last4 &&
    last4 !== openCase.current_last4
  ) {
    await env.DB.prepare(`
      UPDATE debt_cases
      SET
        status = 'CARD_REPLACED_WAITING_CHARGE',
        card_replaced = 1,
        card_replaced_at = ?,
        current_last4 = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      transactionDateTime,
      last4,
      openCase.id
    ).run();

    await env.DB.prepare(`
      UPDATE customers
      SET
        previous_last4 = current_last4,
        current_last4 = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      last4,
      customer.id
    ).run();

    await createCaseEvent(
      env,
      openCase.id,
      customer.id,
      "CARD_REPLACED_DETECTED",
      `זוהתה החלפת כרטיס מ-${openCase.current_last4} ל-${last4}`
    );

    stats.cardReplacementsDetected++;
  }

  return stats;
}