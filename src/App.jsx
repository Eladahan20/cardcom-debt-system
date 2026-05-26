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

  if (loading) return <div className="loading">טוען...</div>;

  return (
    <div className="page">
      <h1>מערכת חייבים קארדקום</h1>

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
        />
      )}
    </div>
  );
}

function CasePanel({ item, details, loading, onClose }) {
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

  return <span className={`tx-badge tx-${category}`}>{map[category] || category}</span>;
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE_CARD_AUDIT: "במעקב",
    CARD_REPLACE_REQUIRED: "נדרש כרטיס חדש",
    CARD_REPLACED_WAITING_CHARGE: "החליף כרטיס",
    CLOSED_SUCCESS: "נסגר",
  };

  return <div className={`status status-${status}`}>{map[status] || status}</div>;
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).split(" ")[0];
}