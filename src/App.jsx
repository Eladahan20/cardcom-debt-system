import { useEffect, useMemo, useState } from "react";

export default function App() {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseDetails, setCaseDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    try {
      const response = await fetch("http://localhost:8787/api/debt-cases");
      const data = await response.json();
      setCases(data.cases || []);
    } finally {
      setLoading(false);
    }
  }

  async function openCase(item) {
    setSelectedCase(item);
    setLoadingDetails(true);

    try {
      const response = await fetch(
        `http://localhost:8787/api/debt-cases/${item.id}`
      );
      const data = await response.json();
      setCaseDetails(data);
    } finally {
      setLoadingDetails(false);
    }
  }

  function closePanel() {
    setSelectedCase(null);
    setCaseDetails(null);
  }

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();

    return cases.filter((item) => {
      const matchesStatus =
        statusFilter === "ALL" || item.status === statusFilter;

      const searchable = [
        item.name,
        item.cardcom_customer_number,
        item.email,
        item.id_number,
        item.current_last4,
        item.last_failure_reason,
        item.recommended_action,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!q || searchable.includes(q));
    });
  }, [cases, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: cases.length,
      needsWhatsapp: cases.filter((x) =>
        x.recommended_action?.includes("וואטסאפ")
      ).length,
      needsCall: cases.filter((x) =>
        x.recommended_action?.includes("שיחה")
      ).length,
      cardReplaced: cases.filter(
        (x) => x.status === "CARD_REPLACED_WAITING_CHARGE"
      ).length,
      cardRequired: cases.filter(
        (x) => x.status === "CARD_REPLACE_REQUIRED"
      ).length,
    };
  }, [cases]);

  if (loading) return <div className="loading">טוען...</div>;

  return (
    <div className="page">
      <h1>מערכת חייבים קארדקום</h1>

      <ImportBox onImported={loadCases} />

      <div className="stats">
        <StatCard label="חייבים פעילים" value={stats.total} />
        <StatCard label="צריך וואטסאפ" value={stats.needsWhatsapp} />
        <StatCard label="צריך שיחה" value={stats.needsCall} />
        <StatCard label="החליפו כרטיס" value={stats.cardReplaced} />
        <StatCard label="נדרש כרטיס חדש" value={stats.cardRequired} />
      </div>

      <div className="toolbar">
        <input
          className="search"
          placeholder="חיפוש לפי שם, מספר לקוח, אימייל, ת.ז, 4 ספרות..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">כל הסטטוסים</option>
          <option value="ACTIVE_CARD_AUDIT">במעקב</option>
          <option value="CARD_REPLACE_REQUIRED">נדרש כרטיס חדש</option>
          <option value="CARD_REPLACED_WAITING_CHARGE">החליף כרטיס</option>
          <option value="WHATSAPP_SENT">נשלח וואטסאפ</option>
          <option value="PHONE_CALL_DONE">בוצעה שיחה</option>
          <option value="CUSTOMER_PROMISED_TO_UPDATE">הבטיח לעדכן</option>
        </select>

        <button className="refresh" onClick={loadCases}>
          רענון
        </button>

        <div className="results-count">
          מציג {filteredCases.length} מתוך {cases.length}
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>שם</th>
              <th>מספר לקוח</th>
              <th>סטטוס</th>
              <th>פעולה מומלצת</th>
              <th>ימים בחוב</th>
              <th>כשל אחרון</th>
              <th>כשלונות</th>
              <th>4 ספרות</th>
              <th>החליף כרטיס</th>
              <th>סיבה אחרונה</th>
            </tr>
          </thead>

          <tbody>
            {filteredCases.map((item) => (
              <tr
                key={item.id}
                className="clickable-row"
                onClick={() => openCase(item)}
              >
                <td className="name-cell">{item.name || "—"}</td>
                <td>{item.cardcom_customer_number}</td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td className="action-cell">{item.recommended_action}</td>
                <td>{item.days_in_debt ?? "—"}</td>
                <td>{formatDate(item.last_failed_at)}</td>
                <td>{item.failure_count}</td>
                <td>{item.current_last4 || "—"}</td>
                <td>{item.card_replaced ? "✅" : "—"}</td>
                <td className="reason">{item.last_failure_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCase && (
        <CasePanel
          item={selectedCase}
          details={caseDetails}
          loading={loadingDetails}
          onClose={closePanel}
          onChanged={loadCases}
        />
      )}
    </div>
  );
}

function ImportBox({ onImported }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function uploadFile() {
    if (!file) {
      alert("בחר קובץ CSV");
      return;
    }

    setImporting(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8787/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(data);

      if (data.ok) {
        await onImported();
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="import-box">
      <div>
        <h2>ייבוא קובץ עסקאות</h2>
        <p>בחר קובץ CSV מקארדקום והמערכת תעדכן לקוחות ותיקי חייבים.</p>
      </div>

      <div className="import-actions">
                {importing && (
        <div className="import-loader">
            <div className="spinner"></div>
            <div>
            מייבא את הקובץ ומחשב תיקי חייבים... זה יכול לקחת דקה או שתיים.
            </div>
        </div>
        )}
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <button onClick={uploadFile} disabled={importing}>
        {importing ? "מייבא קובץ, לא לסגור..." : "העלה וייבא"}
        </button>
      </div>

      {result && (
        <div className={result.ok ? "import-result ok" : "import-result error"}>
          {result.ok ? (
            <>
              נקלטו {result.imported} עסקאות, דולגו {result.duplicates} כפולות,
              נוצרו {result.customersCreated} לקוחות, נפתחו {result.newCases}{" "}
              תיקים, עודכנו {result.updatedCases}, נסגרו {result.closedCases}.
            </>
          ) : (
            <>שגיאה: {result.error}</>
          )}
        </div>
      )}
    </div>
  );
}

function CasePanel({ item, details, loading, onClose, onChanged }) {
  const debtCase = details?.case;
  const transactions = details?.transactions || [];
  const events = details?.events || [];

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="case-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2>{item.name || "לקוח ללא שם"}</h2>
            <div className="muted">מספר לקוח: {item.cardcom_customer_number}</div>
          </div>

          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="loading">טוען תיק...</div>
        ) : (
          <>
            <div className="details-grid">
              <Detail label="סטטוס" value={<StatusBadge status={debtCase?.status} />} />
              <Detail label="פעולה מומלצת" value={item.recommended_action} />
              <Detail label="אימייל" value={debtCase?.email || "—"} />
              <Detail label="ת.ז." value={debtCase?.id_number || "—"} />
              <Detail label="סכום חודשי" value={debtCase?.monthly_amount || "—"} />
              <Detail label="כשל ראשון" value={formatDate(debtCase?.first_failed_at)} />
              <Detail label="כשל אחרון" value={formatDate(debtCase?.last_failed_at)} />
              <Detail label="מספר כשלונות" value={debtCase?.failure_count} />
              <Detail label="כרטיס קודם" value={debtCase?.previous_last4 || "—"} />
              <Detail label="כרטיס נוכחי" value={debtCase?.current_last4 || "—"} />
              <Detail
                label="החליף כרטיס"
                value={debtCase?.card_replaced ? "כן ✅" : "לא"}
              />
              <Detail
                label="תאריך החלפה"
                value={formatDate(debtCase?.card_replaced_at)}
              />
            </div>

            <div className="actions-box">
              <h3>פעולות</h3>

              <div className="case-actions">
                <ActionButton
                  label="נשלח וואטסאפ"
                  type="WHATSAPP_SENT_MANUALLY"
                  item={item}
                  onChanged={onChanged}
                />

                <ActionButton
                  label="בוצעה שיחה"
                  type="PHONE_CALL_DONE"
                  item={item}
                  onChanged={onChanged}
                />

                <ActionButton
                  label="הבטיח לעדכן"
                  type="CUSTOMER_PROMISED_TO_UPDATE"
                  item={item}
                  onChanged={onChanged}
                />

                <ActionButton
                  label="סגור ידנית"
                  type="CASE_CLOSED_MANUALLY"
                  item={item}
                  onChanged={onChanged}
                  danger
                />

                <ActionButton
                  label="נטש"
                  type="CASE_CLOSED_ABANDONED"
                  item={item}
                  onChanged={onChanged}
                  danger
                />
              </div>
            </div>

            <h3>אירועים בתיק</h3>
            <div className="events-list">
              {events.length === 0 && <div className="empty">אין אירועים</div>}

              {events.map((event) => (
                <div className="event-item" key={event.id}>
                  <div className="event-date">{formatDate(event.created_at)}</div>
                  <div>
                    <strong>{event.event_type}</strong>
                    <div>{event.event_text}</div>
                  </div>
                </div>
              ))}
            </div>

            <h3>עסקאות אחרונות</h3>
            <div className="mini-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>מקום חיוב</th>
                    <th>תגובה</th>
                    <th>סכום</th>
                    <th>4 ספרות</th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{formatDate(tx.transaction_datetime)}</td>
                      <td>{tx.charge_location}</td>
                      <td>
                        <TransactionBadge category={tx.response_category} />
                        <div className="tx-response">{tx.response_text}</div>
                      </td>
                      <td>{tx.amount}</td>
                      <td>{tx.last4 || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, type, item, danger, onChanged }) {
  async function handleClick() {
    const note = prompt(`הערה עבור: ${label}`);

    if (note === null) return;

    await fetch(`http://localhost:8787/api/debt-cases/${item.id}/event`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event_type: type,
        event_text: note || label,
      }),
    });

    await onChanged?.();
    window.location.reload();
  }

  return (
    <button
      className={danger ? "action-button danger" : "action-button"}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-card">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value ?? "—"}</div>
    </div>
  );
}

function TransactionBadge({ category }) {
  const map = {
    SUCCESS: "הצלחה",
    SOFT_DECLINE: "כשל",
    CARD_REPLACE_REQUIRED: "דרוש כרטיס",
    IGNORE_TEST_AUTH: "בדיקה",
  };

  return (
    <span className={`tx-badge tx-${category}`}>
      {map[category] || category}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE_CARD_AUDIT: "במעקב",
    CARD_REPLACE_REQUIRED: "נדרש כרטיס חדש",
    CARD_REPLACED_WAITING_CHARGE: "החליף כרטיס",
    WHATSAPP_SENT: "נשלח וואטסאפ",
    PHONE_CALL_DONE: "בוצעה שיחה",
    CUSTOMER_PROMISED_TO_UPDATE: "הבטיח לעדכן",
    CLOSED_SUCCESS: "נסגר בהצלחה",
    CLOSED_MANUAL: "נסגר ידנית",
    CLOSED_ABANDONED: "נטש",
  };

  return <div className={`status status-${status}`}>{map[status] || status}</div>;
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).split(" ")[0];
}